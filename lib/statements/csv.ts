/**
 * Reads a bank statement exported as CSV (net banking → "Download statement"
 * → CSV or Excel saved as CSV). Indian banks name their columns differently,
 * so columns are found by name: a date, a description, and either separate
 * debit and credit columns or one amount column (with an optional Dr/Cr type).
 * Dates are read day first. Long digit runs (account numbers, UPI references)
 * are removed from descriptions, so nothing identifying is kept.
 * Pure TypeScript: used by the demo sandbox and by the signed-in import.
 */
export type StatementLine = {
  date: string;
  narration: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  reference: string | null;
};

export type StatementParse =
  | { ok: true; lines: StatementLine[]; skipped: number; columns: Record<string, string> }
  | { ok: false; error: string };

export const STATEMENT_LIMITS = {
  maxBytes: 512 * 1024,
  maxLines: 3000,
  minLines: 3,
  headerSearchRows: 30
} as const;

const NAMES = {
  date: ["txndate", "transactiondate", "trandate", "date", "postingdate", "txndt", "valuedate", "valuedt"],
  narration: ["narration", "description", "particulars", "transactiondetails", "details", "remarks", "transactionremarks", "merchant", "payee"],
  debit: ["debit", "withdrawal", "withdrawals", "withdrawalamt", "withdrawalamount", "debitamount", "debitamt", "dr", "debitinr", "withdrawalinr"],
  credit: ["credit", "deposit", "deposits", "depositamt", "depositamount", "creditamount", "creditamt", "cr", "creditinr", "depositinr"],
  amount: ["amount", "transactionamount", "amt", "amountinr", "txnamount"],
  type: ["drcr", "crdr", "type", "debitcredit", "transactiontype", "txntype"],
  reference: ["refno", "chqrefno", "reference", "referenceno", "referencenumber", "ref", "utr", "chequeno", "transactionid", "txnid"]
} as const;

const key = (value: string) => value.toLowerCase().replace(/[^a-z]/g, "");

