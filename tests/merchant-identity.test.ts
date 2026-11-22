import assert from "node:assert/strict";
import test from "node:test";
import { merchantIdentityInput, suggestMerchantIdentities } from "../server/payments/merchant-identity";
import { readDictionary } from "../data/fixtures";
import { detectCommitments } from "../server/payments/engine";
import { issueGroups } from "../server/presentation/issue-cards";
import type { Dataset } from "../server/payments/types";

const dictionary = readDictionary();
const reply = (name: string | null, category: string | null) => JSON.stringify({ results: [{ index: 0, name, category }] });

test("merchant AI receives only a cleaned descriptor and can suggest an unfamiliar brand", async () => {
  const suggestions = await suggestMerchantIdentities(["UPI GROWW 123456789"], dictionary, async messages => {
    assert.match(messages[1].content, /GROWW/);
    assert.doesNotMatch(messages[1].content, /123456789/);
    return reply("Groww", "investment");
  });
  assert.deepEqual(suggestions.get(0), { name: "Groww", category: "investment" });
});

test("merchant AI is generic, not hardcoded; rejects unrelated or invented names", async () => {
  assert.deepEqual((await suggestMerchantIdentities(["NEBULA INSURANCE"], [], async () => reply("Nebula Insurance", "insurance"))).get(0), { name: "Nebula Insurance", category: "insurance" });
  assert.equal((await suggestMerchantIdentities(["NEBULA INSURANCE"], [], async () => reply("Groww", "investment"))).get(0), null);
  assert.equal((await suggestMerchantIdentities(["UNKNOWN PROVIDER"], [], async () => reply(null, null))).get(0), null);
  await assert.rejects(suggestMerchantIdentities(["GROWW"], [], async () => JSON.stringify({ results: [{ index: 0, name: "Groww", category: "investment", cancelUrl: "https://fake.example" }] })));
});

test("exact dictionary aliases and sensitive or address-like descriptors never reach AI", async () => {
  const never = async () => { throw new Error("must not call model"); };
  assert.equal((await suggestMerchantIdentities(["SPOTIFY STOCKHOLM SE", "OTP 1234", "person@upi"], dictionary, never)).size, 0);
  assert.equal(merchantIdentityInput("OTP 1234"), null);
});

test("suggestions remain separate from verified aliases; confirming changes classification but not money or cancellation instructions", () => {
  const dataset: Dataset = { asOf: "2026-11-22", dictionary: [], mandates: [], usage: [], notifications: [], statement: ["2026-08-30", "2026-09-29"].map((date, index) => ({ txnId: String(index), persona: "p1", accountId: "x", accountType: "unknown", narration: "NEBULA INVEST", date, debit: 1250, reference: "", channel: "statement", txnKind: "debit_purchase" })) };
  const identity = { id: "identity", descriptor: "NEBULA INVEST", name: "Nebula Invest", category: "investment", status: "suggested" as const };
  const [suggested] = detectCommitments({ ...dataset, merchantIdentities: [identity] });
  assert.equal(suggested.inDictionary, false);
  assert.equal(suggested.category, "unknown");
  assert.equal(issueGroups([suggested]).find(group => group.id === "unknown")?.rows.length, 1);
  const [confirmed] = detectCommitments({ ...dataset, merchantIdentities: [{ ...identity, status: "confirmed" }] });
  assert.equal(confirmed.inDictionary, false);
  assert.equal(confirmed.merchant, "Nebula Invest");
  assert.equal(confirmed.spendGroup, "investments");
  assert.equal(confirmed.id, suggested.id);
  assert.equal(confirmed.annualCost, 15000);
  assert.equal(confirmed.cancellationPath, undefined);
  assert.equal(issueGroups([confirmed]).find(group => group.id === "unknown")?.rows.length, 0);
});
