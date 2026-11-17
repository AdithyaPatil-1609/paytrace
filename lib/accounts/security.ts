import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION = "paytrace_session";
export const FLOW = "paytrace_oauth_flow";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

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

/** Authenticated encryption: separate AAD namespaces for OAuth flow and mailbox credentials. */
export function seal(value: string, aad: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", accountConfig().key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(x => x.toString("base64url")).join(".");
}
export function open(value: string, aad: string) {
  const [iv, tag, data, ...rest] = value.split(".");
  if (!iv || !tag || !data || rest.length) throw new Error("Invalid encrypted value");
  const cipher = createDecipheriv("aes-256-gcm", accountConfig().key, Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(aad)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
}
export type Flow = { mode: "login" | "link"; state: string; nonce: string; verifier: string; expires: number; sub?: string; sessionHash?: string };
export function readFlow(value: string, state: string): Flow {
  const flow = JSON.parse(open(value, "oauth-flow")) as Flow;
  if (!flow.state || !equals(flow.state, state) || flow.expires < Date.now() || !["login", "link"].includes(flow.mode)) throw new Error("Invalid or expired OAuth flow");
  return flow;
}
