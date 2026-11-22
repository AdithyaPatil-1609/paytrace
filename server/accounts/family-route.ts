/**
 * Shared plumbing for the /api/family routes: rate limit, same-origin check,
 * the signed-in user from the session (never an id from the browser), and a
 * strict JSON body. Every answer is no-store, so no browser or proxy keeps a
 * copy after access is revoked.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Account } from "@/neo4j/accounts";
import { requireUser } from "@/server/accounts/require-user";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

/** An invite token: 32 random bytes, base64url (server/accounts/security.ts randomToken). */
export const Token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function familyRequest<T>(request: NextRequest, name: string, body: z.ZodType<T> | null): Promise<{ ok: true; user: Account; data: T } | { ok: false; response: Response }> {
  const hit = takeHit(`family-${name}`, clientKey(request), LIMITS.family);
  if (!hit.ok) return { ok: false, response: tooMany(hit.retryAfter) };
  const signedIn = await requireUser(request, { checkOrigin: request.method !== "GET" });
  if (!signedIn.ok) return signedIn;
  if (!body) return { ok: true, user: signedIn.user, data: undefined as T };
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { ok: false, response: json({ ok: false, error: "Invalid request" }, 400) };
  return { ok: true, user: signedIn.user, data: parsed.data };
}
