/**
 * Says when two bank descriptors may be the same merchant ("SPOTIFY STOCKHOLM",
 * "POS SPOTIFY"), without a hand-written list of every spelling. It only ever
 * suggests: callers record a SIMILAR link for the person to confirm, and never
 * merge payments because names look alike.
 */
import { MERCHANT_MATCH as M } from "./rules";
import { matchDictionary } from "./engine";
import type { DictionaryEntry } from "./types";

export type MatchBand = "canonical" | "strong" | "review" | "separate";
export type MatchMethod = "exact_alias" | "same_name" | "word_overlap" | "edit_distance";
export type MerchantMatch = { candidateId: string; candidateName: string; score: number; method: MatchMethod; band: MatchBand; reason: string };
export type NamedMerchant = { id: string; name: string };

/** Words a bank or card network puts in front of the merchant. Only removed at the start. */
const BANK_PREFIXES = new Set(["POS", "UPI", "ACH", "NACH", "ECS", "IMPS", "NEFT", "RTGS", "VIN", "VPS", "MB", "IB", "NB", "SI", "BIL", "BILLPAY", "AUTOPAY", "MANDATE", "DEBIT", "DR", "CARD", "PURCHASE", "PUR", "TXN", "TRF", "TO", "PAYMENT", "ONLINE", "INTL", "ECOM", "RECURRING"]);
/** Words that say nothing about which merchant it is, anywhere in the line. */
const NOISE = new Set(["COM", "WWW", "HTTP", "HTTPS", "PVT", "LTD", "LIMITED", "INC", "LLC", "CO"]);

/** Upper case, punctuation to spaces, bank prefixes and reference numbers removed. */
export function normalizeDescriptor(text: string) {
  const words = text.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().split(" ").filter(Boolean);
  let start = 0;
  while (start < words.length - 1 && BANK_PREFIXES.has(words[start])) start++;
  // Pure numbers and long codes with digits are references, not names.
  const tokens = words.slice(start).filter(w => !NOISE.has(w) && !/^\d+$/.test(w) && !(w.length >= 6 && /\d/.test(w)));
  return { tokens, compact: tokens.join("") };
}

/** Levenshtein distance, two rows. Inputs are short merchant names. */
export function editDistance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}

/** 1 for equal strings, 0 for nothing in common. */
export function editSimilarity(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - editDistance(a, b) / longest : 0;
}

/**
 * How many known names contain each word. A word that other merchants also use
 * ("GOOGLE" in "Google One" and "Google Play") is weak evidence that two names
 * are the same merchant; a word only these two share ("SPOTIFY") is strong.
 */
export function wordCounts(names: string[]) {
  const counts = new Map<string, number>();
  // "Spotify" in the catalog and "SPOTIFY" in a statement are one name, counted once.
  const distinct = new Map(names.map(name => { const n = normalizeDescriptor(name); return [n.compact, n.tokens] as const; }));
  for (const tokens of distinct.values()) for (const word of new Set(tokens)) counts.set(word, (counts.get(word) ?? 0) + 1);
  return counts;
}

export function bandOf(score: number): MatchBand {
  return score >= M.strong ? "strong" : score >= M.review ? "review" : "separate";
}

const round = (x: number) => Math.round(x * 1000) / 1000;

type Weight = (word: string) => { weight: number; shared: boolean };

/** One direction: how well `descriptor` contains every word of `candidate`. */
function containment(descriptor: string[], candidate: string[], weight: Weight) {
  let total = 0, matched = 0, used = 0, leading = true, fuzzy = false, distinctive = false;
  const sharedWords: string[] = [];
  candidate.forEach((word, i) => {
    const { weight: w, shared } = weight(word);
    total += w;
    let best = 0, at = -1;
    descriptor.forEach((d, j) => {
      const s = d === word ? 1 : d.length >= M.fuzzyWordMinLength && word.length >= M.fuzzyWordMinLength ? editSimilarity(d, word) : 0;
      if (s > best) { best = s; at = j; }
    });
    if (best >= M.fuzzyWord) {
      matched += w * best; used++;
      if (best < 1) fuzzy = true;
      if (!shared) distinctive = true; else sharedWords.push(word);
      if (at !== i) leading = false;
    } else leading = false;
  });
  const coverage = total ? matched / total : 0;
  const precision = descriptor.length ? used / descriptor.length : 0;
  let score = coverage === 0 ? 0 : used < candidate.length ? coverage * 0.8 : coverage * (0.9 + 0.1 * precision);
  // A one-word name found in the middle of a longer line ("HOUSING SOCIETY MAINT") is never strong on its own.
  if (!leading && precision < 0.5) score = Math.min(score, M.strong - 0.01);
  // Only words other merchants also use matched ("GOOGLE" vs "Google One"): a question for the person, never strong.
  if (!distinctive) score = Math.min(score, M.strong - 0.01);
  return { score, used, fuzzy, sharedOnly: !distinctive && used > 0, sharedWords };
}

