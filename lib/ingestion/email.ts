import { isSensitive, validateEvent, type PaymentEvent, type EventKind } from "./event";

/** Deliberately narrow receipt/notice patterns; unrelated messages are skipped. */
export function parseFinancialEmail(input: { id: string; from: string; subject: string; body: string; date: string }, allowedDomains: string[]): PaymentEvent | null {
  const address = input.from.match(/(?:<|^)([\w.+-]+@[\w.-]+)>?\s*$/)?.[1];
  const domain = address?.split("@")[1]?.toLowerCase();
  if (!domain || !allowedDomains.includes(domain)) return null;
  const text = `${input.subject}\n${input.body}`;
  if (isSensitive(text) || /\b(?:refund|credited|credit received|payment declined|invoice due)\b/i.test(text)) return null;
  let kind: EventKind;
  if (/\b(?:price increase|price change|new subscription price)\b/i.test(text)) kind = "price_change";
  else if (/\b(?:mandate cancelled|autopay cancelled)\b/i.test(text)) kind = "mandate_cancelled";
  else if (/\b(?:mandate created|autopay activated)\b/i.test(text)) kind = "mandate_created";
  else if (/\b(?:payment successful|payment received|payment confirmation|amount debited|paid successfully|payment receipt)\b/i.test(text)) kind = "debit_posted";
  else return null;
  const merchant = text.match(/(?:^|\n)\s*(?:Merchant|Payee|Service|Paid to)\s*:\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79})(?=\r?\n|$)/i)?.[1]?.trim();
  if (!merchant) return null;
  const amountText = text.match(/(?:^|\n)\s*(?:Amount(?: paid| debited)?|New price|Total)\s*:\s*(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\b/i)?.[1];
  const amountPaise = amountText ? Math.round(Number(amountText.replaceAll(",", ""))*100) : null;
  const reference = text.match(/(?:^|\n)\s*(?:Transaction (?:ID|reference)|Reference|UTR|RRN|Mandate ID)\s*:\s*([A-Za-z0-9-]{3,80})\b/i)?.[1] ?? null;
  const date = text.match(/(?:^|\n)\s*(?:Date|Payment date)\s*:\s*(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? input.date;
  try { return validateEvent({ source:"email", kind, merchant, amountPaise, date, reference, sourceId: input.id }); } catch { return null; }
}
