/**
 * POST /api/account/recurring-check { commitmentId }: the person says a group
 * the local model moved to everyday spending is recurring after all. Their
 * answer is stored and always wins over the model's.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { accountForSession } from "@/db/neo4j/accounts";
import { keepAsRecurring } from "@/db/neo4j/recurring-checks";
import { sameOrigin, SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const Body = z.object({ commitmentId: z.string().min(1).max(200) }).strict();
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const hit = takeHit("recurring-check", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return json({ ok: false, error: "Forbidden" }, 403);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Invalid request" }, 400);
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return json({ ok: false, error: "Sign in first" }, 401);
    return (await keepAsRecurring(user.profile, parsed.data.commitmentId)) ? json({ ok: true }) : json({ ok: false, error: "Not found" }, 404);
  } catch {
    return json({ ok: false, error: "Could not save; retry" }, 503);
  }
}
