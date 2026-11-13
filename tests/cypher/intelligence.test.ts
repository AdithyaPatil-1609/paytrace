/** Regression tests for the read-only Neo4j intelligence API queries. */
import "../../scripts/load-env-local";
import assert from "node:assert/strict";
import { test } from "node:test";
import { getNeo4jDriver, hasNeo4jConfig, neo4jDatabase } from "../../db/neo4j/client";
import { HIDDEN_MANDATES } from "../../db/neo4j/queries/hidden-mandates";
import { MERCHANT_EVIDENCE } from "../../db/neo4j/queries/evidence";

const skip = !hasNeo4jConfig() ? "Neo4j is not configured" : false;

test("hidden mandate discovery excludes linked debit payments", { skip }, async () => {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  const tx = session.beginTransaction();
  try {
    await tx.run(`
      MERGE (m:Merchant {brand: '__INTELLIGENCE_TEST_MERCHANT__'})
      MERGE (a:Account {account_id: '__INTELLIGENCE_TEST_ACCOUNT__'})
      MERGE (md:Mandate {mandate_id: '__INTELLIGENCE_TEST_MANDATE__'})
      SET md.status = 'active', md.created_on = date('2026-01-01')
      MERGE (md)-[:FOR]->(m)
      MERGE (md)-[:ON_ACCOUNT]->(a)
    `);
    const before = await tx.run(HIDDEN_MANDATES);
    assert.ok(before.records.some((r) => r.get("mandateId") === "__INTELLIGENCE_TEST_MANDATE__"));

    await tx.run(`
      MATCH (md:Mandate {mandate_id: '__INTELLIGENCE_TEST_MANDATE__'})
      MATCH (m:Merchant {brand: '__INTELLIGENCE_TEST_MERCHANT__'})
      MATCH (a:Account {account_id: '__INTELLIGENCE_TEST_ACCOUNT__'})
      MERGE (p:Payment {txn_id: '__INTELLIGENCE_TEST_PAYMENT__'})
      SET p.date = date('2026-02-01'), p.debit_inr = 499, p.txn_kind = 'debit_purchase'
      MERGE (p)-[:ON_ACCOUNT]->(a)
      MERGE (p)-[:PAID_TO]->(m)
      MERGE (p)-[:AUTHORIZED_BY]->(md)
    `);
    const after = await tx.run(HIDDEN_MANDATES);
    assert.ok(!after.records.some((r) => r.get("mandateId") === "__INTELLIGENCE_TEST_MANDATE__"));
  } finally {
    await tx.rollback();
    await session.close();
  }
});

test("merchant evidence retrieves graph-connected records", { skip }, async () => {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    const result = await session.run(MERCHANT_EVIDENCE, { merchant: "Spotify" });
    assert.equal(result.records[0]?.get("merchant"), "Spotify");
    assert.ok((result.records[0]?.get("payments") as unknown[]).length > 0);
  } finally {
    await session.close();
  }
});
