import assert from "node:assert/strict";
import test from "node:test";
import { withSimulatedAutopay } from "../data/simulation";
import {
  detectPriceHikes,
  keptLeakTotal,
  groupByCategory,
  groupByKind,
  isSilentPriceHike,
  issueItems,
  isTrialConverted,
  isZombie,
  monthlyForecast,
  potentialSavings,
  splitByBucket,
  unusedTotal,
  upcomingRenewals,
  yearlyTotal
} from "../lib/analysis";
import { detectCommitments } from "../lib/engine";
import { loadFixtures, loadParserFixtures } from "../lib/fixtures";

const dataset = loadFixtures();
const commitments = detectCommitments(dataset);
/** Ids carry the account and descriptor now, so tests name the merchant. */
const find = (merchant: string) => commitments.find((item) => item.merchant === merchant)!;

// The nine checks the prototype is done when it passes.

test("1. Spotify at 119, 119, 139, 139 with no price notice is a silent hike", () => {
  const spotify = find("Spotify");
  assert.equal(spotify.amountPattern, "step");
  assert.equal(spotify.previousAmount, 119);
  assert.equal(spotify.amount, 139);
  assert.equal(spotify.hasPriceChangeNotice, false);
  assert.equal(isSilentPriceHike(spotify), true);
});

test("2. the YouTube trial notice followed by 149 is a converted trial", () => {
  const youtube = find("YouTube");
  assert.equal(isTrialConverted(youtube), true);
  assert.equal(youtube.amount, 149);
  // The one-rupee hold is evidence, never the price.
  assert.equal(youtube.holds.length, 1);
  assert.equal(youtube.holds[0].amount, 1);
});

test("3. the monthly gym last opened eleven months ago is a zombie", () => {
  const gym = find("FitLine Gym");
  assert.equal(gym.cadence, "monthly");
  assert.equal(isZombie(gym), true);
  assert.equal(gym.kind, "unused");
});

test("4. one Swiggy row is not a commitment", () => {
  assert.equal(commitments.some((item) => item.rawNarration.includes("SWIGGY")), false);
  assert.equal(commitments.some((item) => item.rawNarration.includes("RAHUL")), false);
});

test("5. PayPal Spotify and PayPal Netflix stay two commitments", () => {
  const fixtures = detectCommitments(loadParserFixtures());
  assert.equal(fixtures.length, 2);
  assert.deepEqual(fixtures.map((item) => item.rawNarration).sort(), ["PAYPAL *NETFLIX", "PAYPAL *SPOTIFY"]);
  // They are a parser fixture, so they never touch Priya's year.
  assert.equal(commitments.some((item) => item.rawNarration.startsWith("PAYPAL")), false);
});

test("6. electricity from 900 to 3,200 is one variable commitment", () => {
  const bescom = commitments.filter((item) => item.rawNarration === "BESCOM BILLPAY");
  assert.equal(bescom.length, 1);
  assert.equal(bescom[0].amountPattern, "variable");
  assert.equal(bescom[0].amount, 1800);
  assert.equal(bescom[0].annualCost, 21600);
});

test("7. society on scattered dates is one irregular commitment", () => {
  const society = commitments.filter((item) => item.rawNarration === "NEFT APT SOCIETY");
  assert.equal(society.length, 1);
  assert.equal(society[0].cadence, "irregular");
  assert.equal(society[0].annualCost, 18000);
});

test("8. the loan narration is an obligation with no cancel action", () => {
  const loan = find("Home loan");
  assert.equal(loan.kind, "debt");
  assert.equal(loan.cancelMode, "block");
  assert.equal(loan.canCancel, false);
  assert.equal(loan.signals.includes("obligation"), true);
});

test("9. the next-year projections add to 1,99,138", () => {
  assert.equal(yearlyTotal(commitments), 199138);
  assert.equal(commitments.length, 14);
});

// The screens around those nine.

test("10. the unused part of the year is 27,936", () => {
  assert.equal(unusedTotal(commitments), 27936);
});

test("11. the annual screen splits the year five ways without losing a rupee", () => {
  const split = splitByBucket(commitments);
  assert.equal(split.length, 5);
  assert.equal(split.reduce((sum, group) => sum + group.total, 0), 199138);
  assert.equal(split.find((group) => group.bucket === "debt")?.total, 102000);
  assert.equal(split.find((group) => group.bucket === "bills")?.total, 54000);
});

test("12. every kind still has its own group", () => {
  assert.equal(Object.keys(groupByKind(commitments)).length, 5);
});

test("13. a recent open is not a zombie", () => {
  assert.equal(isZombie(find("Netflix")), false);
  assert.equal(find("Netflix").kind, "essential");
});

test("14. simulating a new autopay detects Headspace and moves the year to 2,02,726", () => {
  const simulated = detectCommitments(withSimulatedAutopay(dataset));
  const headspace = simulated.find((item) => item.merchant === "Headspace Plus")!;
  assert.equal(headspace.amount, 299);
  assert.equal(headspace.annualCost, 3588);
  assert.equal(headspace.kind, "essential");
  assert.equal(headspace.issue, undefined);
  assert.equal(yearlyTotal(simulated), 202726);
  // A second click must not add a second copy.
  assert.equal(detectCommitments(withSimulatedAutopay(withSimulatedAutopay(dataset))).length, simulated.length);
});

test("15. annual rows carry the next charge date and no monthly figure", () => {
  assert.equal(find("Amazon Prime").nextCharge, "2027-08-15");
  assert.equal(find("JioHotstar").nextCharge, "2027-09-03");
  assert.equal(find("Amazon Prime").cadence, "annual");
});

test("16. revoking the gym drops the year by 18,000", () => {
  const withoutGym = commitments.filter((item) => item.merchant !== "FitLine Gym");
  assert.equal(yearlyTotal(commitments) - yearlyTotal(withoutGym), 18000);
});

