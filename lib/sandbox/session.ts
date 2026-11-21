/**
 * The sandbox cookie. It holds only a random id; the sandbox itself lives in
 * this server's memory and disappears after two idle hours.
 */
import { randomBytes } from "node:crypto";
import { SANDBOX_LIMITS } from "@/lib/payments/rules";

export const SANDBOX_COOKIE = "paytrace_sandbox";
const ID = /^[0-9a-f]{32}$/;

export const newSandboxId = () => randomBytes(16).toString("hex");
export const validSandboxId = (value: string | undefined): value is string => Boolean(value && ID.test(value));

export function sandboxCookieOptions() {
  const secure = (process.env.PAYTRACE_APP_URL ?? "").startsWith("https:");
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: Math.floor(SANDBOX_LIMITS.idleMs / 1000) };
}
