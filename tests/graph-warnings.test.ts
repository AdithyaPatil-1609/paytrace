/** Pure helpers behind the live graph warnings: cycle names, next dates, savings, classes. */
import assert from "node:assert/strict";
import test from "node:test";
import { annualPaise, classifyPrice, frequencyOf, nextDate, severityOf } from "../db/neo4j/warnings";

test("cycle lengths are named, odd ones are 'other'", () => {
  assert.deepEqual([7, 30, 91, 182, 365, 45, null].map(frequencyOf), ["weekly", "monthly", "quarterly", "half-yearly", "yearly", "other", "unknown"]);
});

test("monthly and longer cycles step by calendar month and clamp short months", () => {
  assert.equal(nextDate("2026-10-25", 30), "2026-11-25");
  assert.equal(nextDate("2026-01-31", 31), "2026-02-28");
  assert.equal(nextDate("2026-02-15", 91), "2026-05-15");
  assert.equal(nextDate("2026-03-01", 365), "2027-03-01");
  assert.equal(nextDate("2026-11-20", 7), "2026-11-27");
});

test("annual cost uses the named cycle, else 365 / gap", () => {
  assert.equal(annualPaise(19900, 30), 238800);
  assert.equal(annualPaise(10000, 45), Math.round(10000 * 365 / 45));
  assert.equal(annualPaise(10000, null), null);
});

test("a rise is notified only with a notice; silent needs visible email; else unknown", () => {
  const notice = [{ id: "n", source: "email", kind: "price_change", date: "2026-08-20" }];
  assert.equal(classifyPrice(notice, 0), "NOTIFIED_PRICE_INCREASE");
  assert.equal(classifyPrice([], 2), "POSSIBLE_SILENT_PRICE_INCREASE");
  assert.equal(classifyPrice([], 1), "INSUFFICIENT_EVIDENCE");
  assert.deepEqual([2, 10, 20].map(severityOf), ["low", "medium", "high"]);
});
