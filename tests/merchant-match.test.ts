/**
 * Merchant matching thresholds (Task 1), on made-up and catalog names. The
 * hard cases are related brands that must stay apart: Google One, Google
 * Play and YouTube are all billed by Google but are different subscriptions.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bandOf, matchMerchant, normalizeDescriptor, similarity, similarPairs, wordCounts } from "../server/payments/merchant-match";
import { readDictionary } from "../data/fixtures";
import { MERCHANT_MATCH } from "../server/payments/rules";

const dictionary = readDictionary();
const KNOWN = ["Spotify", "Google One", "Google Play", "YouTube", "Apple Music", "iCloud+", "Netflix", "Amazon Prime", "Amazon Pay", "GOOGLE CLOUD"];
const score = (a: string, b: string) => similarity(a, b, wordCounts([...KNOWN, a, b])).score;

test("bank prefixes, punctuation and reference numbers are removed, other words kept", () => {
  assert.deepEqual(normalizeDescriptor("POS SPOTIFY").tokens, ["SPOTIFY"]);
  assert.deepEqual(normalizeDescriptor("UPI/633012345678/spotify.com").tokens, ["SPOTIFY"]);
  assert.deepEqual(normalizeDescriptor("ACH DEBIT GOOGLE*ONE").tokens, ["GOOGLE", "ONE"]);
  // A prefix word is only dropped at the start, never when it is the whole name.
  assert.deepEqual(normalizeDescriptor("CARD").tokens, ["CARD"]);
});

test("Spotify descriptors are strong candidates or the same name", () => {
  for (const descriptor of ["SPOTIFY", "SPOTIFY STOCKHOLM", "SPOTIFY PREMIUM", "POS SPOTIFY"]) {
    assert.ok(score(descriptor, "Spotify") >= MERCHANT_MATCH.strong, descriptor);
  }
});

test("a typo needs review, never strong", () => {
  for (const [a, b] of [["SPOTFY", "Spotify"], ["NETFLX", "Netflix"]]) assert.equal(bandOf(score(a, b)), "review", a);
});

test("related brands stay separate: Google One, Google Play, YouTube, Amazon Pay", () => {
  for (const [a, b] of [["GOOGLE PLAY", "Google One"], ["GOOGLE ONE", "Google Play"], ["YOUTUBE", "Google One"], ["YOUTUBE PREMIUM", "Google Play"], ["AMAZON PAY", "Amazon Prime"], ["APPLE MUSIC", "iCloud+"], ["APPLE.COM/BILL", "Apple Music"]]) {
    assert.equal(bandOf(score(a, b)), "separate", `${a} vs ${b}: ${score(a, b)}`);
  }
});

test("a word other merchants share is never enough for a strong match", () => {
  // "GOOGLE" alone could be Google One, Google Play or Google Cloud: ask, do not decide.
  assert.equal(bandOf(score("GOOGLE", "Google One")), "review");
});

test("a short name inside a longer line is review, not strong", () => {
  assert.equal(bandOf(similarity("HOUSING SOCIETY MAINT", "Society").score), "review");
});

test("similarity is the same in both directions and 1 for equal names", () => {
  assert.equal(score("SPOTIFY STOCKHOLM", "Spotify"), score("Spotify", "SPOTIFY STOCKHOLM"));
  assert.equal(similarity("POS NETFLIX", "netflix.com").score, 1);
});

test("an exact dictionary pattern still wins and is canonical", () => {
  const match = matchMerchant("SPOTIFY STOCKHOLM SE", [], dictionary);
  assert.equal(match?.band, "canonical");
  assert.equal(match?.method, "exact_alias");
  assert.equal(match?.candidateName, "Spotify");
});

test("matchMerchant returns score, method and reason, or null when nothing is close", () => {
  const own = [{ id: "m1", name: "ZEPHYR MUSIC" }];
  const match = matchMerchant("POS ZEPHYR MUSIC STOCKHOLM", own, dictionary);
  assert.equal(match?.candidateId, "m1");
  assert.equal(match?.band, "strong");
  assert.ok(match!.score > 0 && match!.score <= 1 && match!.reason.length > 0);
  assert.equal(matchMerchant("CORNER BAKERY", own, dictionary), null);
});

test("pairs are ordered, never self-links, and below-threshold pairs are dropped", () => {
  const merchants = [{ id: "b", name: "ZEPHYR MUSIC" }, { id: "a", name: "ZEPHYR MUSIC STORE" }, { id: "c", name: "CORNER BAKERY" }, { id: "a", name: "ZEPHYR MUSIC STORE" }];
  const pairs = similarPairs(merchants, dictionary);
  assert.ok(pairs.every(p => p.a < p.b));
  assert.deepEqual(pairs.map(p => [p.a, p.b]), [["a", "b"]]);
});
