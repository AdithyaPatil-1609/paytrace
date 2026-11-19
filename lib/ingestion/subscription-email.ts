import { digest, isDate, validateEvent, type PaymentEvent } from "./event";

const inr = "(?:INR|Rs\\.?|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)(?![\\d.,])";
const toPaise = (value: string) => Math.round(Number(value.replaceAll(",", "")) * 100);
const readAmount = (text: string, labels: string) => text.match(new RegExp(`^\\s*(?:${labels})\\s*:?\\s*${inr}\\s*$`, "im"))?.[1];
const paidLabels = "Total(?: paid| charged)?|Amount paid|Amount charged|Grand total";
function paidAmounts(text: string) {
  return [...text.matchAll(new RegExp(`^\\s*(?:${paidLabels})\\s*:?\\s*${inr}\\s*$`, "gim"))].map(line => toPaise(line[1]));
}
export function hasZeroReportedTotal(text: string) {
  return paidAmounts(text).includes(0);
}
export function hasNonzeroReportedTotal(text:string) {
  return paidAmounts(text).some(amount=>amount>0);
}

function receiptDate(value?: string): string | undefined {
  if (!value) return;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return isDate(value) ? value : undefined;
  const match = value.match(/^([A-Za-z]+) +(\d{1,2}),? +(\d{4})$/);
  if (!match) return;
  const month = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(match[1].slice(0,3).toLowerCase()) + 1;
  if (!month) return;
  const date = `${match[3]}-${String(month).padStart(2,"0")}-${match[2].padStart(2,"0")}`;
  return isDate(date) ? date : undefined;
}

/** A completed registration with an explicit zero total, never a paid debit. */
export function parseZeroCostSubscription(text: string, input: {id:string;date:string}): PaymentEvent | null {
  if (!/\b(?:subscription|free trial)\b/i.test(text)) return null;
  if (/\b(?:subscription cancel(?:led|lation)|payment (?:failed|pending|declined)|order cancel(?:led|lation)|not yet subscribed)\b/i.test(text)) return null;
  const order = text.match(/^\s*Order (?:number|ID)\s*:\s*([\w-]{3,128})\s*$/im)?.[1];
  const orderDateText = text.match(/^\s*Order date\s*:\s*([^\r\n]+)$/im)?.[1]?.trim();
  const confirmed = (order && orderDateText) || /\b(?:subscription (?:confirmed|activated|started|registered|created|successful)|(?:your )?new subscription|your new plan|trial (?:started|activated)|order (?:placed|confirmed))\b/i.test(text);
  if (!confirmed) return null;
  const totals = paidAmounts(text);
  // A conflicting nonzero paid amount prevents classifying this as zero-cost.
  if (!totals.length || totals.some(total => total !== 0)) return null;
  const planRow = text.match(new RegExp(`^\\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,66}\\bsubscription)\\s+${inr}\\s*(?:INR)?\\s*$`, "im"));
  const labeledPlan = text.match(/^\s*(?:Subscription|Plan|Service|Merchant(?: name)?)\s*:\s*([A-Za-z0-9][A-Za-z0-9 .&*_'@/-]{0,79})\s*$/im)?.[1]?.trim();
  const merchant = planRow?.[1]?.replace(/\s+subscription$/i, "").trim() || labeledPlan;
  if (!merchant) return null;
  const listed = planRow?.[2] ?? readAmount(text,"Listed price|Plan price|Subscription price|Original price|Subtotal");
  const date = receiptDate(orderDateText) ?? input.date;
  const renewalText = text.match(/^\s*(?:Next (?:billing|renewal|payment|charge) date|Renews on|Next charge on)\s*:?\s*([^\r\n]+)$/im)?.[1]?.trim();
  const renewalDate = receiptDate(renewalText);
  try {
    return validateEvent({source:"email",kind:"subscription_registered",merchant,amountPaise:0,date,reference:order ? digest("subscription-order",order) : null,sourceId:input.id,...(listed===undefined?{}:{planPricePaise:toPaise(listed)}),...(renewalDate && renewalDate>=date?{renewalDate}:{})});
  } catch { return null; }
}
