/**
 * The Paytrace assistant: one message in, one grounded reply out.
 *
 *   1. Secret filter. A message with an OTP or PIN stops here; no model sees it.
 *   2. A pasted bank alert goes to Job 3: the fine-tuned alert reader.
 *   3. A question goes to Job 1 (qwen3:14b) for its intent, merchant and period.
 *   4. The app works out the facts from the payment records (facts.ts).
 *   5. Job 2 (qwen3:14b) words those facts. Every number in its answer must
 *      appear in the facts; otherwise the fixed sentence is used instead.
 *
 * The model reads and words. It never calculates, stores or changes anything.
 */
import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";
import { ABOUT_PAYMENTS, factsFor, findPayments, findWatch, namedIn, OUT_OF_SCOPE, PRICE_QUESTION, priceChanges, recordsFor, type Facts, type Grounded, type Routed } from "./facts";
import { ALERT_ALT_MODEL, readAlertWith } from "./alert-reader";
import { alertChat, ALERT_MODEL, CHAT_MODEL, ollamaChat } from "./models";
import { ALERT_SCHEMA, ANSWER_PROMPT, INTENT_PROMPT, INTENT_SCHEMA, INTENTS, type Intent } from "./prompts";
import { hasSecret } from "./secrets";
import type { WatchItem } from "./watchlist";

export type AssistantReply = {
  reply: string;
  kind: "answer" | "alert" | "blocked" | "offline" | "out_of_scope";
  intent?: Intent;
  /** Payments the reply is about, so the panel can link to them. */
  payments: { id: string; name: string }[];
  /** Which model wrote the words, or null when a fixed sentence was used. */
  model: string | null;
  /** What the answer was about, sent back with the next message so "that's wrong" can be answered. */
  context?: Routed;
};

/** Beyond the payment table: subscriptions seen only in emails, and the question before this one. */
export type AskOptions = { watch?: WatchItem[]; context?: Routed | null; demo?: boolean };

/** "that's wrong", "YouTube is missing", "how did you get that": a challenge to the previous answer. */
export const CHALLENGE =
  /\b(?:wrong|incorrect|not (?:right|correct|true)|mistake|missing|left out|forgot|forgotten|explain|breakdown|break (?:it|that) down|how did you (?:get|calculate|work)|show (?:me )?(?:the )?(?:working|maths?|math|calculation|details))\b/i;

export const SOURCES_NOTE =
  "Paytrace counts only payments found in your synced Gmail and bank SMS. If one is still missing, use Rescan last 12 months under Sync Gmail at the top, then ask again.";

export const DEMO_SOURCES_NOTE = "This demo reads one made-up person's bank statement and notices, so only their payments are counted.";

/** Every line behind an answer, in the app's own words: the reply to a challenge. */
export function explain(grounded: Grounded, note = SOURCES_NOTE) {
  const facts = grounded.facts as Record<string, unknown>;
  if (!("total" in facts)) return `${grounded.fallback} ${note}`;
  type Line = { name: string; amount: string; date: string };
  const lines = (value: unknown) => (Array.isArray(value) ? (value as Line[]) : []);
  const join = (rows: Line[]) => rows.map((row) => `${row.name} ${row.amount} on ${row.date}`).join("; ");
  const counted = grounded.lines ?? lines(facts.payments).map((row) => `${row.name} ${row.amount} on ${row.date}`);
  const maybe = lines(facts.seen_only_in_emails_not_confirmed);
  const parts = [
    counted.length
      ? `${facts.total} for ${facts.period} is ${counted.join("; ")}.`
      : `Nothing confirmed is due in ${facts.period}.`,
    maybe.length ? `Seen only in emails, so not in that total: ${join(maybe)}${facts.total_if_these_also_go_out ? `. With ${maybe.length === 1 ? "it" : "them"}, ${facts.total_if_these_also_go_out}` : ""}.` : "",
    Array.isArray(facts.payments_with_no_fixed_date) ? `No fixed date, so not counted: ${(facts.payments_with_no_fixed_date as string[]).join(", ")}.` : "",
    Array.isArray(facts.older_subscriptions_not_counted) ? `Not counted, no recent email: ${(facts.older_subscriptions_not_counted as string[]).join("; ")}.` : "",
    note
  ];
  return parts.filter(Boolean).join(" ");
}

const NO_CONTEXT_CHALLENGE = "Tell me which answer looks wrong and what you expected, for example: YouTube is missing from next month.";

export const MAX_MESSAGE = 600;

export const BLOCKED_REPLY =
  "That message holds a one-time code or PIN, so I did not read it or send it anywhere. Never share it with anyone, including Paytrace.";

export const OFFLINE_REPLY =
  "The local Qwen model is not running, so I cannot answer right now. Start it with: ollama serve, then ask again.";

