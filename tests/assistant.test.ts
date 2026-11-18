import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hasSecret } from "../lib/assistant/secrets";
import { ALERT_PROMPT, INTENT_PROMPT } from "../lib/assistant/prompts";
import { factsFor, findPayments, parsePeriod, PRICE_QUESTION, priceChanges } from "../lib/assistant/facts";
import { ask, BLOCKED_REPLY, grounded, looksLikeAlert, parseRouted } from "../lib/assistant/assistant";
import { cleanEvent, parseEvent, readAlertWith } from "../lib/assistant/alert-reader";
import { loadFixtures } from "../data/fixtures";
import { detectCommitments } from "../lib/payments/engine";

const dataset = loadFixtures();
const items = detectCommitments(dataset);
const asOf = dataset.asOf;

/* ---------------- secrets: the same cases as ml/test_secret_filter.py ---------------- */

const SECRETS = [
  "123456 is your OTP for Autopay setup of Rs 299 with HEADSPACE.",
  "OTP for txn of Rs 649 is 482199. Valid for 5 mins.",
  "Use OTP 554433 to verify your mandate.",
  "Your PIN: 1234 has been reset",
  "Your one-time password for card XX2291 is 90210",
  "4821 is the OTP to approve Netflix autopay. Never share it with anyone.",
  "Your UPI PIN reset OTP is 771204."
];

const NOT_SECRETS = [
  "Approve the UPI Autopay request from JioHotstar using your UPI PIN in your UPI app.",
  "Approve the autopay request from Cult.fit for Rs 1499 monthly using your UPI PIN.",
  "Never share your OTP or PIN with anyone. -Arclight Bank",
  "Rs.139.00 spent on card XX2291 at SPOTIFY on 11-11-2026.",
  "Your A/c XX9912 debited INR 1,500.00 on 04/11/26. Ref 432198765432. Do not share OTP.",
  "Refund of INR 149.00 credited to your a/c **9912 on 13 Nov. Ref no. RFD77812.",
  "Rs.1500.00 debited for OTT pack. Use your UPI PIN only in the app."
];

test("the secret filter drops every message with an OTP or PIN", () => {
  for (const message of SECRETS) assert.equal(hasSecret(message), true, message);
});

test("the secret filter keeps payment alerts that only mention OTPs or PINs", () => {
  for (const message of NOT_SECRETS) assert.equal(hasSecret(message), false, message);
});

test("the secret filter matches the Python cases word for word", () => {
  const python = readFileSync("ml/test_secret_filter.py", "utf8");
  for (const message of [...SECRETS, ...NOT_SECRETS]) assert.ok(python.includes(JSON.stringify(message).slice(1, -1)), message);
});

test("a secret never reaches a model", async () => {
  // No model is running in tests: if ask() called one, it would answer "offline" instead.
  const reply = await ask(SECRETS[1], items, asOf);
  assert.equal(reply.kind, "blocked");
  assert.equal(reply.reply, BLOCKED_REPLY);
});

/* ---------------- the app uses the prompts the models were scored with ---------------- */

function pythonPrompt(file: string) {
  const source = readFileSync(file, "utf8");
  const match = source.match(/SYSTEM_PROMPT = """([\s\S]*?)"""/);
  assert.ok(match, `${file} has a SYSTEM_PROMPT`);
  return match[1].trim();
}

test("the intent and alert prompts are the same as in ml/", () => {
  assert.equal(INTENT_PROMPT, pythonPrompt("ml/intent.py"));
  assert.equal(ALERT_PROMPT, pythonPrompt("ml/alerts.py"));
});

/* ---------------- dates ---------------- */

test("time words turn into date ranges from the as-of day", () => {
  assert.deepEqual(
    { start: parsePeriod("next month", "2026-10-22", "future").start, end: parsePeriod("next month", "2026-10-22", "future").end },
    { start: "2026-11-01", end: "2026-11-30" }
  );
  assert.equal(parsePeriod("this month", "2026-10-22", "future").end, "2026-10-31");
  assert.equal(parsePeriod("last month", "2026-10-22", "past").start, "2026-09-01");
  assert.equal(parsePeriod("next 7 days", "2026-10-22", "future").end, "2026-10-29");
  assert.ok(parsePeriod("before salary", "2026-10-22", "future").note);
  const range = parsePeriod("between 1st and 15th november", "2026-10-22", "future");
  assert.deepEqual([range.start, range.end], ["2026-11-01", "2026-11-15"]);
  assert.equal(parsePeriod(null, "2026-10-22", "future").label, "the next 30 days");
  assert.ok(parsePeriod("whenever-ish", "2026-10-22", "future").note, "unreadable time words fall back to 30 days, and say so");
});

/* ---------------- finding the payment the person means ---------------- */

test("vague or misspelt names find the right payment", () => {
  const name = (text: string) => findPayments(text, items).map((item) => item.merchant);
  assert.deepEqual(name("spotfy"), ["Spotify"]);
  assert.deepEqual(name("the gym"), ["FitLine Gym"]);
  assert.deepEqual(name("hdfc life"), ["HDFC Life"]);
  assert.deepEqual(name("hotstar"), ["JioHotstar"]);
  assert.deepEqual(name("zzz unknown shop"), []);
});

/* ---------------- facts are computed in code ---------------- */

