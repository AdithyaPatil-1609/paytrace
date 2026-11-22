/**
 * POST /api/simulate — live Simulate. The graph answers inside a rolled-back
 * transaction (neo4j/simulate.ts), so the TypeScript engine never decides
 * a row while Neo4j is up. 503 tells the client to fall back to the fixture.
 */
import { hasDemoNeo4jConfig } from "@/neo4j/client";
import { analyzeWithSimulatedAutopay } from "@/neo4j/simulate";
import { clientKey, LIMITS, takeHit, tooMany } from "@/server/security/rate-limit";
import { forbidden, fromOurSite } from "@/server/security/origin";

export async function POST(request: Request) {
  const hit = takeHit("simulate", clientKey(request), LIMITS.graph);
  if (!hit.ok) return tooMany(hit.retryAfter);
  if (!fromOurSite(request)) return forbidden();
  if (!hasDemoNeo4jConfig()) {
    return Response.json({ error: "Neo4j is not configured." }, { status: 503 });
  }
  try {
    const commitments = await analyzeWithSimulatedAutopay();
    return Response.json({ commitments });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Simulate in Neo4j failed:", message);
    return Response.json({ error: "The graph could not run the simulation." }, { status: 503 });
  }
}
