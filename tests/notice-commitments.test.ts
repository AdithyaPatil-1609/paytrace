/**
 * A Gmail-only account has notices, not bank debits. These rows let it show
 * its repeating payments, marked "notices" so screens never call them paid.
 * Every merchant and amount here is made up.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { noticeRows } from "../db/neo4j/live";
import { detectCommitments, NOTICE_CHANNEL } from "../lib/payments/engine";
import { readDictionary } from "../data/fixtures";
import type { StatementRow } from "../lib/payments/types";

const ASOF = "2026-11-21";
const notice = (id: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, kind: "subscription_renewal", merchant: "DEMOCLOUD", amountPaise: 74900, date, accountHint: "", reference: null, ...extra
});

test("renewal and scheduled-debit notices become dated rows marked as notices", () => {
  const rows = noticeRows([], [notice("a", "2026-09-10"), notice("b", "2026-10-10", { kind: "debit_scheduled" })], "p1", ASOF);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.channel === NOTICE_CHANNEL && row.debit === 749));
});

test("a notice is dropped when a bank debit confirms it, when repeated, when ahead, or with no amount", () => {
  const paid = [{ txnId: "t1", persona: "p1", date: "2026-09-10", accountId: "x", accountType: "unknown", narration: "DEMOCLOUD", debit: 749, reference: "", channel: "sms", txnKind: "debit_purchase" } as StatementRow];
  const rows = noticeRows(
    paid,
    [
      notice("a", "2026-09-10"),
      notice("b", "2026-10-10"),
      notice("c", "2026-10-10"),
      notice("d", "2026-12-10"),
      notice("e", "2026-08-10", { amountPaise: null }),
      notice("f", "2026-08-10", { kind: "subscription_candidate" })
    ],
    "p1",
    ASOF
  );
  assert.deepEqual(rows.map((row) => row.txnId), ["notice-b"]);
});

test("the renewal date on a notice wins over the day the email came", () => {
  const [row] = noticeRows([], [notice("a", "2026-10-03", { renewalDate: "2026-10-10" })], "p1", ASOF);
  assert.equal(row.date, "2026-10-10");
});

const dataset = (statement: StatementRow[]) => ({ asOf: ASOF, statement, notifications: [], mandates: [], dictionary: readDictionary(), usage: [] });

test("a repeating payment built only from notices says so", () => {
  const rows = noticeRows([], [notice("a", "2026-08-10"), notice("b", "2026-09-10"), notice("c", "2026-10-10")], "p1", ASOF);
  const found = detectCommitments(dataset(rows));
  assert.equal(found.length, 1);
  assert.equal(found[0].basis, "notices");
});

test("one real debit among the rows makes it a debit-based payment", () => {
  const paid = { txnId: "t1", persona: "p1", date: "2026-10-10", accountId: "x", accountType: "unknown", narration: "DEMOCLOUD", debit: 749, reference: "", channel: "sms", txnKind: "debit_purchase" } as StatementRow;
  const rows = noticeRows([paid], [notice("a", "2026-08-10"), notice("b", "2026-09-10")], "p1", ASOF);
  assert.ok(rows.every((row) => row.accountId === "x"), "the notice takes the debit's account");
  const found = detectCommitments(dataset([...rows, paid]));
  assert.equal(found.length, 1);
  assert.equal(found[0].basis, "debits");
});