test("next month's total is the sum of the charges due in it", () => {
  const { facts, ids } = factsFor({ intent: "upcoming_total", merchant: null, amount: null, period: "next month" }, items, asOf);
  assert.equal(facts.found, true);
  assert.ok((facts.number_of_payments as number) > 0);
  assert.ok(String(facts.total).startsWith("₹"));
  assert.ok(ids.length > 0);
});

test("an empty period names the next payment instead of only saying zero", () => {
  const { facts, fallback } = factsFor({ intent: "upcoming_total", merchant: null, amount: null, period: "this month" }, items, asOf);
  assert.equal(facts.number_of_payments, 0);
  assert.ok(facts.next_payment_after_this_period);
  assert.match(fallback, /The next is/);
});

test("why a debit happened carries the price change", () => {
  const { facts, ids } = factsFor({ intent: "why_debit", merchant: "spotify", amount: null, period: null }, items, asOf);
  assert.equal(facts.found, true);
  assert.equal(ids.length, 1);
  assert.match(JSON.stringify(facts), /₹139/);
  assert.match(JSON.stringify(facts), /₹119/);
});

test("an amount alone finds the payment when no name is given", () => {
  const { facts, ids } = factsFor({ intent: "why_debit", merchant: null, amount: 1500, period: null }, items, asOf);
  assert.equal(facts.found, true);
  assert.equal(items.find((item) => item.id === ids[0])?.merchant, "FitLine Gym");
});

test("'per year' is a rate, so it answers with the payment's yearly cost", () => {
  const { facts } = factsFor({ intent: "upcoming_total", merchant: "canva", amount: null, period: "per year" }, items, asOf);
  assert.ok(facts.cost_per_year);
});

test("a payment with no fixed date says so instead of only 'nothing due'", () => {
  const { fallback } = factsFor({ intent: "upcoming_total", merchant: "society", amount: null, period: null }, items, asOf);
  assert.match(fallback, /no fixed date/);
});

test("price rises are listed with whether a notice was found", () => {
  assert.ok(PRICE_QUESTION.test("is there any price hike I should know about"));
  assert.ok(!PRICE_QUESTION.test("how much will go out next month"));
  const { facts, fallback } = priceChanges(items);
  assert.ok((facts.number_of_price_rises as number) >= 1);
  assert.match(fallback, /Spotify went from ₹119 to ₹139/);
});

test("a loan's cancel answer warns instead of telling them to stop it", () => {
  const { facts, fallback } = factsFor({ intent: "how_to_cancel", merchant: "home loan", amount: null, period: null }, items, asOf);
  assert.ok(facts.caution);
  assert.match(fallback, /loan/i);
});

test("an unknown payment asks for the statement name", () => {
  const { facts, ids } = factsFor({ intent: "why_debit", merchant: "zzz unknown shop", amount: null, period: null }, items, asOf);
  assert.equal(facts.found, false);
  assert.deepEqual(ids, []);
});

/* ---------------- the model's wording is checked ---------------- */

test("an answer with a number that is not in the facts is rejected", () => {
  const facts = { found: true, amount: "₹1,500", date: "4 Nov 2026" };
  assert.equal(grounded("The gym takes ₹1,500 on 4 Nov 2026.", facts), true);
  assert.equal(grounded("The gym takes ₹1,800 on 4 Nov 2026.", facts), false);
  assert.equal(grounded("The gym takes ₹1500.", facts), true, "commas do not matter");
  assert.equal(grounded("One. Two. Three. Four. Five.", facts), false, "at most four sentences");
  assert.equal(grounded("Ask the bank to block GOOGLE*ONE.", facts), true, "a star in a descriptor is not markdown");
  assert.equal(grounded("See **this**.", facts), false, "no markdown");
});

test("the router's reply is read strictly", () => {
  assert.deepEqual(parseRouted('{"intent":"spend_total","merchant":null,"amount":null,"period":"last month"}'), {
    intent: "spend_total",
    merchant: null,
    amount: null,
    period: "last month"
  });
  assert.equal(parseRouted('{"intent":"buy_stocks"}'), null);
  assert.equal(parseRouted("not json"), null);
});

/* ---------------- pasted alerts ---------------- */

test("pasted alerts are told apart from questions", () => {
  assert.equal(looksLikeAlert("Rs.139.00 spent on card XX2291 at SPOTIFY on 11-11-2026."), true);
  assert.equal(looksLikeAlert("Why was Rs 139 charged on my card?"), false);
  assert.equal(looksLikeAlert("How much will go out next month?"), false);
});

test("alert JSON is cleaned by the spec's rules", () => {
  assert.equal(cleanEvent(parseEvent('{"kind":"made_up"}')), null);
  assert.deepEqual(cleanEvent(parseEvent('{"kind":"not_payment","merchantText":"X","amountPaise":5}')), {
    kind: "not_payment",
    merchantText: null,
    amountPaise: null
  });
  assert.equal(cleanEvent(parseEvent('```json\n{"kind":"debit_posted","dueOn":"2026-11-01"}\n```'))?.dueOn, null);
});

test("the alert reader falls back to the next model when the first is down", async () => {
  const down = async () => {
    throw new Error("down");
  };
  const up = async () => '{"kind":"refund","merchantText":"YouTube","amountPaise":14900,"occurredOn":null,"dueOn":null,"reference":null,"accountHint":null}';
  const { event, model } = await readAlertWith("Refund of INR 149.00", asOf, [
    { name: "first", ask: down },
    { name: "second", ask: up }
  ]);
  assert.equal(model, "second");
  assert.equal(event?.kind, "refund");
});
