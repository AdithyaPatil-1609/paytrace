/**
 * Any question about a payment is answered from its full record, each amount
 * next to its own date. The first payment of a plan whose price rose was
 * answered with today's price once; these guard against that. Data is made up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readDictionary } from "../data/fixtures";
import { detectCommitments } from "../lib/payments/engine";
import type { StatementRow } from "../lib/payments/types";
import { ABOUT_PAYMENTS, factsFor, record, recordsFor } from "../lib/assistant/facts";

const ASOF = "2026-11-21";
const row = (date: string, debit: number): StatementRow =>
  ({ txnId: date, persona: "p", date, accountId: "a1", accountType: "savings", narration: "DEMOTUNES MUSIC", debit, reference: "", channel: "CARD", txnKind: "debit_purchase" } as StatementRow);
const items = detectCommitments({ asOf: ASOF, notifications: [], mandates: [], dictionary: readDictionary(), usage: [],
  statement: [row("2026-06-09", 59), row("2026-07-09", 59), row("2026-08-09", 59), row("2026-09-09", 69), row("2026-10-09", 69)] });

test("a record keeps each amount with its own date, and when today's price began", () => {
  const facts = record(items[0]);
  assert.deepEqual(facts.first_payment, { date: "9 Jun 2026", amount: "₹59" });
  assert.deepEqual(facts.latest_payment, { date: "9 Oct 2026", amount: "₹69" });
  assert.equal(facts.current_amount, "₹69");
  assert.deepEqual(facts.current_price_since, { date: "9 Sept 2026", amount: "₹69" });
  assert.equal(facts.every_payment?.length, 5);
});

test("a question outside the fixed intents is answered from the named payment's record", () => {
  assert.ok(ABOUT_PAYMENTS.test("when did the first demotunes payment occur?"));
  assert.ok(!ABOUT_PAYMENTS.test("what is the capital of france"));
  const { facts, fallback } = recordsFor("when did the first demotunes payment occur?", items, [], ASOF);
  assert.deepEqual((facts.payments as ReturnType<typeof record>[])[0].first_payment, { date: "9 Jun 2026", amount: "₹59" });
  assert.match(fallback, /The first was ₹59 on 9 Jun 2026/);
});

test("'how much have I paid for it in total' covers everything so far, not 30 days", () => {
  const { facts, fallback } = factsFor({ intent: "spend_total", merchant: "demotunes", amount: null, period: null }, items, ASOF, [], "how much have I paid for demotunes in total");
  assert.equal(facts.total_recurring_spend, "₹315");
  assert.match(fallback, /^₹315 went out on .+ so far, across 5 debits\.$/);
});

test("'since January' runs from 1 January to today, and a price rise carries its yearly cost", async () => {
  const { parsePeriod } = await import("../lib/assistant/facts");
  assert.deepEqual(parsePeriod("since January", ASOF, "past"), { label: "since 1 Jan 2026", start: "2026-01-01", end: ASOF });
  assert.equal((record(items[0]) as Record<string, unknown>).price_rise_per_year, "₹120");
});

test("a skipped stretch is found in code, and a saving question asks what the payment costs a year", () => {
  const gappy = detectCommitments({ asOf: ASOF, notifications: [], mandates: [], dictionary: readDictionary(), usage: [],
    statement: [row("2025-12-17", 500), row("2026-08-17", 500), row("2026-09-17", 500), row("2026-10-17", 500), row("2026-11-17", 500)] })[0];
  assert.deepEqual(record(gappy).gaps_in_payments, ["7 expected payments not seen between 17 Dec 2025 and 17 Aug 2026"]);
  assert.match(String(record(items[0]).gaps_in_payments), /^none/);
  const saving = factsFor({ intent: "set_aside", merchant: "demotunes", amount: null, period: "a year" }, items, ASOF, [], "If I stop demotunes, how much would I save in a year?");
  assert.equal(saving.facts.cost_per_year, "₹828");
});

test("a general question names a payment only by its own name, never by a word in its description", async () => {
  const { loadFixtures } = await import("../data/fixtures");
  const { namedIn } = await import("../lib/assistant/facts");
  const demo = detectCommitments(loadFixtures());
  assert.deepEqual(namedIn("which subscription costs me the most per year?", demo), []);
  assert.deepEqual(namedIn("when did the first spotify payment happen?", demo).map((item) => item.merchant), ["Spotify"]);
  const { facts } = recordsFor("which subscription costs me the most per year?", demo, [], "2026-11-21");
  assert.match(String(facts.costliest_payment_overall), /^Home loan/);
  assert.match(String((facts.subscriptions_from_costliest_to_cheapest as string[])[0]), /^FitLine Gym: ₹18,000 a year/);
});
