/**
 * Job 4 in the app: a group of repeating debits that is really a shop the
 * person visits often (the same supermarket every month) is moved out of the
 * recurring list. A local fine-tuned Qwen (ml/recurring.py, scored in
 * ml/results/) decides; rules in code decide what it is allowed to hide.
 */
import { createHash } from "node:crypto";
import { NOTICE_CHANNEL } from "./engine";
import type { Commitment } from "./types";

/** The same prompt the model was trained and scored with; tests fail if it drifts from ml/recurring.py. */
export const RECURRING_PROMPT_VERSION = "v1";
export const RECURRING_PROMPT = `You check one group of repeating debits from an Indian bank statement for Paytrace, a tracker of recurring payments.
The group was found because the same statement text appears more than once. Decide whether it is a commitment or everyday spending at a place the person visits often.
Reply with JSON only, with exactly these fields: verdict, kind.

verdict, exactly one of:
- commitment: a payment the person signed up for and that repeats until stopped: a subscription, a utility or phone bill, a loan EMI, an insurance premium, a SIP or other investment, rent, a gym or club membership, or a fixed transfer to the same person every month. Bills still count when the amount changes each time.
- everyday_spending: purchases the person chooses each time, even at the same place every week or month: groceries and supermarkets, restaurants and food delivery, fuel, cabs and metro top-ups, online shopping, pharmacies, and uneven transfers to people. A similar amount on a similar date does not make a shop a commitment.
- unsure: the statement text does not say what the business is and the dates and amounts do not settle it.

kind: for a commitment, one of subscription, bill, loan, insurance, investment, rent, membership, regular_transfer. For everyday spending, one of groceries, food, fuel, transport, shopping, pharmacy, transfer. For unsure, unknown.

Rules:
- Judge by what the business is first, then by the pattern. A membership or plan sold by a shop or app (Swiggy One, Amazon Prime, Uber One) is a commitment; the same brand's orders, rides or shopping are everyday spending.
- An autopay mandate or a renewal notice means a commitment.
- If the text names no business you can recognise, use the pattern: one fixed amount on a steady cycle is a commitment; uneven amounts on uneven dates are unsure.`;

export const VERDICTS = ["commitment", "everyday_spending", "unsure"] as const;
export const COMMITMENT_KINDS = ["subscription", "bill", "loan", "insurance", "investment", "rent", "membership", "regular_transfer"] as const;
export const EVERYDAY_KINDS = ["groceries", "food", "fuel", "transport", "shopping", "pharmacy", "transfer"] as const;
export type Verdict = (typeof VERDICTS)[number];
export type RecurringVerdict = { verdict: Verdict; kind: string };
const MAX_ROWS = 12;

export type Candidate = { merchant: string; rail: string; mandate: boolean; notice: boolean; rows: [string, number][] };

/** The payment rail, read from the statement text. Gmail and SMS payments carry only a name: unknown. */
export function railOf(item: Commitment) {
  const text = item.rawNarration.toUpperCase();
  const mandate = Boolean(item.mandateRef || item.mandateStatus);
  if (/^UPI\b|^UPI[-/]/.test(text)) return mandate ? "UPI autopay" : "UPI";
  if (/^(?:NACH|ACH\b)/.test(text)) return "NACH";
  if (/^(?:BBPS|BIL\/)/.test(text)) return "BBPS";
  if (/^NEFT\b|^NEFT\//.test(text)) return "NEFT";
  if (/^IMPS\b|^IMPS\//.test(text)) return "IMPS";
  if (/^(?:POS|CARD|ME DC|VPS)\b|\*/.test(text)) return "card";
  if (/^NETBANKING\b/.test(text)) return "netbanking";
  return "unknown";
}

/** What the model sees for one group: statement text, rail, evidence flags, dates and amounts. No names or accounts. */
export function candidateFor(item: Commitment): Candidate {
  return {
    merchant: item.rawNarration,
    rail: railOf(item),
    mandate: Boolean(item.mandateRef || item.mandateStatus),
    notice: item.notices.length > 0 || item.hasPriceChangeNotice || item.basis === "notices" || item.evidenceRows.some((row) => row.channel === NOTICE_CHANNEL),
    rows: item.evidenceRows.map((row) => [row.date, row.amount] as [string, number])
  };
}

/** Rs 1284, or Rs 1284.50: the same as rupees() in ml/recurring.py. */
export function rupees(amount: number) {
  const whole = Math.round(amount * 100);
  const paise = whole % 100;
  return paise === 0 ? `Rs ${Math.floor(whole / 100)}` : `Rs ${Math.floor(whole / 100)}.${String(paise).padStart(2, "0")}`;
}

/** The user message, character for character as render() in ml/recurring.py. */
export function renderCandidate(candidate: Candidate) {
  const rows = [...candidate.rows].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0].localeCompare(b[0]))).slice(-MAX_ROWS);
  const days = rows.slice(1).map((row, index) => Math.round((Date.parse(row[0]) - Date.parse(rows[index][0])) / 86_400_000));
  return [
    `Statement text: ${candidate.merchant}`,
    `Paid by: ${candidate.rail}`,
    `Autopay mandate: ${candidate.mandate ? "yes" : "no"}`,
    `Renewal or price notice: ${candidate.notice ? "yes" : "no"}`,
    `Debits (${rows.length}, oldest first): ${rows.map(([day, amount]) => `${day} ${rupees(amount)}`).join("; ")}`,
    `Days between debits: ${days.length ? days.join(", ") : "none"}`
  ].join("\n");
}

