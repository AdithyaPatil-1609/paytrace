/**
 * POST /api/account/subscription: facts only the person can confirm about one
 * of their own subscriptions: when they last really used it, or that they
 * cancelled it. These are the "user confirmed" evidence behind the unused and
 * after-cancellation warnings. Nothing is cancelled anywhere by this call.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { accountForSession } from "@/neo4j/accounts";
import { recordSubscriptionFact } from "@/neo4j/warnings";
import { sameOrigin, SESSION } from "@/server/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value)) && value <= new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10));
const Body = z.object({
  subscriptionId: z.string().min(1).max(200),
  usedOn: day.optional(),
  cancelRequestedOn: day.optional(),
  cancelEffectiveOn: day.optional(),
  cancelConfirmed: z.boolean().optional()
}).strict().refine((body) => body.usedOn || body.cancelRequestedOn || body.cancelEffectiveOn, "Send usedOn or a cancellation date");

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const hit = takeHit("subscription-fact", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!sameOrigin(request)) return json({ ok: false, error: "Forbidden" }, 403);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "Invalid request" }, 400);
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return json({ ok: false, error: "Sign in first" }, 401);
    const { subscriptionId, ...fact } = parsed.data;
    const saved = await recordSubscriptionFact(user.profile, subscriptionId, fact);
    return saved ? json({ ok: true }) : json({ ok: false, error: "Subscription not found" }, 404);
  } catch {
    return json({ ok: false, error: "Could not save; retry" }, 503);
  }
}
