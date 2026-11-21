/**
 * Stored Job 4 verdicts: for each repeating group, whether the local model
 * called it everyday spending, for which exact rows, and what the person said.
 * Dashboards read these; they never wait for the model.
 */
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { readLiveDashboard } from "./live";
import { recurringChat, RECURRING_MODEL } from "@/lib/assistant/models";
import { candidateFor, checkHash, needsCheck, parseVerdict, RECURRING_PROMPT, renderCandidate } from "@/lib/payments/recurring-check";
import { RECURRING_CHECK_LIMITS } from "@/lib/payments/rules";

const SAVE = `MATCH (u:LiveProfile {id:$profile})
MERGE (c:RecurringCheck {id: $profile + '|' + $commitmentId})
ON CREATE SET c.profile = $profile, c.commitmentId = $commitmentId
SET c.hash = $hash, c.verdict = $verdict, c.kind = $kind, c.model = $model, c.checkedAt = datetime()
MERGE (u)-[:HAS_RECURRING_CHECK]->(c)`;

/** The person says a group is recurring after all. Kept across new payments; the model is never asked to overrule it. */
export async function keepAsRecurring(profile: string, commitmentId: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(
      `MATCH (:LiveProfile {id:$profile})-[:HAS_RECURRING_CHECK]->(c:RecurringCheck {commitmentId:$commitmentId})
       SET c.personSays = 'commitment', c.personSaidAt = datetime() RETURN count(c) AS n`,
      { profile, commitmentId }
    );
    return Number(result.records[0]?.get("n") ?? 0) > 0;
  } finally {
    await session.close();
  }
}

const running = new Set<string>();
let schemaReady = false;

/**
 * Asks the model about groups with no verdict for their current rows, a few at
 * a time. One run per person at once. If the model server is off, nothing is
 * stored and nothing is hidden; the next dashboard load tries again.
 */
export async function refreshRecurringChecks(profile: string, ask = recurringChat) {
  if (running.has(profile)) return 0;
  running.add(profile);
  let saved = 0;
  try {
    if (!schemaReady) {
      const session = getNeo4jDriver().session({ database: neo4jDatabase });
      try { await session.run("CREATE CONSTRAINT recurring_check_id IF NOT EXISTS FOR (c:RecurringCheck) REQUIRE c.id IS UNIQUE"); schemaReady = true; }
      finally { await session.close(); }
    }
    const { detected, checks } = await readLiveDashboard(profile, { withDetected: true });
    const todo = needsCheck(detected ?? [], checks ?? []).slice(0, RECURRING_CHECK_LIMITS.perRun);
    for (const item of todo) {
      const candidate = candidateFor(item);
      let verdict;
      try {
        verdict = parseVerdict(await ask([{ role: "system", content: RECURRING_PROMPT }, { role: "user", content: renderCandidate(candidate) }]));
      } catch {
        break; // Model server is off: try again on a later load.
      }
      if (!verdict) continue;
      const session = getNeo4jDriver().session({ database: neo4jDatabase });
      try {
        await session.run(SAVE, { profile, commitmentId: item.id, hash: checkHash(candidate), verdict: verdict.verdict, kind: verdict.kind, model: RECURRING_MODEL });
        saved += 1;
      } finally {
        await session.close();
      }
    }
    return saved;
  } finally {
    running.delete(profile);
  }
}
