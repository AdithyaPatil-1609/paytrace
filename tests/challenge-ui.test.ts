import assert from "node:assert/strict";
import { test } from "node:test";
import { challengeChoices, challengeTakeaway } from "@/lib/scenarios/challenge-ui";
import { runOfflineChallenge } from "@/lib/scenarios/challenge";
import { detectCommitments } from "@/lib/payments/engine";
import { loadFixtures } from "@/data/fixtures";

const dataset = loadFixtures();
const items = detectCommitments(dataset);
const spotify = items.find((item) => item.merchant === "Spotify")!;
const gym = items.find((item) => item.merchant === "FitLine Gym")!;

test("what-if choices match the payment and never offer loan or bill experiments", () => {
  assert.deepEqual(challengeChoices(gym), { price: false, usage: true, merchant: false, available: true });
  assert.deepEqual(challengeChoices(spotify), { price: true, usage: false, merchant: false, available: true });
  for (const item of items.filter((entry) => entry.cancelMode !== "normal")) {
    assert.equal(challengeChoices(item).available, false, item.merchant);
  }
  assert.equal(challengeChoices(items.find((item) => item.merchant === "Netflix")!).available, false);
  assert.equal(challengeChoices({ ...gym, inDictionary: false }).usage, false);
  assert.equal(challengeChoices({ ...gym, inDictionary: false }).merchant, true);
});

test("plain-language results distinguish a relevant notice from an unrelated old notice", () => {
  const matching = runOfflineChallenge(dataset, spotify, "matching_notice");
  const old = runOfflineChallenge(dataset, spotify, "old_notice");
  assert.equal(challengeTakeaway(matching, "matching_notice"), "The price-rise warning would clear");
  assert.equal(challengeTakeaway(old, "old_notice"), "The price-rise warning would remain");
  assert.equal(challengeTakeaway(runOfflineChallenge(dataset, gym, "recent_usage"), "recent_usage"), "The unused-service warning would clear");
});

test("grouping summaries check the actual charges, including a split or lost charge", () => {
  const result = runOfflineChallenge(dataset, spotify, "descriptor_change");
  assert.equal(challengeTakeaway(result, "descriptor_change"), "These charges would still be grouped together");
  assert.equal(challengeTakeaway({ ...result, after: [...result.after, result.after[0]] }, "descriptor_change"), "The payment grouping would change");
  assert.equal(challengeTakeaway({ ...result, after: [{ ...result.after[0], evidenceRows: result.after[0].evidenceRows.slice(1) }] }, "descriptor_change"), "The payment grouping would change");
});
