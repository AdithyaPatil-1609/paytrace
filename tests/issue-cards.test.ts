import assert from "node:assert/strict";
import { test } from "node:test";
import { detectCommitments } from "../lib/engine";
import { loadFixtures } from "../lib/fixtures";
import { annualPriceIncrease, issueDescription, issueGroups } from "../lib/issue-cards";

const payments = detectCommitments(loadFixtures());
const spotify = payments.find((item) => item.merchant === "Spotify")!;

test("issue groups use individual signals and exclude kept decisions", () => {
  const combined = { ...spotify, id: "combined", signals: ["silent_hike", "zombie", "new"] as typeof spotify.signals, inDictionary: false };
  const groups = issueGroups([combined]);
  assert.equal(groups.reduce((sum, group) => sum + group.rows.length, 0), 4);
  assert.equal(new Set(groups.flatMap((group) => group.rows.map((item) => item.id))).size, 1);
  assert.ok(issueGroups([combined], [combined.id]).every((group) => group.rows.length === 0));
});

test("price increase projections follow cadence instead of always multiplying by twelve", () => {
  assert.equal(annualPriceIncrease({ ...spotify, cadence: "monthly" }), 240);
  assert.equal(annualPriceIncrease({ ...spotify, cadence: "annual" }), 20);
  assert.equal(annualPriceIncrease({ ...spotify, cadence: "quarterly" }), 80);
  assert.equal(annualPriceIncrease({ ...spotify, cadence: "weekly" }), 1040);
  assert.equal(annualPriceIncrease({ ...spotify, cadence: "irregular" }), undefined);
});

test("unused explanations count only recorded charges after the last use", () => {
  const sample = { ...spotify, lastOpened: "2026-06-15", evidenceRows: [
    { ...spotify.evidenceRows[0], date: "2026-06-01", amount: 99 },
    { ...spotify.evidenceRows[0], date: "2026-07-01", amount: 129 },
    { ...spotify.evidenceRows[0], date: "2026-08-01", amount: 129 }
  ] };
  assert.match(issueDescription(sample, "unused"), /2 recorded charges since then, totalling ₹258/);
});

test("trial explanations use the notice date without inventing a trial start", () => {
  const youtube = payments.find((item) => item.merchant === "YouTube")!;
  const description = issueDescription(youtube, "trial");
  assert.match(description, /Trial-ending notice/);
  assert.match(description, /First matching paid charge: ₹149/);
  assert.doesNotMatch(description, /trial started/i);
});
