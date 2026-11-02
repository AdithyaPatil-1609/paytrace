/**
 * Simulate new autopay, answered by the graph.
 *
 * Writes the rows a new mandate leaves behind (one Payment, one Mandate, two
 * Messages) inside a transaction, links them with the same writers the seed
 * uses, runs the analysis query on that transaction, and rolls back. Cypher
 * decides whether Headspace is a commitment; the stored graph never changes.
 */
import { analyzeCommitments } from "./analyze";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { linkEvidence, writeMandates, writeMessages, writePayments } from "./write";
import { simulatedMandate, simulatedNotices, simulatedStatement } from "@/data/simulation";
import { AS_OF } from "@/lib/fixtures";
import type { Commitment } from "@/lib/types";

export async function analyzeWithSimulatedAutopay(): Promise<Commitment[]> {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  const tx = session.beginTransaction();
  try {
    await writePayments(tx, [simulatedStatement]);
    await writeMandates(tx, [simulatedMandate]);
    await writeMessages(tx, simulatedNotices);
    await linkEvidence(tx);
    return await analyzeCommitments(tx, AS_OF);
  } finally {
    await tx.rollback();
    await session.close();
  }
}
