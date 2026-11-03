import type { Commitment } from "@/lib/payments/types";
import { formatDate, formatINR } from "./format";

export type IssueCategory = "price" | "unused" | "trial" | "new" | "unknown";

export function annualPriceIncrease(item: Commitment) {
  if (
    item.previousAmount === undefined ||
    item.amount <= item.previousAmount ||
    item.cadence === "irregular"
  )
    return undefined;
  const multiplier = { weekly: 52, monthly: 12, quarterly: 4, annual: 1 }[item.cadence];
  return (item.amount - item.previousAmount) * multiplier;
}

export function issueGroups(items: Commitment[], kept: string[] = []) {
  const available = items.filter((item) => !kept.includes(item.id));
  return [
    {
      id: "price",
      title: "Silent price rises",
      badge: "PRICE ROSE",
      description:
        "Recorded charges increased, with no matching price-change notice found in the supplied messages.",
      rows: available.filter(
        (item) =>
          item.signals.includes("silent_hike") &&
          !item.hasPriceChangeNotice &&
          item.previousAmount !== undefined &&
          item.amount > item.previousAmount
      )
    },
    {
      id: "unused",
      title: "Paying, not using",
      badge: "NOT USED RECENTLY",
      description:
        "Charges continued despite little or no recorded use. Review whether you still want these services.",
      rows: available.filter((item) => item.signals.includes("zombie"))
    },
    {
      id: "trial",
      title: "Trials that became paid",
      badge: "TRIAL → PAID",
      description:
        "A trial-ending notice and paid charges were found. Check whether you intended to continue.",
      rows: available.filter((item) => item.signals.includes("trial_converted"))
    },
    {
      id: "new",
      title: "New permissions",
      badge: "NEW MANDATE",
      description: "A new recurring payment was detected. Make sure you intended to set it up.",
      rows: available.filter((item) => item.signals.includes("new"))
    },
    {
      id: "unknown",
      title: "Who is this?",
      badge: "UNKNOWN MERCHANT",
      description: "Repeating charges we could not match to a merchant in the reference list.",
      rows: available.filter((item) => !item.inDictionary)
    }
  ] satisfies {
    id: IssueCategory;
    title: string;
    badge: string;
    description: string;
    rows: Commitment[];
  }[];
}

export function issueDescription(item: Commitment, category: IssueCategory) {
  if (category === "price") {
    const changed = item.priceSeries.find((point) => point.amount !== item.priceSeries[0]?.amount);
    const extra = annualPriceIncrease(item);
    return `Went from ${formatINR(item.previousAmount ?? 0)} to ${formatINR(item.amount)}${changed ? ` on ${formatDate(changed.date)}` : ""}. No matching notice was found in the supplied messages.${extra !== undefined ? ` That is ${formatINR(extra)} more a year if this price continues.` : " Future cost depends on the payment schedule."}`;
  }
  if (category === "unused") {
    const charges = item.lastOpened
      ? item.evidenceRows.filter((row) => row.date > item.lastOpened!)
      : item.evidenceRows;
    const paid = charges.reduce((sum, row) => sum + row.amount, 0);
    return `${item.lastOpened ? `Last recorded use: ${formatDate(item.lastOpened)}.` : "No recent use was recorded."} ${charges.length} recorded ${charges.length === 1 ? "charge" : "charges"}${item.lastOpened ? " since then" : " in the supplied history"}, totalling ${formatINR(paid)}. Missing usage does not prove the service is unwanted.`;
  }
  if (category === "trial") {
    const notice = item.notices.find((entry) => entry.eventType === "trial_ending");
    const firstPaid = notice
      ? item.priceSeries.find(
          (point) =>
            point.date >= notice.sentOn &&
            (notice.amount === undefined || notice.amount === point.amount)
        )
      : undefined;
    return `${notice ? `Trial-ending notice: ${formatDate(notice.sentOn)}.` : "A trial conversion was flagged."} ${firstPaid ? `First matching paid charge: ${formatINR(firstPaid.amount)} on ${formatDate(firstPaid.date)}.` : "Review the messages and charges to confirm when payment began."}`;
  }
  if (category === "new")
    return `This recurring payment began on ${formatDate(item.startedOn)}. Check the service and payment permission to confirm you meant to set it up.`;
  return "Not in our merchant reference list. Review the original statement description and ask your payment provider to identify the merchant before deciding what to do.";
}
