/**
 * On a real Neo4j (CI): imported statement lines become the person's payments,
 * are counted as statement lines, never appear as notices, and a second import
 * of the same file adds nothing. Made-up data only.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getNeo4jDriver, hasNeo4jConfig } from "../../neo4j/client";
import { ingestLiveEvent, readLiveSummary } from "../../neo4j/live";
import { deleteAllUserData } from "../../neo4j/delete-user";
import { createSession } from "../../neo4j/accounts";
import { profileFor } from "../../server/accounts/security";
import { parseStatementCsv } from "../../server/statements/csv";
import { generateStatement, statementCsv } from "../../server/statements/generate";
import { statementEvents } from "../../server/statements/events";

after(async () => { if (hasNeo4jConfig()) await getNeo4jDriver().close(); });

test("statement import: payments, not notices, and idempotent", { skip: !hasNeo4jConfig() }, async () => {
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "test-client", GOOGLE_WEB_CLIENT_SECRET: "test-secret", PAYTRACE_APP_URL: "http://localhost:3000", PAYTRACE_AUTH_KEY: "ab".repeat(32) });
  const sub = `test-${randomUUID()}`, profile = profileFor(sub);
  await createSession({ sub, email: "s@example.com", name: "S" });
  const parsed = parseStatementCsv(statementCsv(generateStatement("cypher", "2026-11-21")));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const { events } = statementEvents(parsed.lines.slice(0, 40));
  try {
    for (const event of events) await ingestLiveEvent(profile, event);
    const first = await readLiveSummary(profile);
    assert.equal(first.counts.statement, events.length);
    assert.ok(first.counts.payments > 0);
    assert.ok(first.recentEvents.every((row: { channel: string }) => row.channel !== "statement"));
    for (const event of events) await ingestLiveEvent(profile, event);
    assert.equal((await readLiveSummary(profile)).counts.statement, events.length, "re-import adds nothing");
  } finally { await deleteAllUserData(sub, profile); }
});
