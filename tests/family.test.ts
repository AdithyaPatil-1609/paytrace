/**
 * Family View sharing rules that need no database: the allowlist of fields a
 * viewer may see, the totals, and the shape of an invite token.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { familyPayments, familyTotals, firstName } from "../server/accounts/family";
import { Token } from "../server/accounts/family-route";
import { randomToken } from "../server/accounts/security";
import { detectCommitments } from "../server/payments/engine";
import { loadFixtures } from "../data/fixtures";

test("a viewer gets only the allowlisted fields, never descriptors, accounts or evidence", () => {
  const commitments = detectCommitments(loadFixtures());
  assert.ok(commitments.length > 0);
  const shared = familyPayments(commitments);
  for (const row of shared) assert.deepEqual(Object.keys(row).sort(), ["amount", "annualCost", "cadence", "merchant", "nextCharge", "product", "spendGroup"]);
  const text = JSON.stringify(shared);
  for (const c of commitments) {
    for (const e of c.evidenceRows) assert.ok(!text.includes(e.account) || e.account === "", "no account ids");
    if (c.rawNarration !== c.merchant) assert.ok(!text.includes(`"${c.rawNarration}"`), "no raw bank descriptors");
  }
});

test("totals add the yearly cost and round the monthly share", () => {
  const rows = [{ merchant: "A", product: "a", cadence: "monthly" as const, amount: 100, annualCost: 1200, nextCharge: null, spendGroup: "subscriptions" as const }, { merchant: "B", product: "b", cadence: "annual" as const, amount: 999, annualCost: 999, nextCharge: null, spendGroup: "subscriptions" as const }];
  assert.deepEqual(familyTotals(rows), { count: 2, annual: 2199, monthly: 183 });
});

test("only a first name is shown to the other person", () => {
  assert.equal(firstName("Asha Rao Kumar"), "Asha");
  assert.equal(firstName(""), "Paytrace user");
  assert.equal(firstName(null), "Paytrace user");
});

test("invite tokens are 32 random bytes and anything else is refused before the database", () => {
  assert.ok(Token.safeParse(randomToken()).success);
  for (const bad of ["", "short", "x".repeat(44), "a".repeat(42) + "=", "../../etc/passwd" + "a".repeat(30)]) assert.equal(Token.safeParse(bad).success, false, bad);
});
