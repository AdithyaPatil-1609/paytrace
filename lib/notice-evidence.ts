import { RULES } from "./rules";
import type { Commitment } from "./types";

export function rejectedPriceNotices(item: Commitment) {
  if (!item.signals.includes("silent_hike")) return [];
  const firstAmount = item.priceSeries[0]?.amount;
  const change = item.priceSeries.find((point) => point.amount !== firstAmount);
  if (!change) return [];
  return item.notices.filter((notice) => notice.eventType === "price_change").map((notice) => {
    const gap = Math.round((Date.parse(change.date) - Date.parse(notice.sentOn)) / 86400000);
    const reasons: string[] = [];
    if (gap > RULES.noticeWindowDays) reasons.push(`it arrived ${gap} days before the change, outside the ${RULES.noticeWindowDays}-day matching window`);
    if (gap < 0) reasons.push("it arrived after the first increased charge");
    if (notice.amount !== undefined && notice.amount !== item.amount) reasons.push(`it describes ₹${notice.amount}, not the new ₹${item.amount} charge`);
    return { notice, changeDate: change.date, reasons };
  }).filter((entry) => entry.reasons.length > 0);
}
