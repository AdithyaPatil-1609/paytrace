/**
 * Small display helpers shared by the four screens and the detail panel.
 * Money maths stays in lib/analysis.ts and lib/engine.ts — this file only formats.
 */
import { toCsv } from "@/lib/csv";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

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

/** Browser download of the active commitment list. */
export function downloadCommitmentsCsv(items: Commitment[]) {
  const headers = [
    "statement_narration",
    "plain_name",
    "what_it_is",
    "instrument",
    "cadence",
    "amount_pattern",
    "each_charge_inr",
    "annual_cost_inr",
    "bucket",
    "signals",
    "status",
    "debits_seen",
    "last_charge",
    "next_charge",
    "last_opened",
    "message_source",
    "stop_the_service",
    "stop_the_money",
    "if_they_stay_silent"
  ];
  const rows = items.map((item) => [
    item.rawNarration,
    item.merchant,
    item.plainDescription,
    item.instrument,
    item.cadence,
    item.amountPattern,
    item.cadence === "annual" ? "" : item.amount,
    item.annualCost,
    item.bucket,
    item.signals.join(" "),
    item.status,
    item.debitCount,
    item.lastCharge,
    item.nextCharge ?? "",
    item.lastOpened ?? "",
    item.source,
    item.stopService,
    item.stopMoney,
    item.ifSilent
  ]);
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "paytrace-commitments.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
