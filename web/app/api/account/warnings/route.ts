/**
 * GET /api/account/warnings: the signed-in person's live graph warnings
 * (price rises, mandate limits, unused, upcoming, after cancellation). The
 * profile comes from the session cookie only, never from the request.
 */
import { NextRequest } from "next/server";
import { readGraphWarnings } from "@/neo4j/warnings";
import { graphProfileFor } from "@/server/sandbox/graph-profile";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";
import { GRAPH_WARNING_LIMITS } from "@/server/payments/rules";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const hit = takeHit("graph-warnings", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  try {
    // The signed-in person's graph, or a demo visitor's own sandbox graph.
    const reader = await graphProfileFor(request);
    if (!reader.profile) return Response.json({ error: reader.kind === "syncing" ? "Your sample is still being written to Neo4j. Try again in a few seconds." : "Unauthorized" }, { status: reader.kind === "syncing" ? 409 : 401, headers });
    const asked = Number(new URL(request.url).searchParams.get("days"));
    const days = Number.isInteger(asked) && asked >= 1 && asked <= 60 ? asked : GRAPH_WARNING_LIMITS.upcomingWindowDays;
    return Response.json(await readGraphWarnings(reader.profile, undefined, days), { headers });
  } catch {
    return Response.json({ error: "Warnings unavailable" }, { status: 503, headers });
  }
}
