/**
 * What a family viewer may see of someone's payments: an allowlist, so a new
 * field on Commitment is never shared by accident. No account numbers, bank
 * descriptors, references, messages, tokens or evidence ids.
 */
import type { Cadence, Commitment, SpendGroup } from "@/lib/payments/types";

export const FAMILY_SCOPE = "recurring_summary" as const;

export type FamilyPayment = { merchant: string; product: string; cadence: Cadence; amount: number; annualCost: number; nextCharge: string | null; spendGroup: SpendGroup };
export type FamilySummary = { owner: string; expiresAt: string; payments: FamilyPayment[]; totals: { count: number; annual: number; monthly: number } };

export function familyPayments(commitments: Commitment[]): FamilyPayment[] {
  return commitments
    .map(c => ({ merchant: c.merchant, product: c.product, cadence: c.cadence, amount: c.amount, annualCost: c.annualCost, nextCharge: c.nextCharge ?? null, spendGroup: c.spendGroup }))
    .sort((a, b) => b.annualCost - a.annualCost);
}

export function familyTotals(payments: FamilyPayment[]) {
  const annual = Math.round(payments.reduce((sum, p) => sum + p.annualCost, 0));
  return { count: payments.length, annual, monthly: Math.round(annual / 12) };
}

/** Only the first name is shown to the other person. */
export const firstName = (name: unknown) => (typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0].slice(0, 40) : "Paytrace user");
