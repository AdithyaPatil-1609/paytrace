import type { Transaction } from "neo4j-driver";
import type { Commitment } from "@/lib/payments/types";
import { RULES, type Rules } from "@/lib/payments/rules";
import { ANALYSIS } from "./queries/commitments";
import { commitmentFromAnalysisRecord } from "./commitment-record";

export { ANALYSIS, commitmentFromAnalysisRecord };
export type { AnalysisRecord } from "./commitment-record";

/** Anything that can run Cypher: a session, or a transaction Simulate rolls back. */
export type CypherRunner = Pick<Transaction, "run">;

/**
 * Runs the analysis query. Throws if the graph cannot answer it. `rules` is
 * only overridden by tests, to prove the thresholds reach the query.
 */
export async function analyzeCommitments(
  runner: CypherRunner,
  asOf: string,
  rules: Rules = RULES
): Promise<Commitment[]> {
  const result = await runner.run(ANALYSIS, { asOf, rules });
  return result.records.map(commitmentFromAnalysisRecord);
}
