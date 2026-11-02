import assert from "node:assert/strict";
import { test } from "node:test";
import { loadFixtures } from "../lib/fixtures";
import { detectCommitments } from "../lib/engine";
import { alternateDataset } from "../data/alternate";
import { withSimulatedAutopay, simulationMerchant } from "../data/simulation";
import { rejectedPriceNotices } from "../lib/notice-evidence";

test("simulation exclusion explains the actual age and amount mismatch", () => {
  const sample = withSimulatedAutopay(loadFixtures());
  const result = detectCommitments(sample).find((item) => item.merchant === simulationMerchant)!;
  const [exclusion] = rejectedPriceNotices(result);
  assert.equal(exclusion.changeDate, "2026-08-10");
  assert.match(exclusion.reasons.join("; "), /outside the 45-day matching window/);
  assert.match(exclusion.reasons.join("; "), /₹99, not the new ₹129/);
});

test("a timely matching notice changes the simulation verdict", () => {
  const sample = structuredClone(withSimulatedAutopay(loadFixtures()));
  const notice = sample.notifications.find((row) => row.noticeId === "NTC-SIM-OLD")!;
  notice.sentOn = "2026-08-01";
  notice.amount = 129;
  const result = detectCommitments(sample).find((item) => item.merchant === simulationMerchant)!;
  assert.equal(result.hasPriceChangeNotice, true);
  assert.ok(!result.signals.includes("silent_hike"));
  assert.deepEqual(rejectedPriceNotices(result), []);
});

test("inactive and wrong-account mandates cannot qualify a single debit", () => {
  for (const status of ["expired", "revoked", "active"]) {
    const dataset = loadFixtures();
    const mandate = dataset.mandates[0];
    dataset.statement = dataset.statement.filter((row) => row.narration === mandate.narration).slice(0, 1);
    assert.equal(dataset.statement.length, 1);
    dataset.mandates = [{ ...mandate, status, accountId: status === "active" ? "OTHER" : mandate.accountId }];
    assert.equal(detectCommitments(dataset).length, 0);
  }
});

test("ordinary unknown purchases do not become a subscription", () => {
  const dataset = alternateDataset(loadFixtures());
  dataset.dictionary = [];
  assert.equal(detectCommitments(dataset).length, 0);
});

test("changed references still group and multiple sustained hikes are detected", () => {
  const dataset = alternateDataset(loadFixtures());
  dataset.statement.forEach((row, index) => { row.debit = [99, 109, 129, 129][index]; });
  const [result] = detectCommitments(dataset);
  assert.equal(result.debitCount, 4);
  assert.ok(result.signals.includes("silent_hike"));
});

test("old notices cannot hide a hike and trial notices need a subsequent paid debit", () => {
  const dataset = alternateDataset(loadFixtures());
  dataset.notifications = [
    { noticeId: "old", sentOn: "2025-01-01", channel: "email", sender: "demo", eventType: "price_change", brand: "CloudNote", amount: 129, text: "Old notice" },
    { noticeId: "trial", sentOn: "2026-10-20", channel: "email", sender: "demo", eventType: "trial_ending", brand: "CloudNote", amount: 129, text: "Trial ends soon" }
  ];
  const [result] = detectCommitments(dataset);
  assert.ok(result.signals.includes("silent_hike"));
  assert.ok(!result.signals.includes("trial_converted"));
});
