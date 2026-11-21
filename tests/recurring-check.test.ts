/**
 * Job 4 in the app: the prompt and input text match what the model was
 * trained on, and the rules in code limit what the model may hide. Every
 * merchant and amount here is made up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readDictionary } from "../data/fixtures";
import { detectCommitments } from "../lib/payments/engine";
import type { StatementRow } from "../lib/payments/types";
import {
  candidateFor, checkHash, mayHide, needsCheck, parseVerdict, railOf, RECURRING_PROMPT, renderCandidate, splitByChecks, type Candidate, type StoredCheck
} from "../lib/payments/recurring-check";

test("the prompt is the one in ml/recurring.py", () => {
  const match = readFileSync("ml/recurring.py", "utf8").match(/SYSTEM_PROMPT = """([\s\S]*?)"""/);
  assert.ok(match);
  assert.equal(RECURRING_PROMPT, match[1].trim());
});

test("the app renders every group character for character as the training data did", () => {
  const rows = readFileSync("ml/data/recurring_render_check.jsonl", "utf8").trim().split("\n").map((line) => JSON.parse(line) as { candidate: Candidate; rendered: string });
  assert.ok(rows.length >= 20);
  for (const row of rows) assert.equal(renderCandidate(row.candidate), row.rendered);
});

test("a reply is read only when well formed, with its kind forced to match the verdict", () => {
  assert.deepEqual(parseVerdict('{"verdict":"everyday_spending","kind":"groceries"}'), { verdict: "everyday_spending", kind: "groceries" });
  assert.deepEqual(parseVerdict('text {"verdict":"commitment","kind":"groceries"} more'), { verdict: "commitment", kind: "unknown" });
  assert.equal(parseVerdict('{"verdict":"maybe"}'), null);
  assert.equal(parseVerdict("no json"), null);
});

const ASOF = "2026-11-21";
const row = (narration: string, date: string, debit: number, channel = "UPI"): StatementRow =>
  ({ txnId: `${narration}-${date}`, persona: "p", date, accountId: "a1", accountType: "savings", narration, debit, reference: "", channel, txnKind: "debit_purchase" } as StatementRow);
const items = detectCommitments({
  asOf: ASOF, notifications: [], mandates: [], dictionary: readDictionary(), usage: [],
  statement: [
    row("UPI/DEMOMART SUPERMARKET", "2026-08-04", 2140), row("UPI/DEMOMART SUPERMARKET", "2026-09-03", 1985.5), row("UPI/DEMOMART SUPERMARKET", "2026-10-05", 2302),
    row("NETFLIX.COM", "2026-08-16", 649, "CARD"), row("NETFLIX.COM", "2026-09-16", 649, "CARD"), row("NETFLIX.COM", "2026-10-16", 649, "CARD")
  ]
});
const shop = items.find((item) => item.rawNarration.includes("DEMOMART"))!;
const known = items.find((item) => item.merchant === "Netflix")!;

test("the rail comes from the statement text; a bare name is unknown", () => {
  assert.equal(railOf(shop), "UPI");
  assert.equal(railOf({ ...shop, rawNarration: "NACH/DEMOLOAN/1" }), "NACH");
  assert.equal(railOf({ ...shop, rawNarration: "DEMOMART" }), "unknown");
});

test("the model may never hide a dictionary plan, a mandate, a noticed payment or a loan", () => {
  assert.equal(mayHide(shop), true);
  assert.equal(mayHide(known), false, "in the dictionary");
  assert.equal(mayHide({ ...shop, mandateRef: "UMRN1" }), false);
  assert.equal(mayHide({ ...shop, hasPriceChangeNotice: true }), false);
  assert.equal(mayHide({ ...shop, basis: "notices" }), false);
  assert.equal(mayHide({ ...shop, cancelMode: "block" }), false);
});

const check = (extra: Partial<StoredCheck> = {}): StoredCheck =>
  ({ commitmentId: shop.id, hash: checkHash(candidateFor(shop)), verdict: "everyday_spending", kind: "groceries", model: "test", personSays: null, ...extra });

test("a fresh everyday verdict moves the shop out; a stale one or the person's word keeps it", () => {
  const moved = splitByChecks(items, [check()]);
  assert.deepEqual(moved.everyday.map((entry) => entry.item.id), [shop.id]);
  assert.ok(moved.commitments.some((item) => item.id === known.id));
  assert.equal(splitByChecks(items, [check({ hash: "older-rows" })]).everyday.length, 0, "new payments since the check");
  assert.equal(splitByChecks(items, [check({ personSays: "commitment" })]).everyday.length, 0);
  assert.equal(splitByChecks(items, [check({ verdict: "unsure" })]).everyday.length, 0);
  assert.equal(splitByChecks(items, [{ ...check(), commitmentId: known.id, hash: checkHash(candidateFor(known)) }]).everyday.length, 0, "the rules win over the model");
});

test("only groups the model could move are sent to it, and only once per set of rows", () => {
  assert.deepEqual(needsCheck(items, []).map((item) => item.id), [shop.id]);
  assert.deepEqual(needsCheck(items, [check()]), []);
});