/** Changes whenever the group's rows or the prompt change, so a stored verdict is never reused for different data. */
export function checkHash(candidate: Candidate) {
  return createHash("sha256").update(`${RECURRING_PROMPT_VERSION}\n${renderCandidate(candidate)}`).digest("hex").slice(0, 32);
}

/** The model's reply as a verdict, with kind forced to match it; null when unreadable. As clean() in ml/recurring.py. */
export function parseVerdict(raw: string): RecurringVerdict | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const value = JSON.parse(raw.slice(start, end + 1)) as { verdict?: unknown; kind?: unknown };
    if (!VERDICTS.includes(value.verdict as Verdict)) return null;
    const verdict = value.verdict as Verdict;
    const allowed: readonly string[] = verdict === "commitment" ? COMMITMENT_KINDS : verdict === "everyday_spending" ? EVERYDAY_KINDS : ["unknown"];
    return { verdict, kind: typeof value.kind === "string" && allowed.includes(value.kind) ? value.kind : "unknown" };
  } catch {
    return null;
  }
}

/**
 * The rules the model cannot override. Anything with evidence of a signed-up
 * payment stays recurring whatever the model says: a dictionary entry, an
 * autopay mandate, a renewal or price notice, notice-only rows, a loan or
 * insurance. The model can only move a group with none of these.
 */
export function mayHide(item: Commitment) {
  const candidate = candidateFor(item);
  return !item.inDictionary && !candidate.mandate && !candidate.notice && item.cancelMode !== "block" && item.cancelMode !== "warn";
}

/** A stored check: the model's verdict for one group's rows, and the person's own answer, which always wins. */
export type StoredCheck = { commitmentId: string; hash: string; verdict: Verdict; kind: string; model: string; personSays?: "commitment" | null };

export type EverydayGroup = { item: Commitment; kind: string; model: string };

/** Splits the detected groups into the recurring list and everyday spending, using stored checks only. */
export function splitByChecks(items: Commitment[], checks: StoredCheck[]) {
  const byId = new Map(checks.map((check) => [check.commitmentId, check]));
  const commitments: Commitment[] = [];
  const everyday: EverydayGroup[] = [];
  for (const item of items) {
    const check = byId.get(item.id);
    const fresh = check && check.hash === checkHash(candidateFor(item));
    if (fresh && check.verdict === "everyday_spending" && check.personSays !== "commitment" && mayHide(item)) everyday.push({ item, kind: check.kind, model: check.model });
    else commitments.push(item);
  }
  return { commitments, everyday };
}

/** Groups that need a (new) check: the model is asked only about groups it could actually move. */
export function needsCheck(items: Commitment[], checks: StoredCheck[]) {
  const byId = new Map(checks.map((check) => [check.commitmentId, check]));
  return items.filter((item) => mayHide(item) && byId.get(item.id)?.hash !== checkHash(candidateFor(item)));
}
