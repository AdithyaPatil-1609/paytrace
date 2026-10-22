import { priyaCommitments } from "@/data/priya";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "@/db/neo4j/client";
import type { Commitment } from "@/lib/types";

/**
 * Detection is the source of truth in this prototype: every commitment is
 * computed from the CSV fixture by lib/engine. The graph is kept because the
 * product after this one reads real statements, and it already models person,
 * account, narration, merchant, commitment, notice, and mandate. When it is
 * configured it can only overlay amounts onto a row detection already found.
 */
const commitmentQuery = `
  MATCH (person:Person {id: $personId})-[:HAS_ACCOUNT]->(:Account)-[:RECORDED]->(:Transaction)-[:MATCHED_TO]->(commitment:Commitment)
  RETURN DISTINCT commitment
  ORDER BY commitment.annualCost DESC
`;

export async function getCommitmentsForPerson(personId = "priya"): Promise<Commitment[]> {
  if (!hasNeo4jConfig()) return priyaCommitments;

  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(commitmentQuery, { personId });
    const overlays = new Map<string, { amount: number; annualCost: number }>();
    for (const row of result.records) {
      const properties = row.get("commitment").properties;
      overlays.set(String(properties.id), {
        amount: properties.amount?.toNumber?.() ?? Number(properties.amount),
        annualCost: properties.annualCost?.toNumber?.() ?? Number(properties.annualCost)
      });
    }
    return priyaCommitments.map((item) => {
      const overlay = overlays.get(item.id);
      return overlay ? { ...item, ...overlay } : item;
    });
  } catch {
    // The prototype stays reviewable when the database is unreachable.
    return priyaCommitments;
  } finally {
    await session.close();
  }
}
