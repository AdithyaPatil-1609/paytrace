/**
 * POST /api/account/merchants/similar { a, b, decision }: the signed-in person
 * says whether two of their merchants are the same one. The profile comes from
 * the session only, and the pair must already be one of that person's links.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { accountForSession } from "@/neo4j/accounts";
import { decideSimilarLink } from "@/neo4j/merchant-links";
import { sameOrigin, SESSION } from "@/server/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

const Id = z.string().regex(/^[0-9a-f]{64}$/);
const Body = z.object({ a: Id, b: Id, decision: z.enum(["confirmed", "rejected"]) }).strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const hit = takeHit("merchant-similar", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return json({ ok: false, error: "Forbidden" }, 403);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.a === parsed.data.b) return json({ ok: false, error: "Invalid request" }, 400);
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return json({ ok: false, error: "Sign in first" }, 401);
    return (await decideSimilarLink(user.profile, parsed.data.a, parsed.data.b, parsed.data.decision)) ? json({ ok: true }) : json({ ok: false, error: "Not found" }, 404);
  } catch {
    return json({ ok: false, error: "Could not save; retry" }, 503);
  }
}