/* ---------------- Job 1: understand the question ---------------- */

export function parseRouted(raw: string): Routed | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    if (!INTENTS.includes(value.intent as Intent)) return null;
    const text = (field: unknown) => (typeof field === "string" && field.trim() ? field.trim().slice(0, 80) : null);
    return {
      intent: value.intent as Intent,
      merchant: text(value.merchant),
      amount: typeof value.amount === "number" && Number.isFinite(value.amount) ? value.amount : null,
      period: text(value.period)
    };
  } catch {
    return null;
  }
}

async function route(question: string) {
  const raw = await ollamaChat(
    [
      { role: "system", content: INTENT_PROMPT },
      { role: "user", content: question }
    ],
    INTENT_SCHEMA
  );
  return parseRouted(raw);
}

/* ---------------- Job 2: word the facts ---------------- */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const plain = (text: string) => text.replace(/,/g, "");

/**
 * An answer is used only if every number in it appears in the facts, it is
 * short (at most four sentences and 60 words), and it carries no links or
 * markdown. A star inside a word (GOOGLE*ONE) is a bank descriptor, not markdown.
 */
export function grounded(answer: string, facts: Facts) {
  const source = plain(JSON.stringify(facts));
  const numbers = answer.match(NUMBER) ?? [];
  const sentences = answer.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  return (
    answer.length > 0 &&
    answer.split(/\s+/).length <= 60 &&
    sentences <= 4 &&
    !/https?:|\*\*|`|(?:^|\n)\s*[-#*]\s/.test(answer) &&
    numbers.every((number) => source.includes(plain(number)))
  );
}

/** Most payments a worded total may cover; above this the app's own sentence is clearer. */
export const MAX_WORDED_PAYMENTS = 4;

/**
 * A total is worded by the model only if nothing is dropped: the total, the
 * total with email-only subscriptions, and every payment by name. "11
 * payments" with none named fails, and the app's own sentence is used.
 */
export function complete(answer: string, facts: Facts) {
  const text = plain(answer).toLowerCase();
  const has = (value: unknown) => typeof value !== "string" || text.includes(plain(value).replace(/^about /, "").toLowerCase());
  const named = (rows: unknown) => (Array.isArray(rows) ? (rows as { name: string }[]) : []).every((row) => text.includes(row.name.toLowerCase().split(/\s+/)[0]));
  const count = typeof facts.number_of_payments === "number" ? facts.number_of_payments : 0;
  return has(facts.total) && has(facts.total_if_these_also_go_out) && count <= MAX_WORDED_PAYMENTS && named(facts.payments) && named(facts.seen_only_in_emails_not_confirmed);
}

async function word(question: string, facts: Facts) {
  return ollamaChat([
    { role: "system", content: ANSWER_PROMPT },
    { role: "user", content: `Question: ${question}\nFacts: ${JSON.stringify(facts)}` }
  ]);
}

/* ---------------- Job 3: read a pasted alert ---------------- */

/** A pasted bank SMS or email, not a question about one. */
export function looksLikeAlert(text: string) {
  return (
    text.length >= 25 &&
    !/\?\s*$/.test(text) &&
    /(?:\brs\.?|\binr|₹)\s*[\d,]+/i.test(text) &&
    /\b(debited|credited|spent|charged|deducted|autopay|mandate|a\/c|acct|card|upi|umn|umrn|refund|scheduled)\b/i.test(text)
  );
}

const KIND_WORDS: Record<string, string> = {
  mandate_request: "a request to approve a new autopay",
  mandate_created: "a new autopay being set up",
  mandate_paused: "an autopay being paused",
  mandate_cancelled: "an autopay being cancelled",
  debit_scheduled: "a payment that will be taken soon",
  debit_posted: "money taken from your account",
  debit_failed: "a payment that failed",
  refund: "money coming back to you"
};

function describeAlert(event: Record<string, unknown>, items: Commitment[]) {
  const kind = String(event.kind);
  if (kind === "not_payment") return { reply: "That does not look like a payment alert, so there is nothing to read from it.", ids: [] as string[] };
  const parts = [`This is ${KIND_WORDS[kind] ?? "a payment alert"}`];
  if (typeof event.merchantText === "string") parts.push(`for ${event.merchantText}`);
  if (typeof event.amountPaise === "number") parts.push(`of ${formatINR(event.amountPaise / 100)}`);
  if (typeof event.dueOn === "string") parts.push(`due on ${formatDate(event.dueOn)}`);
  else if (typeof event.occurredOn === "string") parts.push(`on ${formatDate(event.occurredOn)}`);
  let reply = `${parts.join(" ")}.`;
  const details = [
    typeof event.accountHint === "string" ? `account ending ${event.accountHint}` : "",
    typeof event.reference === "string" ? `reference ${event.reference}` : ""
  ].filter(Boolean);
  if (details.length) reply += ` It shows ${details.join(" and ")}.`;
  const match = typeof event.merchantText === "string" ? findPayments(event.merchantText, items) : [];
  if (match.length === 1) reply += ` It matches your ${match[0].merchant} payment, ${formatINR(match[0].annualCost)} a year.`;
  else reply += " It does not match a payment I already track.";
  return { reply: `${reply} Nothing was saved.`, ids: match.length === 1 ? [match[0].id] : [] };
}

/* ---------------- the whole turn ---------------- */

// At most four links under a reply; the dashboard lists the rest.
const named = (ids: string[], items: Commitment[]) =>
  ids.slice(0, 4).flatMap((id) => {
    const item = items.find((entry) => entry.id === id);
    return item ? [{ id, name: item.merchant }] : [];
  });

export async function ask(message: string, items: Commitment[], asOf: string, options: AskOptions = {}): Promise<AssistantReply> {
  const text = message.trim().slice(0, MAX_MESSAGE);
  const watch = options.watch ?? [];

  // 1. Never let a secret reach any model.
  if (hasSecret(text)) return { reply: BLOCKED_REPLY, kind: "blocked", payments: [], model: null };

  // 2. A pasted alert: the fine-tuned reader first, the base model if it is not running.
  if (looksLikeAlert(text)) {
    try {
      const { event, model } = await readAlertWith(text, asOf, [
        { name: ALERT_MODEL, ask: alertChat },
        { name: ALERT_ALT_MODEL, ask: (messages) => ollamaChat(messages, ALERT_SCHEMA) }
      ]);
      if (event) {
        const { reply, ids } = describeAlert(event, items);
        return { reply, kind: "alert", payments: named(ids, items), model };
      }
      return { reply: "I could not read that alert. Paste the full message as it arrived.", kind: "alert", payments: [], model };
    } catch {
      return { reply: OFFLINE_REPLY, kind: "offline", payments: [], model: null };
    }
  }

  // 3. Understand the question.
  let routed: Routed | null;
  try {
    routed = await route(text);
  } catch {
    return { reply: OFFLINE_REPLY, kind: "offline", payments: [], model: null };
  }
  // Price rises are not one of Job 1's intents, so they are caught by their words.
  const priceQuestion = (!routed || routed.intent === "unknown") && PRICE_QUESTION.test(text);
  // "That's wrong": show every line behind the previous answer instead of a canned reply.
  if (!priceQuestion && (!routed || routed.intent === "unknown") && CHALLENGE.test(text)) {
    const note = options.demo ? DEMO_SOURCES_NOTE : SOURCES_NOTE;
    if (!options.context || options.context.intent === "unknown") return { reply: `${NO_CONTEXT_CHALLENGE} ${note}`, kind: "answer", intent: "unknown", payments: [], model: null };
    const previous = factsFor(options.context, items, asOf, watch);
    return { reply: explain(previous, note), kind: "answer", intent: options.context.intent, payments: named(previous.ids, items), model: null, context: options.context };
  }
  // Any other question about their own payments: answered from the full records, still number-checked.
  const unrouted = !priceQuestion && (!routed || routed.intent === "unknown");
  if (unrouted && !(ABOUT_PAYMENTS.test(text) || namedIn(text, items).length || findWatch(text, watch).length)) {
    return { reply: OUT_OF_SCOPE, kind: "out_of_scope", intent: "unknown", payments: [], model: null };
  }

  // 4. Work out the facts in code.
  const { facts, ids, fallback }: Grounded = priceQuestion ? priceChanges(items) : unrouted ? recordsFor(text, items, watch, asOf) : factsFor(routed!, items, asOf, watch, text);
  const context = priceQuestion || unrouted ? undefined : routed!;

  // 5. Word them, and keep the wording only if it is faithful to the facts.
  let reply = fallback;
  let model: string | null = null;
  // Two answers always use the app's own wording:
  // - cancel steps, because a reworded step can be wrong in a way no check catches
  //   (in testing, Qwen turned "the switch is not inside the app" into "check the app settings");
  // - "nothing is due", which the model tended to blur with the next payment.
  const intent = routed?.intent ?? "unknown";
  if (intent === "how_to_cancel" || facts.number_of_payments === 0) return { reply, kind: "answer", intent, payments: named(ids, items), model, context };
  try {
    const answer = await word(text, facts);
    // The completeness rule is for totals; a question about one payment needs only a faithful answer.
    if (grounded(answer, facts) && (!("total" in facts) || complete(answer, facts))) {
      reply = answer;
      model = CHAT_MODEL;
    }
  } catch {
    // The fixed sentence carries the same facts.
  }
  return { reply, kind: "answer", intent, payments: named(ids, items), model, context };
}
