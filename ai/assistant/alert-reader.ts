/**
 * Job 3 in the app: one pasted bank alert into PaymentEvent JSON. The same
 * prompt, JSON parsing and guardrails as ai/training/alerts.py (v2), so the app reads
 * alerts exactly the way the fine-tuned adapter was scored.
 */
import type { ChatMessage } from "./models";
import { ALERT_KINDS, ALERT_PROMPT, type AlertKind } from "./prompts";

export const ALERT_ALT_MODEL = "qwen3:14b (base)";

type Reader = { name: string; ask: (messages: ChatMessage[]) => Promise<string> };

/** The JSON object in a reply, tolerating code fences or stray text around it. */
export function parseEvent(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** The spec's own rules, enforced in code rather than trusted to the model (clean() in alerts.py). */
export function cleanEvent(event: Record<string, unknown> | null) {
  if (!event || !ALERT_KINDS.includes(event.kind as AlertKind)) return null;
  if (event.kind === "not_payment") return Object.fromEntries(Object.keys(event).map((key) => [key, key === "kind" ? "not_payment" : null]));
  if (event.kind !== "debit_scheduled") event.dueOn = null;
  return event;
}

/** Tries each reader in turn; the first that answers is used. Throws only if none is reachable. */
export async function readAlertWith(message: string, receivedOn: string, readers: Reader[]) {
  const messages: ChatMessage[] = [
    { role: "system", content: ALERT_PROMPT },
    { role: "user", content: `Received ${receivedOn}. ${message}` }
  ];
  let lastError: unknown;
  for (const reader of readers) {
    try {
      const raw = await reader.ask(messages);
      return { event: cleanEvent(parseEvent(raw)), model: reader.name };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No alert reader is running");
}
