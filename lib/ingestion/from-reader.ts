/**
 * Turns the AI reader's fields (lib/assistant/message-reader.ts) into the
 * PaymentEvent that Neo4j stores, so Show 1 can go phone → AI → graph.
 * Only kinds the graph already understands become events; the rest wait for
 * Harshith's G cards. The message text itself is never stored: the event's
 * sourceId is a hash, which also makes the same SMS twice count once.
 */
import type { ReaderFields, MessageKind } from "@/lib/assistant/reader-shape";
import { digest, isDate, validateEvent, type EventKind, type PaymentEvent } from "./event";
import type { IncomingMessage } from "@/lib/assistant/message-reader";

const EVENT_KIND: Partial<Record<MessageKind, EventKind>> = {
  debit: "debit_posted",
  renewal: "debit_posted",
  mandate_created: "mandate_created",
  mandate_cancelled: "mandate_cancelled",
  upcoming_debit: "debit_scheduled",
  failed_debit: "debit_failed",
  price_change: "price_change",
  trial_ending: "trial_ending"
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Rs 1,499.00", "INR 649", "₹2,000" → paise. Null when the text holds no single clear amount. */
export function amountPaise(amountText: string | null): number | null {
  if (!amountText) return null;
  const numbers = amountText.match(/\d[\d,]*(?:\.\d{1,2})?/g);
  if (!numbers || numbers.length !== 1) return null;
  const rupees = Number(numbers[0].replaceAll(",", ""));
  return Number.isFinite(rupees) && rupees > 0 ? Math.round(rupees * 100) : null;
}

function iso(year: number, month: number, day: number) {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isDate(value) ? value : null;
}

/**
 * The date as written ("21-11-26", "21/11/2026", "10 Mar", "Nov 21, 2026",
 * "2026-11-21") → YYYY-MM-DD. Indian messages put the day first. A missing
 * year takes the year of the received date.
 */
export function parseDateText(dateText: string | null, receivedAt: string): string | null {
  if (!dateText) return null;
  const text = dateText.trim().toLowerCase();
  const receivedYear = Number(receivedAt.slice(0, 4));
  const fullYear = (value: string | undefined) =>
    value === undefined ? receivedYear : value.length === 2 ? 2000 + Number(value) : Number(value);

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return iso(Number(match[1]), Number(match[2]), Number(match[3]));
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/);
  if (match) return iso(fullYear(match[3]), Number(match[2]), Number(match[1]));
  match = text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]*([a-z]{3})[a-z]*[\s,-]*(\d{4}|\d{2})?\b/);
  if (match && MONTHS.includes(match[2])) return iso(fullYear(match[3]), MONTHS.indexOf(match[2]) + 1, Number(match[1]));
  match = text.match(/^([a-z]{3})[a-z]*[\s-]*(\d{1,2})(?:st|nd|rd|th)?[\s,]*(\d{4})?\b/);
  if (match && MONTHS.includes(match[1])) return iso(fullYear(match[3]), MONTHS.indexOf(match[1]) + 1, Number(match[2]));
  return null;
}

/** Keep only characters the graph accepts in a merchant name. */
function merchantName(value: string | null) {
  const cleaned = (value ?? "").replace(/[^A-Za-z0-9 .&*_'@/-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return /^[A-Za-z0-9]/.test(cleaned) ? cleaned : null;
}

export type EventFromReader =
  | { status: "event"; event: PaymentEvent }
  | { status: "skipped"; reason: "not_financial" | "not_tracked_yet" | "missing_fields" };

/** One read message → one PaymentEvent, or the reason there is none. */
export function eventFromFields(
  fields: ReaderFields,
  message: IncomingMessage,
  source: PaymentEvent["source"]
): EventFromReader {
  if (!fields.is_financial) return { status: "skipped", reason: "not_financial" };
  const kind = EVENT_KIND[fields.kind];
  if (!kind) return { status: "skipped", reason: "not_tracked_yet" };

  const reference = fields.reference && /^[A-Za-z0-9-]{3,80}$/.test(fields.reference) ? fields.reference : null;
  const candidate = {
    source,
    kind,
    merchant: merchantName(fields.merchant),
    amountPaise: amountPaise(fields.amount_text),
    date: parseDateText(fields.date_text, message.receivedAt) ?? message.receivedAt.slice(0, 10),
    reference,
    // A hash, never the text: the same message sent twice gets the same ID.
    sourceId: digest("reader", source, message.sender, message.receivedAt, message.text.trim()),
    ...(fields.account_last4 ? { accountHint: fields.account_last4 } : {})
  };
  try {
    return { status: "event", event: validateEvent(candidate) };
  } catch {
    return { status: "skipped", reason: "missing_fields" };
  }
}
