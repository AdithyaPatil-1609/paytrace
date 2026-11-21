import assert from "node:assert/strict";
import test from "node:test";
import { projectMerchantKnowledge } from "../db/neo4j/agent-knowledge";
import type { DictionaryEntry } from "../lib/payments/types";

const row: DictionaryEntry = {
  brand: "Example Merchant", pattern: "EXAMPLE", product: "Example plan", category: "software",
  mechanism: "card_recurring", cancelMode: "normal", oneLiner: "Sample debit on 2027-01-01",
  stopTheService: "Example service", stopTheMoney: "UMRN PRIVATE_REFERENCE",
  trap: "Sample plan", ifTheyStaySilent: "Example"
};

test("knowledge projection exports only safe static merchant fields", () => {
  const [entry] = projectMerchantKnowledge([row]);
  assert.deepEqual(Object.keys(entry).sort(), ["id","brand","brandKey","pattern","product","category","mechanism"].sort());
  assert.equal(JSON.stringify(entry).includes("PRIVATE_REFERENCE"), false);
  assert.equal(JSON.stringify(entry).includes("2027-01-01"), false);
});
test("fixture-only and excluded rows are not published", () => {
  assert.deepEqual(projectMerchantKnowledge([{ ...row, cancelMode: "fixture" }, { ...row, cancelMode: "exclude" }]), []);
});
