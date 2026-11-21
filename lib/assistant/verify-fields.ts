/**
 * Checks the AI reader's answer against the original message (plan cards U2,
 * S8). The AI only copies text; it never decides a value. So every field it
 * returns must appear in the message itself. A field that does not, whether
 * the model made it up or a message tricked it, is removed before anything is
 * stored. Messages that try to give the AI orders are dropped entirely.
 */
import type { ReaderFields } from "./reader-shape";

/** Text that addresses the AI rather than the customer. No real bank alert says this. */
const INSTRUCTIONS = [
  /\bignore\b.{0,40}\b(instructions?|rules?|prompts?|above|previous)\b/i,
  /\b(disregard|forget|override)\b.{0,40}\b(instructions?|rules?|prompts?|system)\b/i,
  /\b(system prompt|you are now|act as|jailbreak|developer mode)\b/i,
  /\b(respond|reply|answer|output)\s+(only\s+)?(with|in)\s+json\b/i,
  /<\s*\/?\s*(system|assistant|user|instructions?)\s*>/i,
  /\b(set|make|mark)\s+(the\s+)?(amount|kind|merchant|is_financial)\b/i
];

export function looksLikeInstructions(text: string) {
  return INSTRUCTIONS.some(pattern => pattern.test(text));
}

/** Lower case, punctuation as spaces, and a space between letters and digits ("Rs.1,499" → "rs 1 499"). */
const tokens = (value: string) =>
  value.toLowerCase().replace(/([a-z])(\d)/g, "$1 $2").replace(/(\d)([a-z])/g, "$1 $2").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * True when the value appears in the message as whole words, ignoring case,
 * spacing and punctuation. Whole words matter: "Rs 6490" is not in "Rs 649.00".
 */
export function appearsIn(value: string, text: string) {
  const needle = tokens(value);
  return needle.length > 0 && ` ${tokens(text)} `.includes(` ${needle} `);
}

const CHECKED = ["merchant", "amount_text", "date_text", "reference", "upi_id"] as const;

/** Removes every field the message does not contain, and says which ones. */
export function keepGroundedFields(fields: ReaderFields, text: string): { fields: ReaderFields; removed: string[] } {
  const kept: ReaderFields = { ...fields };
  const removed: string[] = [];
  for (const name of CHECKED) {
    const value = kept[name];
    if (value !== null && !appearsIn(value, text)) { kept[name] = null; removed.push(name); }
  }
  if (kept.account_last4 !== null && !text.replace(/\D/g, " ").split(" ").some(n => n.endsWith(kept.account_last4!))) {
    kept.account_last4 = null; removed.push("account_last4");
  }
  return { fields: kept, removed };
}
