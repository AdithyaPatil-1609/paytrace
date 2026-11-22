/**
 * App-store style emails (one product per card: name, plan line, price). Apple
 * sends receipts, renewal reminders and price-change notices this way. Reading
 * the card gives the real product ("Apple Music") instead of the sender domain.
 */
import { isDate, validateEvent, type PaymentEvent } from "./event";

const inr = "(?:INR|Rs\\.?|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)(?![\\d.,])";
const toPaise = (value: string) => Math.round(Number(value.replaceAll(",", "")) * 100);
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const nameLine = /^[A-Za-z0-9][A-Za-z0-9 .&*+_'@/-]{0,59}$/;
/** "Individual (Monthly)", "Student (1 month)", "iCloud+ with 2 TB (Monthly)". */
const planLine = /\((?:monthly|yearly|annual|weekly|quarterly|\d+\s+(?:month|year|week)s?)\)\s*$/i;

/** "9 November 2026" or "November 9, 2026" to an ISO date. */
export function longDate(value: string): string | undefined {
  const raw = value.trim().replace(",", "");
  const dayFirst = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  const monthFirst = raw.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  const [day, month, year] = dayFirst ? [dayFirst[1], dayFirst[2], dayFirst[3]] : monthFirst ? [monthFirst[2], monthFirst[1], monthFirst[3]] : [];
  if (!day || !month || !year) return;
  const index = months.indexOf(month.slice(0, 3).toLowerCase()) + 1;
  const iso = `${year}-${String(index).padStart(2, "0")}-${day.padStart(2, "0")}`;
  return index && isDate(iso) ? iso : undefined;
}

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const plausible = (name: string | undefined) =>
  name && nameLine.test(name) && !/^(?:subscription|renewal|tax invoice|invoice|receipt|sac\b|order|document|sequence|apple account)/i.test(name) ? name : undefined;

/**
 * A paid store receipt for exactly one subscription: "Tax Invoice", the
 * product, its plan line, "Renews <date>", the price, and the same total at
 * the end. More than one product, or a total that differs, is not guessed.
 */
export function parseStoreReceipt(text: string, input: { id: string; date: string }): PaymentEvent | null {
  const all = lines(text);
  if (!all.some((line) => /^(?:tax invoice|invoice|receipt)$/i.test(line))) return null;
  const renews = all.map((line, index) => (/^renews\s+/i.test(line) ? index : -1)).filter((index) => index >= 0);
  if (renews.length !== 1) return null;
  const at = renews[0];
  if (!longDate(all[at].replace(/^renews\s+/i, ""))) return null;
  // The price follows "Renews"; older invoices put the device name in between.
  const price = [all[at + 1], all[at + 2]].map((line) => line?.match(new RegExp(`^${inr}$`, "i"))?.[1]).find(Boolean);
  if (!price) return null;
  let plan = at - 1;
  while (plan >= 0 && /^(?:SAC|HSN)\b/i.test(all[plan])) plan--;
  if (plan < 1 || !planLine.test(all[plan])) return null;
  const merchant = plausible(all[plan - 1]);
  if (!merchant) return null;
  // The last rupee figure is what was charged; it must equal the product price.
  const figures = [...text.matchAll(new RegExp(`^\\s*${inr}\\s*$`, "gim"))].map((match) => toPaise(match[1]));
  if (figures[figures.length - 1] !== toPaise(price)) return null;
  const issued = all.slice(0, 4).map(longDate).find(Boolean);
  try {
    return validateEvent({ source: "email", kind: "debit_posted", merchant, amountPaise: toPaise(price), date: issued ?? input.date, reference: null, sourceId: input.id });
  } catch {
    return null;
  }
}

/**
 * A store price-change notice: "Subscription price increase" or "Subscription
 * price change confirmed", the product, then the new price ("New Price ₹69.00"
 * or "₹69.00 per month, starting ..."). The amount is the new price.
 */
export function parseStorePriceChange(text: string, input: { id: string; date: string }): PaymentEvent | null {
  const all = lines(text);
  const heading = all.findIndex((line) => /^subscription price (?:increase|change|changing|change confirmed)\b/i.test(line));
  if (heading < 0) return null;
  const merchant = plausible(all[heading + 1]);
  if (!merchant) return null;
  const newPrice =
    text.match(new RegExp(`^\\s*new price\\s*:?\\s*${inr}`, "im"))?.[1] ??
    text.match(new RegExp(`^\\s*${inr}\\s*(?:/\\s*|per\\s+)(?:month|year|week|quarter)\\b[^\\n]*\\bstarting\\b`, "im"))?.[1];
  if (!newPrice) return null;
  try {
    return validateEvent({ source: "email", kind: "price_change", merchant, amountPaise: toPaise(newPrice), date: input.date, reference: null, sourceId: input.id });
  } catch {
    return null;
  }
}

/**
 * A store confirmation for a new subscription or trial: "Subscription
 * Confirmed", the app, then "Renewal Price ₹99.00/month, starting <date>".
 * Nothing has been charged yet, so it stays a candidate with a listed price.
 */
export function parseStoreConfirmation(text: string, input: { id: string; date: string }): PaymentEvent | null {
  const all = lines(text);
  const heading = all.findIndex((line) => /^subscription confirmed$/i.test(line));
  if (heading < 0) return null;
  const merchant = plausible(all[heading + 1]?.split(":")[0]?.trim());
  if (!merchant) return null;
  const at = all.findIndex((line) => /^renewal price$/i.test(line));
  const terms = (at >= 0 ? all[at + 1] : "")?.match(new RegExp(`^${inr}\\s*/\\s*(month|year|week|quarter)\\b(?:,?\\s*starting\\s+(.+))?$`, "i"));
  if (!terms) return null;
  const frequency = ({ month: "monthly", year: "annual", week: "weekly", quarter: "quarterly" } as const)[terms[2].toLowerCase() as "month"];
  const renewalDate = terms[3] ? longDate(terms[3]) : undefined;
  try {
    return validateEvent({ source: "email", kind: "subscription_candidate", merchant, amountPaise: null, date: input.date, reference: null, sourceId: input.id, planPricePaise: toPaise(terms[1]), renewalFrequency: frequency, ...(renewalDate ? { renewalDate } : {}) });
  } catch {
    return null;
  }
}

/**
 * A store reminder: "You will be charged for your iCloud+ plan in 7 days" with
 * "renews monthly for ₹ 749 starting 2026-09-20". A scheduled renewal, not paid.
 */
export function parseStoreReminder(text: string, input: { id: string; date: string }): PaymentEvent | null {
  const merchant = plausible(text.match(/^\s*You will be charged for your (.{2,40}?) (?:plan|subscription) in \d+ days?\s*$/im)?.[1]);
  if (!merchant) return null;
  const terms = text.match(new RegExp(`\\brenews (monthly|yearly|annually|weekly) for ${inr} starting (\\d{4}-\\d{2}-\\d{2})`, "i"));
  if (!terms || !isDate(terms[3])) return null;
  const frequency = terms[1].toLowerCase() === "monthly" ? "monthly" : terms[1].toLowerCase() === "weekly" ? "weekly" : "annual";
  try {
    return validateEvent({ source: "email", kind: "subscription_renewal", merchant, amountPaise: toPaise(terms[2]), date: input.date, reference: null, sourceId: input.id, renewalDate: terms[3], renewalFrequency: frequency });
  } catch {
    return null;
  }
}
