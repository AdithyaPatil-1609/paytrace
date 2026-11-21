/**
 * GET /api/account/warnings: the signed-in person's live graph warnings
 * (price rises, mandate limits, unused, upcoming, after cancellation). The
 * profile comes from the session cookie only, never from the request.
 */
import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { readGraphWarnings } from "@/db/neo4j/warnings";
import { SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";
import { GRAPH_WARNING_LIMITS } from "@/lib/payments/rules";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const hit = takeHit("graph-warnings", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    const asked = Number(new URL(request.url).searchParams.get("days"));
    const days = Number.isInteger(asked) && asked >= 1 && asked <= 60 ? asked : GRAPH_WARNING_LIMITS.upcomingWindowDays;
    return Response.json(await readGraphWarnings(user.profile, undefined, days), { headers });
  } catch {
    return Response.json({ error: "Warnings unavailable" }, { status: 503, headers });
  }
}
