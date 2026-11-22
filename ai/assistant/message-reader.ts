/**
 * The AI reader, first version (card U1). The server sends one message's text,
 * sender and time to Qwen (qwen3:14b on Ollama, thinking off, temperature 0),
 * forces the reply into a fixed JSON shape, and checks it with Zod.
 * No fixed text rules read the message: the AI reads, the code checks.
 */
import { READER_LIMITS } from "@/server/payments/rules";
import { CHAT_MODEL, ollamaChat, type ChatMessage } from "./models";
import { READER_PROMPT } from "./prompts";
import { READER_JSON_SCHEMA, ReaderFieldsSchema, type ReaderFields } from "./reader-shape";
import { hasSecret } from "./secrets";
import { keepGroundedFields, looksLikeInstructions } from "./verify-fields";

export type IncomingMessage = {
  text: string;
  /** Who sent it: a bank header such as VM-HDFCBK-S, or an email domain. */
  sender: string;
  /** When the phone or Gmail received it, as an ISO time. */
  receivedAt: string;
};

export type ReadResult =
  | { status: "read"; fields: ReaderFields; model: string; removed?: string[] }
  | { status: "dropped"; reason: "empty" | "too_long" | "secret" | "suspicious" }
  | { status: "unreadable"; reason: "model_down" | "bad_reply"; model: string };

type Ask = (messages: ChatMessage[], format: object) => Promise<string>;

/** Qwen sometimes writes "XX4417" for the account; keep only the last four digits. */
function lastFour(value: unknown) {
  if (typeof value !== "string") return value;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Parse and check one model reply. Anything outside the fixed shape is refused, never repaired by guessing. */
export function checkReply(raw: string): ReaderFields | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const reply = { ...(value as Record<string, unknown>) };
  if ("account_last4" in reply) reply.account_last4 = lastFour(reply.account_last4);
  const parsed = ReaderFieldsSchema.safeParse(reply);
  if (!parsed.success) return null;
  const fields = parsed.data;
  // Not about money: nothing else may be kept from it.
  if (!fields.is_financial || fields.kind === "other") {
    return {
      is_financial: false,
      kind: "other",
      merchant: null,
      amount_text: null,
      date_text: null,
      reference: null,
      account_last4: null,
      upi_id: null
    };
  }
  return fields;
}

/**
 * Reads one message. Cheap checks first: size, then the secret filter, so an
 * OTP, PIN or password message never reaches any model. The caller deletes
 * the text afterwards and never logs it.
 */
export async function readMessage(message: IncomingMessage, ask: Ask = ollamaChat): Promise<ReadResult> {
  const text = message.text.trim();
  if (!text) return { status: "dropped", reason: "empty" };
  if (text.length > READER_LIMITS.maxTextChars || message.sender.length > READER_LIMITS.maxSenderChars) {
    return { status: "dropped", reason: "too_long" };
  }
  if (hasSecret(text)) return { status: "dropped", reason: "secret" };
  // Prompt injection: a message that gives orders to an AI is never read by one.
  if (looksLikeInstructions(text)) return { status: "dropped", reason: "suspicious" };

  const messages: ChatMessage[] = [
    { role: "system", content: READER_PROMPT },
    // JSON keeps the message clearly separate from our own words.
    { role: "user", content: JSON.stringify({ sender: message.sender, received_at: message.receivedAt, text }) }
  ];

  let raw: string;
  try {
    raw = await ask(messages, READER_JSON_SCHEMA);
  } catch {
    return { status: "unreadable", reason: "model_down", model: CHAT_MODEL };
  }
  const fields = checkReply(raw);
  if (!fields) return { status: "unreadable", reason: "bad_reply", model: CHAT_MODEL };
  // Every value must appear word for word in the message; anything else is removed.
  const grounded = keepGroundedFields(fields, text);
  return { status: "read", fields: grounded.fields, model: CHAT_MODEL, ...(grounded.removed.length ? { removed: grounded.removed } : {}) };
}