/**
 * Similarity of two merchant names, the same in both directions. `counts`
 * (from wordCounts over every known name) discounts words other merchants share.
 */
export function similarity(a: string, b: string, counts: Map<string, number> = new Map()): { score: number; method: MatchMethod; reason: string } {
  const x = normalizeDescriptor(a), y = normalizeDescriptor(b);
  if (!x.compact || !y.compact) return { score: 0, method: "word_overlap", reason: "One name has no letters left after cleaning." };
  if (x.compact === y.compact) return { score: 1, method: "same_name", reason: `Both read "${x.tokens.join(" ")}" once bank prefixes and punctuation are removed.` };
  const own = new Set([...x.tokens, ...y.tokens]);
  const weight: Weight = (word) => {
    // Names other than these two that contain the word (each of a and b counted once at most).
    const others = Math.max(0, (counts.get(word) ?? 0) - (x.tokens.includes(word) ? 1 : 0) - (y.tokens.includes(word) ? 1 : 0));
    return { weight: own.has(word) ? 1 / (1 + others) : 1, shared: others > 0 };
  };
  const forward = containment(x.tokens, y.tokens, weight), backward = containment(y.tokens, x.tokens, weight);
  const useForward = forward.score >= backward.score;
  const words = useForward ? forward : backward;
  const edit = editSimilarity(x.compact, y.compact);
  if (words.score >= edit) {
    const shorter = useForward ? y.tokens : x.tokens;
    const spelling = words.fuzzy ? ", allowing a small spelling difference" : "";
    const shared = words.sharedOnly ? ` "${words.sharedWords.join(" ")}" also appears in other merchant names, so this needs your review.` : "";
    return { score: round(words.score), method: "word_overlap", reason: (words.used === shorter.length
      ? `Every word of "${shorter.join(" ")}" appears in the other name${spelling}.`
      : `Only ${words.used} of ${shorter.length} words of "${shorter.join(" ")}" match.`) + shared };
  }
  return { score: round(edit), method: "edit_distance", reason: `"${x.compact}" and "${y.compact}" differ by ${editDistance(x.compact, y.compact)} letters.` };
}

/** Catalog brands that can be suggested (demo-only rows excluded). */
export function catalogMerchants(dictionary: DictionaryEntry[]): NamedMerchant[] {
  const seen = new Set<string>();
  return dictionary.filter(e => e.cancelMode !== "fixture" && !seen.has(e.brand) && seen.add(e.brand)).map(e => ({ id: `catalog:${e.brand}`, name: e.brand }));
}

/**
 * The best candidate for one descriptor: an exact dictionary pattern first
 * (unchanged engine rule), then the most similar catalog or own merchant.
 * Returns null when nothing reaches the review threshold.
 */
export function matchMerchant(descriptor: string, own: NamedMerchant[], dictionary: DictionaryEntry[]): MerchantMatch | null {
  const alias = matchDictionary(descriptor, dictionary);
  if (alias) return { candidateId: `catalog:${alias.brand}`, candidateName: alias.brand, score: 1, method: "exact_alias", band: "canonical", reason: `The line contains the verified pattern "${alias.pattern || alias.brand}".` };
  const pool = [...catalogMerchants(dictionary), ...own.slice(0, M.maxProfileMerchants)];
  const counts = wordCounts([...pool.map(p => p.name), descriptor]);
  let best: MerchantMatch | null = null;
  for (const candidate of pool) {
    const s = similarity(descriptor, candidate.name, counts);
    if (!best || s.score > best.score) best = { candidateId: candidate.id, candidateName: candidate.name, score: s.score, method: s.method, band: bandOf(s.score), reason: s.reason };
  }
  return best && best.band !== "separate" ? best : null;
}

export type SimilarPair = { a: string; b: string; score: number; method: MatchMethod; band: Exclude<MatchBand, "canonical" | "separate">; reason: string };

/**
 * Every pair of one person's merchants worth a SIMILAR link. Pairs are ordered
 * (a < b) so one pair is one link, and a merchant is never linked to itself.
 */
export function similarPairs(merchants: NamedMerchant[], dictionary: DictionaryEntry[]): SimilarPair[] {
  const list = [...new Map(merchants.map(m => [m.id, m] as const)).values()].slice(0, M.maxProfileMerchants);
  const counts = wordCounts([...catalogMerchants(dictionary).map(c => c.name), ...list.map(m => m.name)]);
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [first, second] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
    if (first.id === second.id) continue;
    const s = similarity(first.name, second.name, counts);
    const band = bandOf(s.score);
    if (band === "separate") continue;
    pairs.push({ a: first.id, b: second.id, score: s.score, method: s.method, band: band as SimilarPair["band"], reason: s.reason });
  }
  return pairs;
}
