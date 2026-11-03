import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCommitments } from "@/lib/payments/engine";
import { loadFixtures } from "@/data/fixtures";
import { prepareChallenge, runOfflineChallenge } from "@/lib/scenarios/challenge";

const dataset = loadFixtures();
const original = JSON.stringify(dataset);
const items = detectCommitments(dataset);
const spotify = items.find((item) => item.merchant === "Spotify")!;
const gym = items.find((item) => item.merchant === "FitLine Gym")!;

test("matching notice changes the actual detector verdict; an old notice does not", () => {
  const matching = runOfflineChallenge(dataset, spotify, "matching_notice");
  assert.equal(matching.after[0].hasPriceChangeNotice, true);
  assert.ok(!matching.after[0].signals.includes("silent_hike"));
  assert.equal(matching.after[0].annualCost, spotify.annualCost);
  const old = runOfflineChallenge(dataset, spotify, "old_notice");
  assert.equal(old.after[0].hasPriceChangeNotice, false);
  assert.ok(old.after[0].signals.includes("silent_hike"));
  assert.equal(JSON.stringify(dataset), original);
});

test("recent usage clears the unused flag without changing prices or stored evidence", () => {
  const result = runOfflineChallenge(dataset, gym, "recent_usage");
  assert.ok(!result.after[0].signals.includes("zombie"));
  assert.equal(result.after[0].lastOpened, dataset.asOf);
  assert.equal(result.after[0].annualCost, gym.annualCost);
  assert.equal(gym.signals.includes("zombie"), true);
  assert.equal(JSON.stringify(dataset), original);
});

test("reference changes preserve known-merchant grouping and amounts", () => {
  const result = runOfflineChallenge(dataset, spotify, "descriptor_change");
  assert.equal(result.after.length, 1);
  assert.equal(result.after[0].debitCount, spotify.debitCount);
  assert.equal(result.after[0].annualCost, spotify.annualCost);
  assert.ok(result.after[0].evidenceRows.every((row) => row.narration.includes("TEST-REF-")));
  assert.equal(JSON.stringify(dataset), original);
});

test("merchant corrections are hypothetical mappings and reject existing brand names", () => {
  const sample = structuredClone(dataset);
  const txns = new Set(spotify.evidenceRows.map((row) => row.txnId));
  sample.dictionary = [];
  sample.statement = sample.statement.filter((row) => txns.has(row.txnId)).map((row) => ({ ...row, narration: "UNKNOWN-DEMO-SERVICE" }));
  sample.mandates = []; sample.usage = []; sample.notifications = [];
  const [unknown] = detectCommitments(sample);
  assert.equal(unknown.inDictionary, false);
  const result = runOfflineChallenge(sample, unknown, "merchant_correction", "Demo Services");
  assert.equal(result.after[0].merchant, "Demo Services");
  assert.equal(result.after[0].debitCount, unknown.debitCount);
  assert.throws(() => prepareChallenge(dataset, unknown, "merchant_correction", "Spotify"), /distinct synthetic name/);
  assert.throws(() => prepareChallenge(dataset, gym, "matching_notice"), /recorded price increase/);
});

test("a notice linked to one account cannot clear another account's warning", () => {
  const prepared = prepareChallenge(dataset, spotify, "matching_notice").dataset;
  const ids = new Set(spotify.evidenceRows.map((row) => row.txnId));
  prepared.statement = [...prepared.statement, ...dataset.statement.filter((row) => ids.has(row.txnId)).map((row) => ({ ...row, txnId: `OTHER-${row.txnId}`, accountId: "OTHER-ACCOUNT" }))];
  const copies = detectCommitments(prepared).filter((item) => item.merchant === "Spotify");
  assert.equal(copies.length, 2);
  assert.equal(copies.find((item) => item.evidenceRows[0].account === "OTHER-ACCOUNT")?.hasPriceChangeNotice, false);
});
