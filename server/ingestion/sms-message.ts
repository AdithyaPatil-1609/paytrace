/**
 * The live SMS path after the route's cheap checks: check the phone's
 * {sender, text, receivedAt} body, let the AI reader turn the text into
 * fields, and store the PaymentEvent in Neo4j. The text is never stored or
 * logged; logs carry only the outcome and the kind.
 */
import { readMessage, type IncomingMessage, type ReadResult } from "@/ai/assistant/message-reader";
import { READER_LIMITS, SMS_INGEST_LIMITS } from "@/server/payments/rules";
import { eventFromFields } from "./from-reader";
import type { PaymentEvent } from "./event";

/** The same rule as the phone (android BankSenders.kt): DLT header with a -S or -T ending, e.g. VM-HDFCBK-S. */
export const REGISTERED_SENDER = /^[A-Z]{2}-[A-Z0-9]{3,9}-[ST]$/;

export type SmsBodyCheck = { ok: true; message: IncomingMessage } | { ok: false; error: string };

/** Checks the phone's body exactly. Nothing else is accepted, and nothing is repaired. */
export function checkSmsBody(input: unknown, now = Date.now()): SmsBodyCheck {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Send sender, text and receivedAt" };
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["sender", "text", "receivedAt"].includes(key))) {
    return { ok: false, error: "Unexpected field" };
  }
  const { sender, text, receivedAt } = body;
  if (typeof sender !== "string" || !REGISTERED_SENDER.test(sender.trim().toUpperCase())) {
    return { ok: false, error: "Only registered bank and service senders are accepted" };
  }
  if (typeof text !== "string" || !text.trim() || text.length > READER_LIMITS.maxTextChars) {
    return { ok: false, error: "Invalid message text" };
  }
  const at = typeof receivedAt === "string" && receivedAt.length <= 40 ? Date.parse(receivedAt) : NaN;
  if (!Number.isFinite(at)) return { ok: false, error: "Invalid receivedAt time" };
  if (at > now + SMS_INGEST_LIMITS.maxFutureSkewMs || at < now - SMS_INGEST_LIMITS.maxAgeMs) {
    return { ok: false, error: "receivedAt is outside the allowed window" };
  }
  return {
    ok: true,
    message: { sender: sender.trim().toUpperCase(), text, receivedAt: new Date(at).toISOString() }
  };
}

export type SmsOutcome =
  | { status: "stored"; kind: PaymentEvent["kind"]; result: unknown }
  | { status: "dropped" | "skipped"; reason: string }
  | { status: "unreadable"; reason: string }
  | { status: "store_failed" };

type Deps = {
  read?: (message: IncomingMessage) => Promise<ReadResult>;
  store: (profile: string, event: PaymentEvent) => Promise<unknown>;
};

/** One SMS, end to end: AI reader → PaymentEvent → Neo4j. */
export async function processSms(profile: string, message: IncomingMessage, deps: Deps): Promise<SmsOutcome> {
  const read = await (deps.read ?? readMessage)(message);
  if (read.status === "dropped") return { status: "dropped", reason: read.reason };
  if (read.status === "unreadable") return { status: "unreadable", reason: read.reason };
  const built = eventFromFields(read.fields, message, "sms");
  if (built.status === "skipped") return { status: "skipped", reason: built.reason };
  try {
    return { status: "stored", kind: built.event.kind, result: await deps.store(profile, built.event) };
  } catch {
    return { status: "store_failed" };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * processSms with retries for the two failures that fix themselves: Qwen
 * down, and Neo4j unreachable. A retried SMS keeps its hash ID, so it can
 * never be stored twice. Runs after the phone already has its answer.
 */
export async function processSmsWithRetry(
  profile: string,
  message: IncomingMessage,
  deps: Deps,
  delays: readonly number[] = SMS_INGEST_LIMITS.retryDelaysMs,
  sleep: (ms: number) => Promise<unknown> = wait
): Promise<SmsOutcome> {
  let outcome = await processSms(profile, message, deps);
  for (const delay of delays) {
    const retryable = outcome.status === "store_failed" || (outcome.status === "unreadable" && outcome.reason === "model_down");
    if (!retryable) break;
    await sleep(delay);
    outcome = await processSms(profile, message, deps);
  }
  // Outcome and kind only: never the text, the merchant or the amount.
  console.info(`ingest/sms: ${outcome.status}${"kind" in outcome ? ` ${outcome.kind}` : ""}${"reason" in outcome ? ` (${outcome.reason})` : ""}`);
  return outcome;
}
