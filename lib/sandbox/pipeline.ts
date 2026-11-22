/**
 * One sandbox message, through the same checks real messages get, with a
 * step-by-step trace for the screen:
 *   sender → size → secret filter → instruction filter → AI reader (Qwen)
 *   → word-for-word value check → payment event → duplicate check → saved.
 * Only the destination differs: the visitor's own in-memory sandbox.
 */
import { readMessage, type ReadResult, type IncomingMessage } from "@/lib/assistant/message-reader";
import { hasSecret } from "@/lib/assistant/secrets";
import { looksLikeInstructions } from "@/lib/assistant/verify-fields";
import { digest } from "@/lib/ingestion/event";
import { eventFromFields } from "@/lib/ingestion/from-reader";
import { REGISTERED_SENDER } from "@/lib/ingestion/sms-message";
import { READER_LIMITS, SANDBOX_LIMITS } from "@/lib/payments/rules";
import { sandboxView } from "./dataset";
import type { Sandbox, SandboxLogEntry, SandboxStep } from "./store";

export type SandboxInput = { channel: "sms" | "email"; sender: string; text: string };
export type SandboxOutcome = SandboxLogEntry & { fields?: unknown; removed?: string[] };

const EMAIL_SENDER = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

const holder = globalThis as unknown as { __paytraceSandboxReader?: { waiting: number; queue: Promise<unknown> } };
const reader = (holder.__paytraceSandboxReader ??= { waiting: 0, queue: Promise.resolve() });

/** One AI read at a time: the laptop GPU serves a queue better than a crowd. */
function inTurn<T>(work: () => Promise<T>): Promise<T> | null {
  if (reader.waiting >= SANDBOX_LIMITS.maxWaitingForReader) return null;
  reader.waiting += 1;
  const run = () => work().finally(() => { reader.waiting -= 1; });
  const next = reader.queue.then(run, run);
  reader.queue = next.catch(() => undefined);
  return next;
}

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export async function processSandboxMessage(
  box: Sandbox,
  input: SandboxInput,
  read: (message: IncomingMessage) => Promise<ReadResult> = readMessage
): Promise<SandboxOutcome> {
  box.counter += 1;
  const n = box.counter;
  const sender = input.sender.trim();
  const text = input.text.trim();
  // The sandbox clock: each new message arrives the day after the latest data.
  const receivedOn = nextDay(sandboxView(box).asOf);
  const steps: SandboxStep[] = [];
  const entry = (accepted: boolean, summary: string, extra: Partial<SandboxOutcome> = {}): SandboxOutcome => {
    const logged: SandboxLogEntry = { n, at: receivedOn, channel: input.channel, sender, preview: text.slice(0, 140), accepted, summary, steps };
    box.log.unshift(logged);
    return { ...logged, ...extra };
  };
  const pass = (name: string, detail: string) => steps.push({ name, ok: true, detail });
  const stop = (name: string, detail: string, summary: string, extra: Partial<SandboxOutcome> = {}) => {
    steps.push({ name, ok: false, detail });
    return entry(false, summary, extra);
  };

  if (input.channel === "sms") {
    if (!REGISTERED_SENDER.test(sender)) return stop("Sender check", `"${sender}" is not a registered bank sender ID (like AX-HDFCBK-S). Ordinary phone numbers can pose as banks, so they are dropped.`, "Refused: not a registered bank sender");
    pass("Sender check", `${sender} has the registered (DLT) bank sender format.`);
  } else {
    if (!EMAIL_SENDER.test(sender)) return stop("Sender check", `"${sender}" is not a valid email address.`, "Refused: not a valid email sender");
    pass("Sender check", `${sender} is a valid email address.`);
  }

  if (!text) return stop("Size check", "The message is empty.", "Refused: empty message");
  if (text.length > READER_LIMITS.maxTextChars) return stop("Size check", `${text.length.toLocaleString("en-IN")} characters; the limit is ${READER_LIMITS.maxTextChars.toLocaleString("en-IN")}. Long text is refused before any AI sees it.`, "Refused: message too long");
  pass("Size check", `${text.length} characters, under the ${READER_LIMITS.maxTextChars} limit.`);

  if (hasSecret(text)) return stop("Secret filter", "This looks like a one-time password, PIN, CVV or password. Paytrace never reads or keeps these; on a real phone it never leaves the phone.", "Dropped: contains a password or OTP");
  pass("Secret filter", "No OTP, PIN, CVV or password.");

  if (looksLikeInstructions(text)) return stop("Instruction filter", "The text gives orders to an AI (prompt injection). No real bank alert does that, so it is dropped before any model reads it.", "Dropped: prompt injection attempt");
  pass("Instruction filter", "No instructions aimed at the AI.");

  const key = digest("sandbox", input.channel, sender.toLowerCase(), text);
  if (box.events.some(item => item.key === key)) return stop("Duplicate check", "The exact same message was already received, so it is counted once.", "Ignored: duplicate message");
  pass("Duplicate check", "First time this message is seen.");

  const message: IncomingMessage = { text, sender, receivedAt: `${receivedOn}T10:00:00.000+05:30` };
  const queued = inTurn(() => read(message));
  if (!queued) return stop("AI reader", "The AI reader is busy with other people. Try again in a few seconds.", "Busy: try again");
  const result = await queued;

  if (result.status === "dropped") return stop("AI reader", `Dropped before reading: ${result.reason}.`, "Dropped");
  if (result.status === "unreadable") {
    return stop("AI reader", result.reason === "model_down"
      ? "The AI reader is offline right now, so this message was not read. PayTrace never guesses, so nothing was saved. Try again in a minute."
      : "The AI's reply did not match the fixed form, so it was refused rather than repaired by guessing.", "Could not read");
  }
  pass("AI reader", `Read as "${result.fields.kind}"${result.fields.merchant ? ` from ${result.fields.merchant}` : ""}${result.fields.amount_text ? `, ${result.fields.amount_text}` : ""}.`);

  const removed = result.removed ?? [];
  steps.push(removed.length
    ? { name: "Word-for-word value check", ok: true, detail: `Removed ${removed.join(", ")}: not found in the message text. Only values written in the message are kept.` }
    : { name: "Word-for-word value check", ok: true, detail: "Every value the AI returned appears in the message." });

  const built = eventFromFields(result.fields, message, input.channel);
  if (built.status === "skipped") {
    const why = built.reason === "not_financial" ? "This is not about a payment (an offer, a promotion or a balance alert), so nothing is stored."
      : built.reason === "not_tracked_yet" ? `"${result.fields.kind}" messages are read but not tracked as payments yet.`
      : "A required value (merchant, amount or date) is missing or was removed by the value check, so nothing is stored rather than guessing.";
    return stop("Payment event", why, built.reason === "not_financial" ? "Read: not a payment" : "Read: not stored", { fields: result.fields, removed });
  }
  const event = built.event;
  pass("Payment event", `${event.kind.replaceAll("_", " ")} · ${event.merchant}${event.amountPaise == null ? "" : ` · ₹${(event.amountPaise / 100).toLocaleString("en-IN")}`} · ${event.date}`);

  box.events.push({ n, receivedOn, channel: input.channel, sender, text, event, key });
  pass("Saved to your sandbox", "Added to your private copy. The five screens and the warnings now include it.");
  return entry(true, `${event.kind.replaceAll("_", " ")}: ${event.merchant}`, { fields: result.fields, removed });
}