/** Splits CSV text into rows, honouring quotes. Comma, semicolon or tab, whichever the header uses. */
export function csvRows(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLines = clean.split(/\r?\n/).slice(0, 10).join("\n");
  const delimiter = [",", ";", "\t"].map(d => ({ d, n: firstLines.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.map(r => r.map(cell => cell.trim())).filter(r => r.some(cell => cell !== ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(year: number, month: number, day: number) {
  if (year < 100) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day && year >= 2000 && year <= 2100 ? d.toISOString().slice(0, 10) : null;
}

/** "21/11/2026", "21-11-26", "21.11.2026", "2026-11-21", "21-Nov-2026", "21 Nov 26", "Nov 21, 2026" → 2026-11-21. Day first. */
export function statementDate(value: string): string | null {
  const text = value.trim().toLowerCase().replace(/\s+/g, " ");
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = text.match(/^(\d{1,2})[ -]([a-z]{3})[a-z]*[ ,-]+(\d{2}|\d{4})\b/);
  if (m && MONTHS.includes(m[2])) return iso(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]);
  m = text.match(/^([a-z]{3})[a-z]* (\d{1,2}),? (\d{4})\b/);
  if (m && MONTHS.includes(m[1])) return iso(+m[3], MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

/** "₹1,23,456.50", "Rs. 499", "(120.00)", "649.00 Dr" → a number (negative for brackets). Empty → null. */
export function statementAmount(value: string): number | null {
  let text = value.trim();
  if (!text || text === "-") return null;
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[()₹,\s]|rs\.?|inr|dr|cr/gi, "").replace(/^-/, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return negative ? -amount : amount;
}

/** The description without account numbers or long references, for grouping and privacy. */
export function cleanNarration(value: string) {
  return value.replace(/\d{6,}/g, "").replace(/\s+/g, " ").replace(/[/\\-]{2,}/g, "/").trim().slice(0, 120);
}

function findColumns(header: string[]) {
  const keys = header.map(key);
  const pick = (names: readonly string[]) => {
    for (const name of names) {
      const i = keys.indexOf(name);
      if (i >= 0) return i;
    }
    for (const name of names) {
      const i = keys.findIndex(k => k.startsWith(name) && name.length >= 4);
      if (i >= 0) return i;
    }
    return -1;
  };
  return { date: pick(NAMES.date), narration: pick(NAMES.narration), debit: pick(NAMES.debit), credit: pick(NAMES.credit), amount: pick(NAMES.amount), type: pick(NAMES.type), reference: pick(NAMES.reference) };
}

export function parseStatementCsv(text: string): StatementParse {
  if (new TextEncoder().encode(text).length > STATEMENT_LIMITS.maxBytes) return { ok: false, error: `The file is larger than ${STATEMENT_LIMITS.maxBytes / 1024} KB. Export a shorter period, such as 12 months.` };
  if (/^%PDF|^PK\u0003\u0004/.test(text)) return { ok: false, error: "This is a PDF or Excel file. Save or export the statement as CSV, then upload that." };
  const rows = csvRows(text);
  let headerAt = -1, cols = findColumns([]);
  for (let i = 0; i < Math.min(rows.length, STATEMENT_LIMITS.headerSearchRows); i++) {
    const found = findColumns(rows[i]);
    if (found.date >= 0 && found.narration >= 0 && (found.debit >= 0 || found.amount >= 0)) { headerAt = i; cols = found; break; }
  }
  if (headerAt < 0) return { ok: false, error: "Could not find the columns. The file needs a date column, a description (Narration, Particulars or Description) column, and either Debit/Withdrawal and Credit/Deposit columns or an Amount column." };

  const header = rows[headerAt];
  // One signed Amount column with no Dr/Cr type: minus is a debit, plus a credit.
  const signed = cols.type < 0 && cols.amount >= 0 && rows.slice(headerAt + 1).some(r => /^\s*[-(]/.test(r[cols.amount] ?? ""));
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerAt + 1)) {
    if (lines.length >= STATEMENT_LIMITS.maxLines) { skipped++; continue; }
    const date = statementDate(row[cols.date] ?? "");
    const narration = cleanNarration(row[cols.narration] ?? "");
    let amount: number | null = null, type: StatementLine["type"] | null = null;
    if (cols.debit >= 0 || cols.credit >= 0) {
      const debit = cols.debit >= 0 ? statementAmount(row[cols.debit] ?? "") : null;
      const credit = cols.credit >= 0 ? statementAmount(row[cols.credit] ?? "") : null;
      if (debit && Math.abs(debit) > 0) { amount = Math.abs(debit); type = "DEBIT"; }
      else if (credit && Math.abs(credit) > 0) { amount = Math.abs(credit); type = "CREDIT"; }
    }
    if (amount === null && cols.amount >= 0) {
      const raw = row[cols.amount] ?? "";
      const value = statementAmount(raw);
      const marker = cols.type >= 0 ? (row[cols.type] ?? "").toLowerCase() : raw.toLowerCase();
      if (value) {
        amount = Math.abs(value);
        type = /\bcr\b|credit|deposit/.test(marker) ? "CREDIT" : /\bdr\b|debit|withdraw/.test(marker) ? "DEBIT" : signed && value > 0 ? "CREDIT" : "DEBIT";
      }
    }
    if (!date || !narration || amount === null || !type || amount > 1e9) { skipped++; continue; }
    const ref = cols.reference >= 0 ? (row[cols.reference] ?? "").replace(/[^A-Za-z0-9-]/g, "").slice(-20) : "";
    lines.push({ date, narration, amount: Math.round(amount * 100) / 100, type, reference: ref.length >= 3 ? ref : null });
  }
  if (lines.length < STATEMENT_LIMITS.minLines) return { ok: false, error: `Only ${lines.length} transactions could be read. Check that the file is a bank statement with dates and amounts.` };
  return {
    ok: true,
    lines: lines.sort((a, b) => a.date.localeCompare(b.date)),
    skipped,
    columns: Object.fromEntries(Object.entries(cols).filter(([, i]) => i >= 0).map(([name, i]) => [name, header[i]]))
  };
}
