/**
 * GET /api/graph/evidence?merchant=Spotify
 * Bounded, read-only records for graph-grounded explanations. No credentials
 * or arbitrary Cypher are accepted from the client.
 */
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "@/db/neo4j/client";
import { MERCHANT_EVIDENCE } from "@/db/neo4j/queries/evidence";

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === "object") {
    const number = value as { toNumber?: () => number };
    if (typeof number.toNumber === "function") return number.toNumber();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
  }
  return value;
}

export async function GET(request: Request) {
  if (!hasNeo4jConfig()) {
    return Response.json({ error: "Neo4j is not configured." }, { status: 503 });
  }

  const merchant = new URL(request.url).searchParams.get("merchant")?.trim();
  if (!merchant || merchant.length > 120) {
    return Response.json({ error: "Provide a merchant name (1–120 characters)." }, { status: 400 });
  }

  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.executeRead((tx) => tx.run(MERCHANT_EVIDENCE, { merchant }));
    const record = result.records[0];
    if (!record) {
      return Response.json({ error: "Merchant not found." }, { status: 404 });
    }
    return Response.json({
      merchant: record.get("merchant"),
      payments: plain(record.get("payments")),
      notices: plain(record.get("notices")),
      mandates: plain(record.get("mandates")),
      limitation: "Evidence is limited to the imported dataset; absent notices are not proof of non-delivery."
    });
  } catch (error) {
    console.error("Neo4j evidence query failed:", error);
    return Response.json({ error: "Could not retrieve graph evidence." }, { status: 503 });
  } finally {
    await session.close();
  }
}
