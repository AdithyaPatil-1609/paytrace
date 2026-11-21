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

/**
 * The token from the Authorization header, or null when absent or malformed.
 * Typed on a phone, so small slips are forgiven: any case of "Bearer", a
 * missing space after it, stray spaces, quotes, or the token on its own.
 * The token itself must still match exactly.
 */
export function bearerToken(request: Request) {
  const value = (request.headers.get("authorization") ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^bearer\s*/i, "")
    .trim();
  return IOS_TOKEN.test(value) ? value : null;
}


/**
 * What a refused Authorization header looked like, without revealing it:
 * its length, whether it starts with pt_ios_, and any characters a token can
 * never contain. Lets a person spot a cut-off paste or a changed character.
 */
export function describeHeader(request: Request) {
  const value = (request.headers.get("authorization") ?? "").trim().replace(/^["']|["']$/g, "").replace(/^bearer\s*/i, "").trim();
  const odd = [...new Set([...value].filter((char) => !/[A-Za-z0-9_-]/.test(char)))]
    .slice(0, 5)
    .map((char) => (/\s/.test(char) ? "a space or line break" : `"${char}" (U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`));
  const parts = [
    `After "Bearer" it has ${value.length} characters; a token has 50.`,
    value.startsWith("pt_ios_") ? "It starts with pt_ios_ (good)." : "It does not start with pt_ios_.",
    ...(odd.length ? [`It contains characters a token never has: ${odd.join(", ")}.`] : [])
  ];
  return parts.join(" ");
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
