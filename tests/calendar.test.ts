import assert from "node:assert/strict";
import test from "node:test";
import { nextMonthSchedule } from "@/lib/payments/calendar";
import { detectCommitments } from "@/lib/payments/engine";
import { loadFixtures } from "@/data/fixtures";

const item = detectCommitments(loadFixtures())[0];
test("next-month schedule crosses year boundaries and clamps month-end payments", () => {
  const result = nextMonthSchedule([{ ...item, cadence: "monthly", lastCharge: "2026-12-31", nextCharge: undefined, dateConfidence: "confirmed" }], "2026-12-22");
  assert.equal(result.year, 2027);
  assert.equal(result.month, 0);
  assert.equal(result.rows[0].day, 31);
  assert.equal(nextMonthSchedule([{ ...item, cadence: "monthly", nextCharge: "2027-01-31", dateConfidence: "confirmed" }], "2027-01-22").rows[0].day, 28);
});
test("weekly charges repeat, annual renewals outside the month do not appear, and unknown dates stay unplotted", () => {
  const weekly = { ...item, cadence: "weekly" as const, nextCharge: "2026-10-26", dateConfidence: "confirmed" as const };
  const annual = { ...item, id: "annual", cadence: "annual" as const, nextCharge: "2026-12-05", dateConfidence: "confirmed" as const };
  const unknown = { ...item, id: "unknown", dateConfidence: "unknown" as const };
  const result = nextMonthSchedule([weekly, annual, unknown], "2026-10-22");
  assert.deepEqual(result.rows.map(row => row.day), [2, 9, 16, 23, 30]);
  assert.deepEqual(result.undated.map(row => row.id), ["unknown"]);
});
