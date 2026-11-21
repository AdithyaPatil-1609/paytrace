/**
 * GET /api/account/graph: what the personal evidence graph shows beside the
 * diagram: SIMILAR merchant links, trust levels, payments confirmed by two
 * channels, and the Cypher that ran for each. The profile comes from the
 * session cookie only; the browser cannot send Cypher or a profile id.
 */
import { NextRequest } from "next/server";
import { accountForSession } from "@/db/neo4j/accounts";
import { readEvidenceTrust, TRUST_QUERIES } from "@/db/neo4j/evidence-trust";
import { readSimilarLinks } from "@/db/neo4j/merchant-links";
import { readGraphWarnings } from "@/db/neo4j/warnings";
import { SESSION } from "@/lib/accounts/security";
import { clientKey, LIMITS, takeHit, tooMany } from "@/lib/security/rate-limit";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const hit = takeHit("graph-details", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  try {
    const user = await accountForSession(request.cookies.get(SESSION)?.value);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    // Warnings first: it rebuilds chains and SIMILAR candidates when payments changed.
    const warnings = await readGraphWarnings(user.profile);
    const trust = await readEvidenceTrust(user.profile);
    const started = Date.now();
    let similar: Awaited<ReturnType<typeof readSimilarLinks>> = [], similarOk = true;
    try { similar = await readSimilarLinks(user.profile); } catch { similarOk = false; }
    const extraQueries = [...trust.runs, { ...TRUST_QUERIES[2], ok: similarOk, rows: similar.length, ms: Date.now() - started }];
    return Response.json({ asOf: warnings.asOf, similar, trust: { bySource: trust.bySource, corroborated: trust.corroborated }, queries: warnings.queries, extraQueries, incomplete: warnings.incomplete || extraQueries.some((q) => !q.ok) }, { headers });
  } catch {
    return Response.json({ error: "Graph details unavailable" }, { status: 503, headers });
  }
}
