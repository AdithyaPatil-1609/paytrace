import "../../scripts/load-env-local";
import assert from "node:assert/strict";
import { test } from "node:test";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { challengeInNeo4j } from "../../db/neo4j/challenge";
import { detectCommitments } from "@/lib/payments/engine";
import { loadFixtures } from "@/data/fixtures";
import { runOfflineChallenge, type ChallengeAction } from "@/lib/scenarios/challenge";

test("live challenges match offline results and roll back all node properties and relationships", { skip: !hasNeo4jConfig() }, async () => {
  const driver = getNeo4jDriver();
  const session = driver.session({ database: neo4jDatabase });
  const dataset = loadFixtures();
  const items = detectCommitments(dataset);
  const snapshot = async () => ({
    nodes: (await session.run("MATCH (node) RETURN elementId(node) AS id, labels(node) AS labels, properties(node) AS properties ORDER BY id")).records.map((row) => row.toObject()),
    relationships: (await session.run("MATCH (first)-[relationship]->(last) RETURN elementId(relationship) AS id, elementId(first) AS first, elementId(last) AS last, type(relationship) AS type ORDER BY id")).records.map((row) => row.toObject())
  });
  try {
    const before = await snapshot();
    for (const [merchant, action] of [["Spotify", "matching_notice"], ["Spotify", "old_notice"], ["Spotify", "descriptor_change"], ["FitLine Gym", "recent_usage"]] as [string, ChallengeAction][]) {
      const item = items.find((entry) => entry.merchant === merchant)!;
      const actual = await challengeInNeo4j({ commitmentId: item.id, action });
      const expected = runOfflineChallenge(dataset, item, action);
      assert.deepEqual(actual.after, expected.after, `${action} parity`);
      assert.deepEqual(await snapshot(), before, `${action} rollback`);
    }
  } finally { await session.close(); await driver.close(); }
});
