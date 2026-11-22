// Checks that the words of a statement PDF become the right CSV rows.
// The layouts are made up and imitate common net-banking tables. No real statement or account.
import assert from "node:assert/strict";
import test from "node:test";
import { headerCells, pdfLines, pdfWordsToCsv, type PdfWord } from "../lib/statements/pdf";
import { parseStatementCsv } from "../lib/statements/csv";

/** Words on one line at height y, each given as [text, x]. Width is a rough 6 points per character. */
const line = (y: number, cells: [string, number][], page = 1): PdfWord[] => cells.map(([str, x]) => ({ str, x, y, w: str.length * 6, page }));

const DEBIT_CREDIT: PdfWord[] = [
  ...line(800, [["DEMO BANK · Account statement", 40]]),
  ...line(760, [["Date", 40], ["Narration", 110], ["Chq./Ref.No.", 300], ["Value", 380], ["Dt", 412], ["Withdrawal", 440], ["Amt.", 502], ["Deposit", 540], ["Amt.", 586], ["Closing", 640], ["Balance", 684]]),
  ...line(740, [["03/10/26", 40], ["UPI-DEMOFLIX STREAMING", 110], ["0000123456789", 300], ["03/10/26", 380], ["649.00", 470], ["24,351.00", 660]]),
  ...line(728, [["MONTHLY PLAN", 110]]),
  ...line(712, [["05/10/26", 40], ["NEFT CR-DEMO EMPLOYER", 110], ["0000987654321", 300], ["05/10/26", 380], ["50,000.00", 556], ["74,351.00", 660]]),
  ...line(696, [["12/10/26", 40], ["ACH D- DEMO HOME LOAN EMI", 110], ["0000555444333", 300], ["12/10/26", 380], ["18,250.00", 462], ["56,101.00", 660]]),
  ...line(670, [["Page 1 of 1", 40]]),
  ...line(650, [["Opening Balance", 40], ["25,000.00", 660]])
];

test("finds the header even when its words are split", () => {
  const header = headerCells(pdfLines(DEBIT_CREDIT)[1]);
  assert.ok(header, "header row recognised");
  assert.deepEqual(header!.map((c) => c.kind).sort(), ["balance", "credit", "date", "debit", "narration", "reference"]);
});

test("debit and credit columns: each amount lands under its own heading, balances are dropped", () => {
  const out = pdfWordsToCsv(DEBIT_CREDIT);
  assert.ok(out.ok, out.ok ? "" : out.error);
  if (!out.ok) return;
  assert.equal(out.rows, 3);
  assert.deepEqual(out.csv.split("\n"), [
    "Date,Narration,Debit,Credit",
    "2026-10-03,UPI-DEMOFLIX STREAMING MONTHLY PLAN,649.00,",
    "2026-10-05,NEFT CR-DEMO EMPLOYER,,\"50,000.00\"",
    "2026-10-12,ACH D- DEMO HOME LOAN EMI,\"18,250.00\","
  ]);
  assert.ok(!out.csv.includes("0000123456789"), "reference numbers are not carried into the description");
  assert.ok(!/24,351|74,351|Page 1|Opening/.test(out.csv), "balances, footers and summary lines are left out");
});

test("the CSV it makes is accepted by the same importer as a downloaded CSV", () => {
  const out = pdfWordsToCsv(DEBIT_CREDIT);
  assert.ok(out.ok);
  if (!out.ok) return;
  const parsed = parseStatementCsv(out.csv);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.lines.map((l) => [l.date, l.type, l.amount]), [["2026-10-03", "DEBIT", 649], ["2026-10-05", "CREDIT", 50000], ["2026-10-12", "DEBIT", 18250]]);
});

test("one amount column with Dr/Cr, header repeated on page 2", () => {
  const head = (y: number, page: number) => line(y, [["Txn", 40], ["Date", 64], ["Description", 130], ["Amount", 420], ["Dr/Cr", 500], ["Balance", 560]], page);
  const words = [
    ...head(760, 1),
    ...line(740, [["21 Nov 2026", 40], ["DEMOMUSIC SUBSCRIPTION", 130], ["119.00", 420], ["Dr", 502], ["9,881.00", 560]], 1),
    ...head(760, 2),
    ...line(740, [["22-Nov-2026", 40], ["REFUND DEMOMART", 130], ["250.00", 420], ["Cr", 502], ["10,131.00", 560]], 2)
  ];
  const out = pdfWordsToCsv(words);
  assert.ok(out.ok, out.ok ? "" : out.error);
  if (!out.ok) return;
  assert.deepEqual(out.csv.split("\n"), ["Date,Narration,Amount,Type", "2026-11-21,DEMOMUSIC SUBSCRIPTION,119.00,DR", "2026-11-22,REFUND DEMOMART,250.00,CR"]);
});

test("clear messages when a PDF cannot be read", () => {
  const scanned = pdfWordsToCsv(line(700, [["1", 10]]));
  assert.ok(!scanned.ok && /scanned/.test(scanned.error));
  const noTable = pdfWordsToCsv(line(700, [["Dear customer, thank you for banking with us. Your statement is attached.", 10]]));
  assert.ok(!noTable.ok && /transaction table/.test(noTable.error));
  const headerOnly = pdfWordsToCsv([...line(760, [["Date", 40], ["Particulars", 110], ["Debit", 440], ["Credit", 540], ["Balance", 640]]), ...line(700, [["No transactions in this period for the selected account", 40]])]);
  assert.ok(!headerOnly.ok && /no transactions/i.test(headerOnly.error));
});