test("17. every commitment carries its evidence and its cancel copy", () => {
  for (const item of commitments) {
    assert.ok(item.evidenceRows.length >= 1, `${item.id} has no evidence`);
    assert.ok(item.whyRecurring.length > 0, `${item.id} has no recurrence reason`);
    assert.ok(item.stopService.length > 0, `${item.id} has no service step`);
    assert.ok(item.inDictionary, `${item.id} is not in the dictionary`);
  }
});

// Acceptance checks from the visualization guide.

test("18. the year splits into the four spend groups without losing a rupee", () => {
  const slices = groupByCategory(commitments);
  const by = (group: string) => slices.find((slice) => slice.group === group)?.total;
  assert.equal(by("debt"), 102000);
  assert.equal(by("utilities"), 39600);
  assert.equal(by("insurance"), 14400);
  assert.equal(by("subscriptions"), 43138);
  assert.equal(slices.reduce((sum, slice) => sum + slice.total, 0), 199138);
});

test("19. the twelve-month forecast adds to the year and is not annualCost/12", () => {
  const months = monthlyForecast(commitments, dataset.asOf);
  assert.equal(months.length, 12);
  assert.equal(months.reduce((sum, month) => sum + month.total, 0), 199138);
  // A flat year/12 would make every month identical; the annual renewals must not.
  assert.equal(new Set(months.map((month) => month.total)).size > 1, true);
});

test("20. the Spotify hike reads +20 a month, 16.8%, 240 a year", () => {
  const hike = detectPriceHikes(commitments).find((entry) => entry.item.merchant === "Spotify")!;
  assert.equal(hike.from, 119);
  assert.equal(hike.to, 139);
  assert.equal(hike.delta, 20);
  assert.equal(hike.percent, 16.8);
  assert.equal(hike.annualExtra, 240);
  assert.equal(hike.noticed, false);
});

test("21. the price chart is drawn from real dated debits", () => {
  const spotify = find("Spotify");
  assert.equal(spotify.priceSeries.length, 12);
  assert.equal(spotify.priceSeries[0].amount, 119);
  assert.equal(spotify.priceSeries[11].amount, 139);
  assert.equal(spotify.priceSeries.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date)), true);
});

test("22. the what-if totals 27,936 and never offers insurance or the loan", () => {
  const { eligible } = potentialSavings(commitments, []);
  const all = potentialSavings(commitments, eligible.map((item) => item.id));
  assert.equal(all.saved, 27936);
  assert.equal(all.revisedYear, 199138 - 27936);
  assert.equal(eligible.some((item) => item.merchant === "HDFC Life" || item.merchant === "Home loan"), false);
});

test("23. no unconfirmed date is ever plotted", () => {
  const renewals = upcomingRenewals(commitments);
  const society = renewals.find((row) => row.item.merchant === "Society")!;
  assert.equal(society.date, undefined);
  assert.equal(society.confidence, "unknown");
  // A varying bill keeps its date but is labelled an estimate.
  assert.equal(find("BESCOM").dateConfidence, "estimated");
  assert.equal(find("Amazon Prime").dateConfidence, "confirmed");
});

test("24. every commitment knows when it started and what it has taken", () => {
  const gym = find("FitLine Gym");
  // The mandate predates the first debit, so the mandate date is the start.
  assert.equal(gym.startedOn, "2025-10-28");
  assert.equal(gym.spentToDate, 18000);

  const spotify = find("Spotify");
  // Seven months at 119 and five at 139.
  assert.equal(spotify.spentToDate, 119 * 7 + 139 * 5);

  for (const item of commitments) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(item.startedOn), `${item.id} has no start date`);
    assert.ok(item.spentToDate > 0, `${item.id} has spent nothing`);
    assert.ok(item.startedOn <= item.firstCharge, `${item.id} starts after its first debit`);
  }
});

// The three issues reported on 24 Oct.

test("25. every commitment id is unique, and carries its account", () => {
  const ids = commitments.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  // The id names the account, so the same brand elsewhere cannot collide.
  assert.equal(find("Spotify").id, "spotify-cc-priya-2291");
  assert.equal(find("FitLine Gym").id, "fitline-gym-sav-priya-9912");
});

test("26. one merchant on two accounts stays two commitments", () => {
  const extra = [1, 2, 3].map((n) => ({
    txnId: `TXN-DUP-000${n}`,
    persona: "priya",
    date: `2026-0${n + 5}-16`,
    accountId: "SAV-PRIYA-9912",
    accountType: "savings",
    narration: "NETFLIX.COM",
    debit: 649,
    reference: `DUP00000000${n}`,
    channel: "UPI",
    txnKind: "debit_purchase"
  }));
  const both = detectCommitments({ ...dataset, statement: [...dataset.statement, ...extra] });
  const netflix = both.filter((item) => item.merchant === "Netflix");
  assert.equal(netflix.length, 2);
  assert.equal(new Set(netflix.map((item) => item.id)).size, 2);
  // Cancelling one must not take the other with it.
  const ids = both.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("27. keeping a row settles it everywhere, without moving the year", () => {
  const gym = find("FitLine Gym");
  const before = issueItems(commitments);
  const after = issueItems(commitments, [gym.id]);

  assert.equal(before.some((item) => item.id === gym.id), true);
  assert.equal(after.some((item) => item.id === gym.id), false);
  assert.equal(after.length, before.length - 1);

  // The money still leaves, so the year and the leak total do not move.
  assert.equal(yearlyTotal(commitments), 199138);
  assert.equal(unusedTotal(commitments), 27936);
  assert.equal(keptLeakTotal(commitments, [gym.id]), 18000);
});
