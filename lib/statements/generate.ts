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
/** Card subscriptions a sample person may have: the narration on the card statement and real Indian plan prices. */
const CARD_SUBS = [
  { brand: "Netflix", narration: "NETFLIX.COM", prices: [149, 199, 499, 649, 799], sender: "info@account.netflix.com" },
  { brand: "Spotify", narration: "POS 4512 SPOTIFY STOCKHOLM", prices: [119, 139, 179], sender: "no-reply@spotify.com" },
  { brand: "YouTube", narration: "GOOGLE*YOUTUBEPREM", prices: [129, 149, 189], sender: "no-reply@youtube.com" },
  { brand: "Google One", narration: "GOOGLE*ONE", prices: [130, 210, 650], sender: "payments-noreply@google.com" },
  { brand: "JioHotstar", narration: "JIOHOTSTAR", prices: [149, 299, 499], sender: "noreply@jiohotstar.com" },
  { brand: "Canva", narration: "CANVA.COM PADDLE.NET", prices: [499, 599], sender: "no-reply@canva.com" }
] as const;
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
  // Shops and ATMs carry a varying branch code, as on real statements, so one-off spending never looks recurring.
  const branch = () => String(1000 + Math.floor(rand() * 9000));
  const cancelledOn = addDays(end, -65);

  // A different person each seed: which services they pay for, at which plan price, on which day.
  const shuffled = [...CARD_SUBS].sort(() => rand() - 0.5);
  const [hiked, cancelled, upcoming, ...rest] = shuffled;
  const chosen = [hiked, cancelled, upcoming, ...rest.filter(() => rand() < 0.5)];
  // Its last charge is 28 days before the statement ends, so the next one falls due in the next few days.
  const upcomingDay = Math.min(28, new Date(Date.parse(`${addDays(end, -28)}T00:00:00Z`)).getUTCDate());
  const plan = new Map(chosen.map(sub => {
    const tier = Math.floor(rand() * (sub.prices.length - (sub === hiked ? 1 : 0)));
    const dayOfMonth = sub === upcoming ? upcomingDay : 2 + Math.floor(rand() * 26);
    return [sub.brand, { price: sub.prices[tier], raised: sub.prices[tier + 1] ?? sub.prices[tier], day: dayOfMonth }] as const;
  }));
  // The unused one: a gym on UPI AutoPay or a fitness app on Google Play.
  const unusedGym = rand() < 0.5;
  const salary = between(55_000, 180_000), rent = between(12_000, 45_000);
  const gymFee = pick([999, 1200, 1500, 1800, 2500]);
  const hasLoan = rand() < 0.6, loanEmi = between(6_000, 32_000);
  const hasInsurance = rand() < 0.7, premium = pick([850, 1200, 1650, 2400]);
  const employer = pick(["ACME TECHNOLOGIES PVT LTD", "INFOWAVE SYSTEMS LTD", "BLUESKY ANALYTICS PVT LTD", "NORTHSTAR RETAIL LTD", "KESTREL LABS PVT LTD"]);
  const landlord = pick(["MR SHARMA", "MRS IYER", "R K PROPERTIES", "MR REDDY", "MS KAPOOR"]);

  for (let back = 11; back >= 0; back--) {
    const at = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - back, 1));
    const y = at.getUTCFullYear(), m = at.getUTCMonth();
    const late = back <= 1;
    add(monthDate(y, m, 1), `NEFT CR ${employer} SALARY`, salary, "CREDIT", "SAV-4321");
    add(monthDate(y, m, 3), `UPI/RENT ${landlord}/${ref()}`, rent, "DEBIT", "SAV-4321");
    if (unusedGym) add(monthDate(y, m, 4), "UPI/GYMFITLINE/9845128891", gymFee, "DEBIT", "SAV-4321");
    else add(monthDate(y, m, 21), "GOOGLE*FITAPP", 299, "DEBIT", "CC-8765");
    if (hasLoan) add(monthDate(y, m, 5), "ACH DR LIC HSG EMI", loanEmi, "DEBIT", "SAV-4321");
    if (hasInsurance) add(monthDate(y, m, 18), "NACH/HDFC LIFE", premium, "DEBIT", "SAV-4321");
    add(monthDate(y, m, 12), "BESCOM BILLPAY", [6, 7, 8].includes((m + 12) % 12 + 1) ? between(2400, 3200) : between(900, 1600), "DEBIT", "SAV-4321");
    for (const sub of chosen) {
      const p = plan.get(sub.brand)!;
      const amount = sub === hiked && late ? p.raised : p.price;
      add(monthDate(y, m, p.day), sub.narration, amount, "DEBIT", "CC-8765");
    }
    add(monthDate(y, m, 25), "PAYMENT RECEIVED THANK YOU", between(6000, 14000), "CREDIT", "CC-8765");
    for (let i = 0, n = 2 + Math.floor(rand() * 3); i < n; i++) add(monthDate(y, m, 2 + Math.floor(rand() * 26)), `POS ${branch()} ${pick(SHOPS)} ${branch()}`, between(600, 2600), "DEBIT", "SAV-4321");
    for (let i = 0, n = 3 + Math.floor(rand() * 4); i < n; i++) add(monthDate(y, m, 1 + Math.floor(rand() * 28)), `UPI/SWIGGY/${ref()}`, between(180, 650), "DEBIT", "CC-8765");
    if (rand() < 0.6) add(monthDate(y, m, 6 + Math.floor(rand() * 20)), `POS ${branch()} ${pick(ONE_OFF)}`, between(500, 6000), "DEBIT", "CC-8765");
    if (rand() < 0.5) add(monthDate(y, m, 8 + Math.floor(rand() * 15)), `ATM WDL ${branch()} ${pick(["KORAMANGALA", "INDIRANAGAR", "HSR LAYOUT", "JAYANAGAR", "WHITEFIELD"])}`, pick([2000, 3000, 5000]), "DEBIT", "SAV-4321");
  }

  const usage: UsageRow[] = [
    unusedGym ? { brand: "FitLine Gym", lastOpened: addDays(end, -170), opensLast12Months: 1 } : { brand: "FitApp", lastOpened: addDays(end, -150), opensLast12Months: 2 },
    ...chosen.filter(sub => sub !== cancelled).map(sub => ({ brand: sub.brand, lastOpened: addDays(end, -1 - Math.floor(rand() * 5)), opensLast12Months: 30 + Math.floor(rand() * 120) })),
    { brand: cancelled.brand, lastOpened: addDays(end, -70), opensLast12Months: 9 }
  ];
  const notices: NotificationRow[] = [{
    noticeId: "GEN-CANCEL", sentOn: cancelledOn, channel: "email", sender: cancelled.sender,
    eventType: "mandate_cancelled", brand: cancelled.brand, text: `Your ${cancelled.brand} membership has been cancelled. You will not be charged again.`
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
