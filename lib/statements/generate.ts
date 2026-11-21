/**
 * Makes a realistic 12-month bank statement for the demo: a savings account
 * and a credit card, with salary, rent, groceries, food orders and one-off
 * shopping, plus the recurring payments Paytrace looks for. Four of them are
 * set up to raise the four warnings: Netflix rises without a notice, the gym
 * is never used, YouTube keeps charging after it was cancelled, and the
 * monthly payments give an upcoming debit. The same seed always gives the
 * same statement. Pure TypeScript: runs on the server and in the browser.
 */
import type { NotificationRow, UsageRow } from "@/lib/payments/types";
import type { StatementLine } from "./csv";

export type GeneratedLine = StatementLine & { account: "SAV-4321" | "CC-8765" };
export type GeneratedStatement = { lines: GeneratedLine[]; usage: UsageRow[]; notices: NotificationRow[]; from: string; to: string };

function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const day = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => day(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));
function monthDate(year: number, month: number, dayOfMonth: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return day(new Date(Date.UTC(year, month, Math.min(dayOfMonth, last))));
}

const SHOPS = ["DMART", "MORE RETAIL", "RELIANCE SMART", "STAR BAZAAR", "NATURES BASKET", "SPENCERS"];
const ONE_OFF = ["DECATHLON", "CROMA", "LIFESTYLE", "PVR CINEMAS", "APOLLO PHARMACY", "IKEA", "NYKAA", "BOOKMYSHOW", "TATA CLIQ", "PEPPERFRY", "MYNTRA", "FIRSTCRY"];

/** Twelve months of statement lines ending on `end` (YYYY-MM-DD). */
export function generateStatement(seed: string, end: string): GeneratedStatement {
  const rand = random(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
  const between = (low: number, high: number) => Math.round((low + rand() * (high - low)) / 10) * 10;
  const ref = () => String(Math.floor(rand() * 9e11) + 1e11);
  const lines: GeneratedLine[] = [];
  const add = (date: string, narration: string, amount: number, type: "DEBIT" | "CREDIT", account: GeneratedLine["account"]) => {
    if (date <= end) lines.push({ date, narration, amount, type, reference: ref(), account });
  };

  const endDate = new Date(Date.parse(`${end}T00:00:00Z`));
  // Spotify falls due three days after the statement ends, so an upcoming debit shows.
  const spotifyDay = ((endDate.getUTCDate() + 3 - 1) % 28) + 1;
  // Shops and ATMs carry a varying branch code, as on real statements, so one-off spending never looks recurring.
  const branch = () => String(1000 + Math.floor(rand() * 9000));
  const cancelledOn = addDays(end, -65);
  for (let back = 11; back >= 0; back--) {
    const at = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - back, 1));
    const y = at.getUTCFullYear(), m = at.getUTCMonth();
    const late = back <= 1;
    add(monthDate(y, m, 1), "NEFT CR ACME TECHNOLOGIES PVT LTD SALARY", 92000, "CREDIT", "SAV-4321");
    add(monthDate(y, m, 3), `UPI/RENT MR SHARMA/${ref()}`, 22000, "DEBIT", "SAV-4321");
    add(monthDate(y, m, 4), "UPI/GYMFITLINE/9845128891", 1500, "DEBIT", "SAV-4321");
    add(monthDate(y, m, 5), "ACH DR LIC HSG EMI", 8500, "DEBIT", "SAV-4321");
    add(monthDate(y, m, spotifyDay), "POS 4512 SPOTIFY STOCKHOLM", 119, "DEBIT", "CC-8765");
    add(monthDate(y, m, 12), "BESCOM BILLPAY", [6, 7, 8].includes((m + 12) % 12 + 1) ? between(2400, 3200) : between(900, 1600), "DEBIT", "SAV-4321");
    add(monthDate(y, m, 16), "NETFLIX.COM", late ? 799 : 649, "DEBIT", "CC-8765");
    add(monthDate(y, m, 18), "NACH/HDFC LIFE", 1200, "DEBIT", "SAV-4321");
    add(monthDate(y, m, 29), "GOOGLE*YOUTUBEPREM", 149, "DEBIT", "CC-8765");
    add(monthDate(y, m, 25), "PAYMENT RECEIVED THANK YOU", between(6000, 14000), "CREDIT", "CC-8765");
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) add(monthDate(y, m, 2 + Math.floor(rand() * 26)), `POS ${branch()} ${pick(SHOPS)} ${branch()}`, between(600, 2600), "DEBIT", "SAV-4321");
    for (let i = 0, n = 3 + Math.floor(rand() * 4); i < n; i++) add(monthDate(y, m, 1 + Math.floor(rand() * 28)), `UPI/SWIGGY/${ref()}`, between(180, 650), "DEBIT", "CC-8765");
    if (rand() < 0.6) add(monthDate(y, m, 6 + Math.floor(rand() * 20)), `POS ${branch()} ${pick(ONE_OFF)}`, between(500, 6000), "DEBIT", "CC-8765");
    if (rand() < 0.5) add(monthDate(y, m, 8 + Math.floor(rand() * 15)), `ATM WDL ${branch()} ${pick(["KORAMANGALA", "INDIRANAGAR", "HSR LAYOUT", "JAYANAGAR", "WHITEFIELD"])}`, pick([2000, 3000, 5000]), "DEBIT", "SAV-4321");
  }

  const usage: UsageRow[] = [
    { brand: "FitLine Gym", lastOpened: addDays(end, -170), opensLast12Months: 1 },
    { brand: "Netflix", lastOpened: addDays(end, -2), opensLast12Months: 30 },
    { brand: "Spotify", lastOpened: addDays(end, -1), opensLast12Months: 120 },
    { brand: "YouTube", lastOpened: addDays(end, -70), opensLast12Months: 9 }
  ];
  const notices: NotificationRow[] = [{
    noticeId: "GEN-YT-CANCEL", sentOn: cancelledOn, channel: "email", sender: "no-reply@youtube.com",
    eventType: "mandate_cancelled", brand: "YouTube", text: "Your YouTube Premium membership has been cancelled. You will not be charged again."
  }];
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return { lines, usage, notices, from: lines[0]?.date ?? end, to: lines.at(-1)?.date ?? end };
}

/** The same statement as a bank-style CSV, for the "Download a sample" link. */
export function statementCsv(statement: GeneratedStatement) {
  const fmt = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  const rows = statement.lines.map(line => [fmt(line.date), `"${line.narration}"`, line.reference ?? "", line.type === "DEBIT" ? line.amount.toFixed(2) : "", line.type === "CREDIT" ? line.amount.toFixed(2) : "", line.account]);
  return ["Txn Date,Narration,Ref No,Withdrawal Amt,Deposit Amt,Account", ...rows.map(r => r.join(","))].join("\n");
}
