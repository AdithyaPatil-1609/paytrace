/**
 * Turns the words of a bank statement PDF into the same CSV the CSV import
 * reads. Banks lay out their tables differently, so the header row (Date,
 * Withdrawal, Deposit, Balance...) is found by name and each amount is put in
 * the column it sits under. Pure: the browser extracts the words with pdf.js,
 * this decides what they mean, and the PDF itself never leaves the device.
 */
import { key, NAMES, statementAmount, statementDate } from "./csv";

/** One run of text on a page, as pdf.js reports it (x from the left, y from the bottom). */
export type PdfWord = { str: string; x: number; y: number; w: number; page: number };
export type PdfCsv = { ok: true; csv: string; rows: number } | { ok: false; error: string };

type Kind = "date" | "narration" | "debit" | "credit" | "amount" | "type" | "reference" | "balance";
type Cell = { kind: Kind; x: number; right: number };
type Line = { page: number; y: number; words: PdfWord[] };

const BALANCE = ["balance", "closingbalance", "runningbalance", "bal", "balanceinr", "availablebalance"];
const KINDS: [Kind, readonly string[]][] = [
  ["date", NAMES.date], ["narration", NAMES.narration], ["debit", NAMES.debit], ["credit", NAMES.credit],
  ["amount", NAMES.amount], ["type", NAMES.type], ["reference", NAMES.reference], ["balance", BALANCE]
];
const MONEY = /^\(?-?(?:₹|rs\.?|inr)?\s*\d{1,3}(?:,\d{2,3})*(?:\.\d{2})\)?\s*(?:dr|cr)?$|^\(?-?(?:₹|rs\.?|inr)?\s*\d+\.\d{2}\)?\s*(?:dr|cr)?$/i;
const FOOTER = /\b(?:page \d|opening balance|closing balance|statement summary|total|generated on|computer generated|carried forward|brought forward|end of statement)\b/i;
const LINE_TOLERANCE = 3;
const MAX_CONTINUATION = 2;

const exact = (k: string): Kind | null => KINDS.find(([, names]) => names.includes(k))?.[0] ?? null;
const prefix = (k: string): Kind | null => k.length < 4 ? null : KINDS.find(([, names]) => names.some((n) => n.length >= 4 && k.startsWith(n)))?.[0] ?? null;
const centre = (w: PdfWord) => w.x + w.w / 2;

/** Words on the same baseline become one line, left to right; lines run top to bottom, page by page. */
export function pdfLines(words: PdfWord[]): Line[] {
  const sorted = words.filter((w) => w.str.trim()).sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const word of sorted) {
    const last = lines.at(-1);
    if (last && last.page === word.page && Math.abs(last.y - word.y) <= LINE_TOLERANCE) last.words.push(word);
    else lines.push({ page: word.page, y: word.y, words: [word] });
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines;
}

/** The table header on a line, if it has one: a date column and money columns, joining split words ("Withdrawal" "Amt."). */
export function headerCells(line: Line): Cell[] | null {
  const cells: Cell[] = [];
  const ws = line.words;
  for (let i = 0; i < ws.length;) {
    let matched = false;
    for (const span of [3, 2, 1]) {
      const part = ws.slice(i, i + span);
      if (part.length < span) continue;
      const joined = key(part.map((w) => w.str).join(""));
      let kind = exact(joined) ?? (span === 1 ? prefix(joined) : null);
      // "Debit" "Credit" are two columns, not one "Debit/Credit" type column; only "Dr / Cr" may join into a type.
      if (span > 1 && kind === "type" && joined.length > 4) kind = null;
      if (kind) {
        const left = part[0].x, right = part.at(-1)!.x + part.at(-1)!.w;
        if (!cells.some((c) => c.kind === kind)) cells.push({ kind, x: (left + right) / 2, right });
        i += span; matched = true; break;
      }
    }
    if (!matched) i++;
  }
  const has = (k: Kind) => cells.some((c) => c.kind === k);
  return has("date") && ((has("debit") && has("credit")) || has("amount")) ? cells : null;
}

function dateAt(words: PdfWord[]) {
  for (const n of [1, 2, 3]) {
    const text = words.slice(0, n).map((w) => w.str).join(" ");
    const date = statementDate(text);
    if (date) return { date, used: n };
  }
  return null;
}

const quote = (value: string) => /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** The statement's transactions as CSV text, or why the PDF could not be read. */
export function pdfWordsToCsv(words: PdfWord[]): PdfCsv {
  if (words.map((w) => w.str).join("").replace(/\s/g, "").length < 40) {
    return { ok: false, error: "This PDF has no readable text (it may be a scanned image). Download the statement as CSV or as a text PDF from net banking." };
  }
  const lines = pdfLines(words);
  let header: Cell[] | null = null;
  const rows: { date: string; narration: string[]; debit: string; credit: string; amount: string; type: string; extra: number }[] = [];
  let open: (typeof rows)[number] | null = null;

  for (const line of lines) {
    const found = headerCells(line);
    if (found) { header = found; open = null; continue; }
    if (!header) continue;
    const money = header.filter((c) => ["debit", "credit", "amount", "balance"].includes(c.kind));
    const start = dateAt(line.words);
    if (!start) {
      // A wrapped description continues the row above until a footer or the next dated row.
      const text = line.words.map((w) => w.str).join(" ").trim();
      if (open && open.extra < MAX_CONTINUATION && !FOOTER.test(text) && !line.words.some((w) => MONEY.test(w.str.trim()))) { open.narration.push(text); open.extra++; }
      else open = null;
      continue;
    }
    const row = { date: start.date, narration: [] as string[], debit: "", credit: "", amount: "", type: "", extra: 0 };
    const refCell = header.find((c) => c.kind === "reference");
    for (const word of line.words.slice(start.used)) {
      const text = word.str.trim();
      if (!text || statementDate(text)) continue; // the value date column repeats the date
      if (/^(?:dr|cr)$/i.test(text) && header.some((c) => c.kind === "type")) { row.type = text.toUpperCase(); continue; }
      if (MONEY.test(text) && statementAmount(text) !== null) {
        const near = money.map((c) => ({ c, d: Math.min(Math.abs(centre(word) - c.x), Math.abs(word.x + word.w - c.right)) })).sort((a, b) => a.d - b.d)[0];
        if (near && near.c.kind !== "balance") row[near.c.kind as "debit" | "credit" | "amount"] = text;
        continue;
      }
      if (refCell && Math.abs(centre(word) - refCell.x) < Math.abs(centre(word) - (header.find((c) => c.kind === "narration")?.x ?? -1e9))) continue;
      row.narration.push(text);
    }
    if (!row.debit && !row.credit && !row.amount) { open = null; continue; }
    rows.push(row); open = row;
  }

  if (!header) return { ok: false, error: "Could not find the transaction table (a row with Date and Withdrawal/Debit columns) in this PDF. Download the statement as CSV from net banking instead." };
  if (!rows.length) return { ok: false, error: "Found the table but no transactions in it. Check the PDF covers the period you want, or use the CSV download." };
  const byAmount = rows.every((r) => !r.debit && !r.credit);
  const head = byAmount ? "Date,Narration,Amount,Type" : "Date,Narration,Debit,Credit";
  const body = rows.map((r) => [r.date, r.narration.join(" ").replace(/\s+/g, " ").trim(), ...(byAmount ? [r.amount, r.type] : [r.debit, r.credit])].map(quote).join(","));
  return { ok: true, csv: [head, ...body].join("\n"), rows: rows.length };
}
