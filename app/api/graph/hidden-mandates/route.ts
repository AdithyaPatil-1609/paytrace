/**
 * Read-only graph discovery API. Results mean that no matching debit exists
 * in the available graph, not that the mandate has never been charged.
 */
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "@/db/neo4j/client";
import { HIDDEN_MANDATES } from "@/db/neo4j/queries/hidden-mandates";

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    const number = value as { toNumber?: () => number };
    if (typeof number.toNumber === "function") return number.toNumber();
  }
  return value;
}

export async function GET() {
  if (!hasNeo4jConfig()) {
    return Response.json({ error: "Neo4j is not configured." }, { status: 503 });
  }

  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.executeRead((tx) => tx.run(HIDDEN_MANDATES));
    return Response.json({
      definition: "Active mandates with no identifiable paid debit in imported evidence",
      findings: result.records.map((record) =>
        Object.fromEntries(record.keys.map((key) => [key, plain(record.get(key))]))
      )
    });
  } catch (error) {
    console.error("Neo4j hidden mandate query failed:", error);
    return Response.json({ error: "Could not retrieve hidden mandates." }, { status: 503 });
  } finally {
    await session.close();
  }
}
