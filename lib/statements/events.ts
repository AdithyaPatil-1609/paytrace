/**
 * Turns the debit lines of an imported bank statement into payment events for
 * the signed-in person's own graph (source "statement"). Credits (salary,
 * refunds, transfers in) are not spending and are left out. Each line gets a
 * stable id, so importing the same file twice adds nothing.
 */
import { digest, isSensitive, validateEvent, type PaymentEvent } from "@/lib/ingestion/event";
import type { StatementLine } from "./csv";

/** A statement description as a merchant name the graph accepts. */
export function merchantFromNarration(narration: string) {
  const cleaned = narration.replace(/[^A-Za-z0-9 .&*+_'@/-]/g, " ").replace(/\s+/g, " ").trim().replace(/^[^A-Za-z0-9]+/, "").slice(0, 80).trim();
  return cleaned && !isSensitive(cleaned) ? cleaned : null;
}

export function statementEvents(lines: StatementLine[]) {
  const events: PaymentEvent[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  for (const line of lines) {
    if (line.type !== "DEBIT") continue;
    const merchant = merchantFromNarration(line.narration);
    if (!merchant) { skipped++; continue; }
    const base = digest("statement", line.date, line.narration, line.amount, line.reference);
    // Two identical lines on one day (two real coffees) stay two payments.
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    try {
      events.push(validateEvent({ source: "statement", kind: "debit_posted", merchant, amountPaise: Math.round(line.amount * 100), date: line.date, reference: null, sourceId: digest(base, occurrence).slice(0, 40) }));
    } catch { skipped++; }
  }
  return { events, skipped };
}
