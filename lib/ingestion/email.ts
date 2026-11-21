import { isSensitive, validateEvent, type PaymentEvent, type EventKind } from "./event";
import { isAllowedSender } from "./gmail-filter";
import { hasZeroReportedTotal, parseZeroCostSubscription, parseSubscriptionRenewal } from "./subscription-email";

/** Normalize common email text formatting without inventing receipt fields. */
export function normalizeReceiptText(text:string) {
  return text.replace(/\r\n?/g,"\n").replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g,"")
    .replace(/[\u00a0\u2000-\u200a\u202f]/g," ")
    .replace(/\*\*([^*\n]+)\*\*/g,"$1")
    .replace(/^\s*\|([^\n]+)\|\s*$/gm,(_,row:string)=>row.split("|").map(cell=>cell.trim()).join(" "));
}

/** Deliberately narrow receipt/notice patterns; unrelated messages are skipped. */
export function parseFinancialEmail(input: { id: string; from: string; subject: string; body: string; date: string }, allowedDomains: string[]): PaymentEvent | null {
  if (!isAllowedSender(input.from, allowedDomains)) return null;
  const text = normalizeReceiptText(`${input.subject}\n${input.body}`);
  if (isSensitive(text) || /\b(?:refund|credited|credit received|payment declined|invoice due)\b/i.test(text)) return null;
  const registration = parseZeroCostSubscription(text,input);
  if (registration) return registration;
  const renewal = parseSubscriptionRenewal(text,input);
  if (renewal) return renewal;
  let kind: EventKind;
  if (/\b(?:price increase|price change|new subscription price)\b/i.test(text)) kind = "price_change";
  else if (/\b(?:mandate cancelled|autopay cancelled)\b/i.test(text)) kind = "mandate_cancelled";
  else if (/\b(?:mandate created|autopay activated)\b/i.test(text)) kind = "mandate_created";
  else if (/\b(?:payment (?:was |has been )?(?:successful|received|completed|confirmed)|payment confirmation|amount debited|paid successfully|payment receipt|successful payment|you (?:have been|were) charged)\b/i.test(text)) kind = "debit_posted";
  else return null;
  // A displayed list price is never proof of a debit when the receipt reports a zero total.
  if (kind === "debit_posted" && hasZeroReportedTotal(text)) return null;
  const merchant = text.match(/(?:^|\n)\s*(?:Merchant(?: name)?|Payee(?: name)?|Service|Paid to|Billed by|Sold by)\s*:\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79})(?=\r?\n|$)/i)?.[1]?.trim();
  if (!merchant) return null;
  const amountText = text.match(/(?:^|\n)\s*(?:Amount(?: paid| debited| charged)?|New price|Total(?: paid| charged)?)\s*:?\s*(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)(?![\d.,])/i)?.[1];
  const amountPaise = amountText ? Math.round(Number(amountText.replaceAll(",", ""))*100) : null;
  const reference = text.match(/(?:^|\n)\s*(?:Transaction (?:ID|reference)|Reference|UTR|RRN|Mandate ID)\s*:\s*([A-Za-z0-9-]{3,80})\b/i)?.[1] ?? null;
  const date = text.match(/(?:^|\n)\s*(?:Date|Payment date)\s*:\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? input.date;
  try { return validateEvent({ source:"email", kind, merchant, amountPaise, date, reference, sourceId: input.id }); } catch { return null; }
}
