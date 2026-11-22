/**
 * Small display helpers shared by the four screens and the detail panel.
 * Money maths stays in server/payments/analysis.ts and server/payments/engine.ts — this file only formats.
 */
import { formatINR } from "./format";
import type { Commitment } from "@/server/payments/types";

export function monthlyCost(item: Commitment) {
  if (item.cadence === "annual") return "once a year";
  if (item.cadence === "irregular") return `${formatINR(item.amount)} each time`;
  if (item.amountPattern === "variable") return `about ${formatINR(item.amount)}`;
  return `${formatINR(item.amount)} / month`;
}

export function modeLabel(item: Commitment) {
  if (item.cancelMode === "block") return "DEBT · NO CANCEL";
  if (item.cancelMode === "warn") return "OBLIGATION · DECIDE CAREFULLY";
  if (item.cancelMode === "explain") return "THE AMOUNT DUE REMAINS";
  if (item.kind === "unused") return "UNUSED · STILL CHARGING";
  if (item.kind === "silent") return "PRICE ROSE · NO NOTICE";
  if (item.kind === "trial") return "TRIAL BECAME PAID";
  return "TWO TRACKS";
}
