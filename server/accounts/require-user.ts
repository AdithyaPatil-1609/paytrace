/**
 * requireUser(): the one way a route handler learns who is signed in (plan
 * card S3). It checks the request came from our own site, then reads the
 * session from its cookie. Every query that follows starts from the returned
 * user, never from an id the browser sent.
 */
import type { NextRequest } from "next/server";
import { accountForSession, type Account } from "@/neo4j/accounts";
import { sameOrigin, SESSION } from "@/server/accounts/security";

export type RequiredUser = { ok: true; user: Account } | { ok: false; response: Response };

const deny = (status: number, error: string): RequiredUser => ({
  ok: false,
  response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } })
});

export async function requireUser(request: NextRequest, { checkOrigin = true } = {}): Promise<RequiredUser> {
  if (checkOrigin && !sameOrigin(request)) return deny(403, "Forbidden");
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    return user ? { ok: true, user } : deny(401, "Sign in first");
  } catch {
    return deny(503, "Account storage unavailable; retry");
  }
}
