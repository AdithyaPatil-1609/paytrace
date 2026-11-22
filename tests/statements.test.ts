/**
 * Bank statements: the CSV reader on real bank layouts, the generated sample,
 * and the demo sandbox using a statement in place of the demo person's.
 * All data is made up.
 */
import { isManualTransfer } from "../server/payments/engine";
import test from "node:test";
import assert from "node:assert/strict";
import { cleanNarration, parseStatementCsv, statementAmount, statementDate } from "../server/statements/csv";
import { generateStatement, statementCsv } from "../server/statements/generate";
import { clearSandboxes, getSandbox, openSandbox } from "../server/sandbox/store";
import { clearStatement, loadSampleStatement, loadUploadedStatement } from "../server/sandbox/statement";
import { sandboxView } from "../server/sandbox/dataset";
import { loadFixtures } from "../data/fixtures";

const HDFC = `HDFC BANK Ltd.\nStatement of accounts\n\nDate,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance
01/11/26,UPI-NETFLIX-netflix@hdfc-123456789012,000012345678,01/11/26,649.00,,50000.00
02/11/26,NEFT CR-SALARY,N123,02/11/26,,90000.00,140000.00
05-Nov-2026,"ACH D- LIC HSG, EMI",ACH1,05/11/26,"8,500.00",,131500.00\n`;
const SBI = "Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tDebit\tCredit\tBalance\n3 Nov 2026\t3 Nov 2026\tTO TRANSFER-UPI/DR/123456789012/SPOTIFY\tTRF\t119.00\t \t1000\n4 Nov 2026\t4 Nov 2026\tBY TRANSFER-NEFT\tTRF\t \t5000\t6000\n5 Nov 2026\t5 Nov 2026\tATM WDL\tX\t2000\t\t4000\n";

test("reads HDFC-style and SBI-style exports, day first, with Indian amounts", () => {
  const h = parseStatementCsv(HDFC);
  assert.ok(h.ok);
  if (h.ok) {
    assert.deepEqual(h.lines.map(l => [l.date, l.type, l.amount]), [["2026-11-01", "DEBIT", 649], ["2026-11-02", "CREDIT", 90000], ["2026-11-05", "DEBIT", 8500]]);
    assert.ok(!h.lines[0].narration.includes("123456789012"), "long numbers are removed");
  }
  const s = parseStatementCsv(SBI);
  assert.ok(s.ok);
  if (s.ok) assert.deepEqual(s.lines.map(l => [l.type, l.amount]), [["DEBIT", 119], ["CREDIT", 5000], ["DEBIT", 2000]]);
});

test("a single signed Amount column: minus is a debit", () => {
  const r = parseStatementCsv("Date,Description,Amount\n2026-11-01,Netflix,-649\n2026-11-02,Salary,90000\n2026-11-03,Gym,-1500\n");
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.lines.map(l => l.type), ["DEBIT", "CREDIT", "DEBIT"]);
});

test("wrong files are refused with a clear reason", () => {
  const pdf = parseStatementCsv("%PDF-1.7 binary");
  assert.equal(pdf.ok, false);
  const noColumns = parseStatementCsv("name,city\nA,B\nC,D\nE,F\n");
  assert.ok(!noColumns.ok && /date column/.test(noColumns.error));
  const tooFew = parseStatementCsv("Date,Narration,Debit,Credit\n01/11/2026,X,10,\n");
  assert.ok(!tooFew.ok && /Only 1/.test(tooFew.error));
  assert.equal(parseStatementCsv("Date,Narration,Debit\n" + "01/11/2026,X,1\n".repeat(60000)).ok, false, "too large");
});

test("dates, amounts and descriptions are read carefully", () => {
  assert.equal(statementDate("31/02/2026"), null);
  assert.equal(statementDate("Nov 21, 2026"), "2026-11-21");
  assert.equal(statementAmount("₹1,23,456.50"), 123456.5);
  assert.equal(statementAmount("(120.00)"), -120);
  assert.equal(statementAmount("abc"), null);
  assert.equal(cleanNarration("UPI/RENT MR SHARMA/9812345678"), "UPI/RENT MR SHARMA/");
});

test("every random sample person raises all four warnings, and nothing from one-off spending", () => {
  for (let i = 0; i < 40; i++) {
    clearSandboxes();
    const box = openSandbox("a".repeat(32));
    loadSampleStatement(box, i % 2 ? "2026-11-21" : "2026-02-27", `seed-${i}`);
    const view = sandboxView(getSandbox("a".repeat(32)));
    const kinds = new Set(view.alerts.map(a => a.kind));
    for (const kind of ["price_rise", "unused", "upcoming", "after_cancel"] as const) assert.ok(kinds.has(kind), `seed-${i}: ${kind}`);
    assert.ok(!view.alerts.some(a => /DMART|ATM|SWIGGY|RENT/.test(a.title)), `seed-${i}`);
    assert.equal(view.statement?.source, "sample");
  }
});

