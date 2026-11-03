import { analyzeCommitments } from "./analyze";
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { loadDatasetFromNeo4j } from "./dataset";
import { linkEvidence, writeMessages, writePatterns, writePayments, writeUsage } from "./write";
import { ChallengeInputError, challengeMatches, prepareChallenge, type ChallengeRequest, type ChallengeResult } from "@/lib/challenge";

export async function challengeInNeo4j(request: ChallengeRequest): Promise<ChallengeResult> {
  const loaded = await loadDatasetFromNeo4j();
  const before = loaded.commitments?.find((item) => item.id === request.commitmentId);
  if (!before) throw new ChallengeInputError("This payment is not in the stored graph. Try a payment from the original dataset.");
  const prepared = prepareChallenge(loaded.dataset, before, request.action, request.merchantName);
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  const transaction = session.beginTransaction();
  try {
    if (prepared.patch.statement.length) await writePayments(transaction, prepared.patch.statement);
    if (prepared.patch.notifications.length) await writeMessages(transaction, prepared.patch.notifications);
    if (prepared.patch.usage.length) await writeUsage(transaction, prepared.patch.usage);
    if (prepared.patch.dictionary.length) await writePatterns(transaction, prepared.patch.dictionary);
    await linkEvidence(transaction);
    const after = challengeMatches(await analyzeCommitments(transaction, loaded.dataset.asOf), before);
    return { before, after, changes: prepared.changes, engine: "neo4j" };
  } finally {
    try { await transaction.rollback(); } finally { await session.close(); }
  }
}
