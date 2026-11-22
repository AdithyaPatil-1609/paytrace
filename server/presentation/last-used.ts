import type { Commitment } from "@/server/payments/types";
import { formatDate } from "./format";

/**
 * The small "Last used" line on a payment card. Only a real usage fact gives a
 * line: a phone's screen time, a date the person confirmed, or the demo's
 * usage file. No usage record means no line, never a guess.
 */
export function lastUsedLine(item: Pick<Commitment, "lastOpened" | "notOpenedSince" | "usageSource">) {
  const from = item.usageSource === "phone" ? " · screen time" : "";
  if (item.lastOpened) return `Last used ${formatDate(item.lastOpened)}${from}`;
  if (item.notOpenedSince) return `Not opened since ${formatDate(item.notOpenedSince)}${from}`;
  return undefined;
}
