/**
 * POST /api/simulate — live Simulate. The graph answers inside a rolled-back
 * transaction (db/neo4j/simulate.ts), so the TypeScript engine never decides
 * a row while Neo4j is up. 503 tells the client to fall back to the fixture.
 */
import { hasNeo4jConfig } from "@/db/neo4j/client";
import { analyzeWithSimulatedAutopay } from "@/db/neo4j/simulate";

export async function POST() {
  if (!hasNeo4jConfig()) {
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
