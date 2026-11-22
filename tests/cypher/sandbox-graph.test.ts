/**
 * A demo visitor's own Neo4j graph: written from their sample statement,
 * readable like a real profile, and deleted by the sweep after it expires.
 * A real person's profile is never touched by the sweep.
 */
import "../../scripts/load-env-local";
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { ingestLiveEvent } from "../../db/neo4j/live";
import { deleteProfileGraph, sandboxProfile, sweepSandboxGraphs, syncSandboxGraph } from "../../db/neo4j/sandbox-graph";
import { readGraphWarnings } from "../../db/neo4j/warnings";
import { loadSampleStatement } from "../../lib/sandbox/statement";
import { clearSandboxes, openSandbox } from "../../lib/sandbox/store";

const skip = !hasNeo4jConfig();
const real = `test-real-${Date.now()}`;

after(async () => {
  if (skip) return;
  await deleteProfileGraph(real);
  await getNeo4jDriver().close();
});

async function exists(profile: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try { return (await session.run("MATCH (u:LiveProfile {id:$profile}) RETURN count(u) AS n", { profile })).records[0].get("n").toNumber() > 0; }
  finally { await session.close(); }
}

test("a sample statement becomes the visitor's own graph, then expires", { skip }, async () => {
  clearSandboxes();
  const box = openSandbox("e".repeat(32));
  loadSampleStatement(box, "2026-11-21", "graph-test");
  await syncSandboxGraph(box);
  assert.equal(box.graph, "ready");
  const profile = sandboxProfile(box.id);
  const warnings = await readGraphWarnings(profile, "2026-11-21");
  assert.ok(warnings.price.length + warnings.upcoming.length + warnings.cancellation.length > 0, "the graph raises warnings like a real profile");

  await ingestLiveEvent(real, { source: "email", kind: "debit_posted", merchant: "REALFLIX", amountPaise: 19900, date: "2026-11-01", reference: null, sourceId: "real-1" });
  await sweepSandboxGraphs(Date.now() + 3 * 60 * 60_000);
  assert.equal(await exists(profile), false, "expired sandbox graph is deleted");
  assert.equal(await exists(real), true, "a real profile is never swept");
});
