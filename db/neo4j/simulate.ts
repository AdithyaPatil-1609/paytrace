import { analyzeCommitments } from "./analyze";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { linkEvidence, writeMandates, writeMessages, writePayments, writePatterns } from "./write";
import { simulatedMandate, simulatedNotices, simulatedStatements, simulatedPattern } from "@/data/simulation";
import { AS_OF } from "@/lib/fixtures";
import type { Commitment } from "@/lib/types";

export async function analyzeWithSimulatedAutopay(): Promise<Commitment[]> {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  const tx = session.beginTransaction();
  try {
    await writePatterns(tx, [simulatedPattern]);
    await writePayments(tx, simulatedStatements);
    await writeMandates(tx, [simulatedMandate]);
    await writeMessages(tx, simulatedNotices);
    await linkEvidence(tx);
    return await analyzeCommitments(tx, AS_OF);
  } finally {
    await tx.rollback();
    await session.close();
  }
}
