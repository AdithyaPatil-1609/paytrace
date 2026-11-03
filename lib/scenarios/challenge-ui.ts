import type { ChallengeAction, ChallengeResult } from "./challenge";
import type { Commitment } from "@/lib/payments/types";

export function challengeChoices(item: Commitment) {
  const subscription = item.cancelMode === "normal";
  const price =
    subscription && item.previousAmount !== undefined && item.amount > item.previousAmount;
  const usage = subscription && item.inDictionary && item.signals.includes("zombie");
  const merchant = subscription && !item.inDictionary;
  return { price, usage, merchant, available: price || usage || merchant };
}

export function challengeTakeaway(result: ChallengeResult, action: ChallengeAction) {
  if (result.after.length === 0)
    return "These charges would no longer be identified as a recurring payment";
  if (action === "matching_notice" || action === "old_notice") {
    return result.after.some((item) => item.signals.includes("silent_hike"))
      ? "The price-rise warning would remain"
      : result.before.signals.includes("silent_hike")
        ? "The price-rise warning would clear"
        : "No unannounced price rise would be flagged";
  }
  if (action === "recent_usage")
    return result.after.some((item) => item.signals.includes("zombie"))
      ? "The unused-service warning would remain"
      : "The unused-service warning would clear";
  if (action === "merchant_correction")
    return result.after.every((item) => item.inDictionary)
      ? "This payment would use your example name"
      : "The merchant would still need to be identified";
  const before = new Set(result.before.evidenceRows.map((row) => row.txnId));
  const after = new Set(result.after.flatMap((item) => item.evidenceRows.map((row) => row.txnId)));
  return result.after.length === 1 &&
    before.size === after.size &&
    [...before].every((id) => after.has(id))
    ? "These charges would still be grouped together"
    : "The payment grouping would change";
}
