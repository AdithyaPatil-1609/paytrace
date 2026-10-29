/**
 * One rule book, two runners.
 *
 * The thresholds, ids, and sentences below are the parts of detection that
 * must never drift between lib/engine.ts (the offline CSV path) and
 * db/neo4j/analyze.ts (live Cypher). The engine imports them directly; the
 * Cypher query receives RULES as the $rules parameter, so a change here moves
 * both. tests/cypher.test.ts asserts the two engines then agree field by field.
 */
import type { AmountPattern, Cadence, CommitmentKind, Instrument, Mechanism, Signal } from "./types";

export const RULES = {
  /** A service unopened for longer than this is a zombie. */
  zombieDays: 90,
  /** Gaps scattering by more than this share of their median make a row irregular. */
  irregularSpread: 0.35,
  /** Median-gap ceilings, in days, for each cadence. Above quarterly is annual. */
  weeklyMaxGap: 10,
  monthlyMaxGap: 45,
  quarterlyMaxGap: 135,
  /** Next-charge gap for a row with one debit under a mandate. */
  defaultGapDays: 30
} as const;

/** The same keys with any value, for a test that overrides one threshold. */
export type Rules = { [Key in keyof typeof RULES]: number };

export const instrumentByMechanism: Record<Mechanism, Instrument> = {
  upi_autopay: "UPI Autopay",
  card_recurring: "Card",
  play_store: "Store plan",
  enach: "eNACH",
  bbps: "Bill autopay",
  neft_standing: "Standing transfer",
  vas: "Operator pack",
  emi_ach: "Loan",
  none: "Card"
};

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * An id has to identify one commitment, not one merchant. Grouping is per
 * pattern and per account, so the id carries both: the same brand reached
 * through a second account, or through a second descriptor such as
 * PAYPAL *SPOTIFY, is a different commitment and must not share an id.
 *
 * The descriptor is only added for a brand the dictionary reaches by more
 * than one pattern, so ordinary rows keep a readable id.
 */
export function commitmentId(brand: string, pattern: string, accountId: string, ambiguous: boolean) {
  const brandSlug = slug(brand);
  const accountSlug = slug(accountId);
  if (!ambiguous) return [brandSlug, accountSlug].filter(Boolean).join("-");

  const patternSlug = slug(pattern);
  const descriptor = patternSlug.startsWith(brandSlug)
    ? patternSlug.slice(brandSlug.length).replace(/^-/, "")
    : patternSlug;
  return [brandSlug, descriptor, accountSlug].filter(Boolean).join("-");
}

export function describeRecurring(context: {
  count: number;
  cadence: Cadence;
  pattern: AmountPattern;
  gapCentre: number;
  gapMin?: number;
  gapMax?: number;
  mandate: boolean;
}) {
  const { count, cadence, pattern, gapCentre, gapMin, gapMax, mandate } = context;
  if (count < 2 && mandate) {
    return "One debit so far, under a mandate that is still active. The mandate is what makes it recurring.";
  }
  const rhythm =
    cadence === "irregular"
      ? `${count} debits on uneven dates, ${gapMin} to ${gapMax} days apart`
      : `${count} debits about ${gapCentre} days apart`;
  const shape =
    pattern === "fixed"
      ? "the same amount every time"
      : pattern === "step"
        ? "one amount, then a second amount that stayed"
        : "a different amount each time";
  return `${rhythm}, ${shape}. The interval holds, so the grouping keeps it.`;
}

export function describeIssue(
  signals: Signal[],
  context: { lastOpened?: string; previous?: number; latest: number; openedDaysAgo?: number }
) {
  if (signals.includes("silent_hike")) {
    return `₹${context.previous ?? context.latest} became ₹${context.latest}. Debit messages exist. A price-change message does not.`;
  }
  if (signals.includes("trial_converted")) return "A trial-ending notice, then the paid price. The ₹1 hold is not the price.";
  if (signals.includes("zombie")) {
    return context.lastOpened
      ? `Last opened ${context.lastOpened}, about ${Math.floor((context.openedDaysAgo ?? 0) / 30)} months ago. The charge did not stop.`
      : "Never opened in the last twelve months. A pack she did not go looking for.";
  }
  return undefined;
}

export function statusFor(signals: Signal[], kind: CommitmentKind) {
  if (kind === "debt") return "Loan repayment";
  if (signals.includes("zombie")) return "Stopped using it";
  if (signals.includes("silent_hike")) return "Price changed without a notice";
  if (signals.includes("trial_converted")) return "Trial became paid";
  if (signals.includes("obligation")) return "Obligation";
  if (signals.includes("variable_amount")) return "Variable bill";
  if (signals.includes("irregular_interval")) return "Irregular dates";
  if (signals.includes("new")) return "New autopay";
  if (signals.includes("annual_next_date")) return "Annual payment";
  return "In use";
}
