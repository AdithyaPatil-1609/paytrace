import { priyaCommitments } from "@/data/priya";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "@/db/neo4j/client";
import type { Commitment, CommitmentKind, Instrument } from "@/lib/types";

type GraphCommitment = Omit<Commitment, "lastOpenedMonthsAgo" | "canCancel" | "cancellationPath"> & {
  lastOpenedMonthsAgo: number | null;
  canCancel: boolean;
  cancellationPath: string | null;
};

const commitmentQuery = `
  MATCH (person:Person {id: $personId})-[:HAS_ACCOUNT]->(:Account)-[:RECORDED]->(:Transaction)-[:MATCHED_TO]->(commitment:Commitment)
  OPTIONAL MATCH (person)-[:USES]->(service:Service)<-[:FOR]-(commitment)
  RETURN DISTINCT commitment, service.lastOpenedMonthsAgo AS lastOpenedMonthsAgo
  ORDER BY commitment.annualCost DESC
`;

function toCommitment(record: GraphCommitment): Commitment {
  return {
    ...record,
    lastOpenedMonthsAgo: record.lastOpenedMonthsAgo ?? undefined,
    cancellationPath: record.cancellationPath ?? undefined
  };
}

export async function getCommitmentsForPerson(personId = "priya") {
  // The app remains demoable without secrets, while production data always comes from Neo4j.
  if (!hasNeo4jConfig()) return priyaCommitments;

  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(commitmentQuery, { personId });
    return result.records.map((row) => {
      const properties = row.get("commitment").properties;
      const graphCommitment = toCommitment({
        ...properties,
        annualCost: properties.annualCost.toNumber(),
        amount: properties.amount.toNumber(),
        lastOpenedMonthsAgo: row.get("lastOpenedMonthsAgo")?.toNumber() ?? null,
        canCancel: properties.canCancel,
        cancellationPath: properties.cancellationPath ?? null,
        instrument: properties.instrument as Instrument,
        kind: properties.kind as CommitmentKind
      });
      // The graph owns transaction and commitment facts. The local fixture enriches
      // the prototype with the reviewed copy from the merchant dictionary.
      const fixtureCopy = priyaCommitments.find((item) => item.id === graphCommitment.id);
      return fixtureCopy ? { ...fixtureCopy, ...graphCommitment } : graphCommitment;
    });
  } finally {
    await session.close();
  }
}
