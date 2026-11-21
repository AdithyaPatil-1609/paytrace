import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION = "paytrace_session";
export const FLOW = "paytrace_oauth_flow";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
/**
 * Session lifetime. Sign-in is with Google, so there is no password to type,
 * which makes short sessions important: a session ends 12 hours after sign-in
 * whatever happens, and after 30 minutes without use. The person then signs in
 * with Google again.
 */
export const SESSION_SECONDS = 12 * 60 * 60;
/** A session not used for this long ends, even before its 12 hours are up. */
export const SESSION_IDLE_SECONDS = 30 * 60;
/** A session older than this gets a fresh token on its next account request; the old one stops a minute later. */
export const SESSION_ROTATE_SECONDS = 2 * 60 * 60;

export function accountConfig() {
  const { GOOGLE_WEB_CLIENT_ID: clientId, GOOGLE_WEB_CLIENT_SECRET: clientSecret, PAYTRACE_AUTH_KEY: key, PAYTRACE_APP_URL: url } = process.env;
  if (!clientId || !clientSecret || !key || !/^[0-9a-f]{64}$/i.test(key) || !url) throw new Error("Account authentication is not configured");
  const origin = new URL(url);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))) throw new Error("Invalid app origin");
  return { clientId, clientSecret, key: Buffer.from(key, "hex"), origin: origin.origin, redirect: `${origin.origin}/api/auth/google/callback`, secure: origin.protocol === "https:" };
}
export function accountConfigured() { try { accountConfig(); return true; } catch { return false; } }
export const randomToken = () => randomBytes(32).toString("base64url");
export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const profileFor = (sub: string) => `google-${hash(sub)}`;
export const equals = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
export function cookieOptions(maxAge: number) { return { httpOnly: true, secure: accountConfig().secure, sameSite: "lax" as const, path: "/", maxAge }; }
export function sameOrigin(request: Request) { try { return request.headers.get("origin") === accountConfig().origin; } catch { return false; } }

/**
 * Authenticated encryption: separate AAD namespaces for OAuth flow and mailbox credentials.
 * Every sealed value names its key version ("k1.iv.tag.data"), so the key can be
 * rotated (plan card S6): set the new key as PAYTRACE_AUTH_KEY with a new
 * PAYTRACE_AUTH_KEY_ID, and move the old one to PAYTRACE_AUTH_KEY_PREVIOUS with
 * its id in PAYTRACE_AUTH_KEY_PREVIOUS_ID. Values sealed before versions existed
 * ("iv.tag.data") are read with the current key, then the previous one.
 */
const KEY_ID = /^[A-Za-z0-9]{1,8}$/;
function keyring() {
  const current = { id: process.env.PAYTRACE_AUTH_KEY_ID || "1", key: accountConfig().key };
  if (!KEY_ID.test(current.id)) throw new Error("Invalid PAYTRACE_AUTH_KEY_ID");
  const keys = [current];
  const previous = process.env.PAYTRACE_AUTH_KEY_PREVIOUS, previousId = process.env.PAYTRACE_AUTH_KEY_PREVIOUS_ID;
  if (previous && /^[0-9a-f]{64}$/i.test(previous) && previousId && KEY_ID.test(previousId) && previousId !== current.id) keys.push({ id: previousId, key: Buffer.from(previous, "hex") });
  return keys;
}
function decrypt(key: Buffer, iv: string, tag: string, data: string, aad: string) {
  const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
}
export function seal(value: string, aad: string) {
  const { id, key } = keyring()[0];
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [`k${id}`, ...[iv, cipher.getAuthTag(), data].map(x => x.toString("base64url"))].join(".");
}
export function open(value: string, aad: string) {
  const parts = value.split(".");
  const keys = keyring();
  if (parts.length === 4 && parts[0].startsWith("k")) {
    const [version, iv, tag, data] = parts;
    const match = keys.find(k => `k${k.id}` === version);
    if (!match || !iv || !tag || !data) throw new Error("Invalid encrypted value");
    return decrypt(match.key, iv, tag, data, aad);
  }
  const [iv, tag, data, ...rest] = parts;
  if (!iv || !tag || !data || rest.length) throw new Error("Invalid encrypted value");
  for (const { key } of keys) { try { return decrypt(key, iv, tag, data, aad); } catch { /* try the next key */ } }
  throw new Error("Invalid encrypted value");
}
export type Flow = { mode: "login" | "link"; state: string; nonce: string; verifier: string; expires: number; sub?: string; sessionHash?: string };
export function readFlow(value: string, state: string): Flow {
  const flow = JSON.parse(open(value, "oauth-flow")) as Flow;
  if (!flow.state || !equals(flow.state, state) || flow.expires < Date.now() || !["login", "link"].includes(flow.mode)) throw new Error("Invalid or expired OAuth flow");
  return flow;
}
