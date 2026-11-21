/**
 * The personal token an iPhone Shortcut sends with each bank SMS (plan card
 * U4). iOS lets no app read SMS, so a Shortcut automation posts each message;
 * this token says whose account it belongs to. Only its hash is stored.
 */
import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "@/lib/assistant/message-reader";
import { READER_LIMITS, SMS_INGEST_LIMITS } from "@/lib/payments/rules";

/** "pt_ios_" then 43 URL-safe characters (32 random bytes). */
export const IOS_TOKEN = /^pt_ios_[A-Za-z0-9_-]{43}$/;

export function newIosToken() {
  return `pt_ios_${randomBytes(32).toString("base64url")}`;
}

/** The token from "Authorization: Bearer <token>", or null when absent or malformed. */
export function bearerToken(request: Request) {
  const value = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  return value && IOS_TOKEN.test(value) ? value : null;
}


/**
 * Bank senders as an iPhone shows them: the DLT header (VM-HDFCBK), with or
 * without TRAI's -S/-T ending. Phone numbers and contact names are refused.
 */
export const IPHONE_SENDER = /^[A-Z]{2}-[A-Z0-9]{3,9}(?:-[ST])?$/;

export type ShortcutBodyCheck = { ok: true; message: IncomingMessage } | { ok: false; error: string };

/**
 * The Shortcut's body: {sender, text} and an optional receivedAt. A Shortcut
 * runs the moment the SMS arrives, so a missing time means now.
 */
export function checkShortcutBody(input: unknown, now = Date.now()): ShortcutBodyCheck {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Send sender and text" };
  const body = input as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["sender", "text", "receivedAt"].includes(key))) return { ok: false, error: "Unexpected field" };
  const sender = typeof body.sender === "string" ? body.sender.trim().toUpperCase() : "";
  if (!IPHONE_SENDER.test(sender)) return { ok: false, error: "Only registered bank and service senders are accepted" };
  const { text, receivedAt } = body;
  if (typeof text !== "string" || !text.trim() || text.length > READER_LIMITS.maxTextChars) return { ok: false, error: "Invalid message text" };
  let at = now;
  if (receivedAt !== undefined && receivedAt !== "") {
    at = typeof receivedAt === "string" && receivedAt.length <= 40 ? Date.parse(receivedAt) : NaN;
    if (!Number.isFinite(at)) return { ok: false, error: "Invalid receivedAt time" };
    if (at > now + SMS_INGEST_LIMITS.maxFutureSkewMs || at < now - SMS_INGEST_LIMITS.maxAgeMs) {
      return { ok: false, error: "receivedAt is outside the allowed window" };
    }
  }
  return { ok: true, message: { sender, text, receivedAt: new Date(at).toISOString() } };
}