test("each click makes a different person", () => {
  clearSandboxes();
  const box = openSandbox("d".repeat(32));
  loadSampleStatement(box, "2026-11-21");
  const first = box.statement!.lines.map(l => `${l.narration}${l.amount}`).join();
  loadSampleStatement(box, "2026-11-21");
  assert.notEqual(box.statement!.lines.map(l => `${l.narration}${l.amount}`).join(), first);
  assert.match(box.statement!.name, /#2/);
});

test("an uploaded statement replaces the demo data for that visitor only, and can be removed", () => {
  clearSandboxes();
  const csv = statementCsv(generateStatement("x", "2026-11-21"));
  const entry = loadUploadedStatement(openSandbox("b".repeat(32)), "my-bank.csv", csv);
  assert.equal(entry.accepted, true);
  const mine = sandboxView(getSandbox("b".repeat(32)));
  assert.equal(mine.statement?.name, "my-bank.csv");
  assert.ok(mine.dataset.statement.every(row => row.persona === "visitor"));
  const someoneElse = sandboxView(getSandbox("c".repeat(32)));
  assert.equal(someoneElse.dataset.statement.length, loadFixtures().statement.length);
  clearStatement(getSandbox("b".repeat(32))!);
  assert.equal(sandboxView(getSandbox("b".repeat(32))).statement, null);
});

// ---- signed-in import ------------------------------------------------------
import { statementEvents, merchantFromNarration } from "../server/statements/events";
import { validateEvent } from "../server/ingestion/event";
import { NextRequest } from "next/server";
import { POST as importStatement } from "../web/app/api/account/statement/route";

test("only debits become payments, each with a stable id; identical lines stay two", () => {
  const parsed = parseStatementCsv(statementCsv(generateStatement("y", "2026-11-21")));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  const first = statementEvents(parsed.lines), again = statementEvents(parsed.lines);
  assert.equal(first.events.length, parsed.lines.filter(l => l.type === "DEBIT").length - first.skipped);
  assert.ok(first.events.every(e => e.source === "statement" && e.kind === "debit_posted" && (e.amountPaise ?? 0) > 0));
  assert.deepEqual(first.events.map(e => e.sourceId), again.events.map(e => e.sourceId), "the same file gives the same ids");
  const twin = { date: "2026-11-01", narration: "POS 1234 CAFE COFFEE DAY", amount: 180, type: "DEBIT" as const, reference: null };
  const two = statementEvents([twin, twin]).events;
  assert.equal(two.length, 2);
  assert.notEqual(two[0].sourceId, two[1].sourceId);
});

test("statement merchants are cleaned, and a statement line can only be a debit", () => {
  assert.equal(merchantFromNarration("UPI/NETFLIX/<script>"), "UPI/NETFLIX/ script");
  assert.equal(merchantFromNarration("---"), null);
  assert.throws(() => validateEvent({ source: "statement", kind: "price_change", merchant: "X", amountPaise: 100, date: "2026-11-01", reference: null, sourceId: "abc123" }));
});

test("the import route needs a signed-in request from our own site", async () => {
  Object.assign(process.env, { GOOGLE_WEB_CLIENT_ID: "id", GOOGLE_WEB_CLIENT_SECRET: "secret", PAYTRACE_APP_URL: "https://paytrace.co.in/", PAYTRACE_AUTH_KEY: "ab".repeat(32) });
  const send = (origin: string) => importStatement(new NextRequest("https://paytrace.co.in/api/account/statement", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ name: "s.csv", csv: "x" }) }));
  assert.equal((await send("https://evil.example")).status, 403);
  assert.equal((await send("https://paytrace.co.in")).status, 401);
});

test("rent and other hand-sent UPI, IMPS or NEFT transfers are never auto debits", () => {
  assert.equal(isManualTransfer("UPI/RENT MR SHARMA/"), true);
  assert.equal(isManualTransfer("IMPS/P2A/RAVI KUMAR"), true);
  assert.equal(isManualTransfer("NEFT RENT JULY"), true);
  assert.equal(isManualTransfer("UPI AUTOPAY/NETFLIX"), false);
  assert.equal(isManualTransfer("ACH DR LIC HSG EMI"), false);
  assert.equal(isManualTransfer("NACH/HDFC LIFE"), false);
  assert.equal(isManualTransfer("NETFLIX.COM"), false);
});
