import type { Commitment } from "./types";

/** All dated occurrences in the calendar month after the dataset snapshot. */
export function nextMonthSchedule(items: Commitment[], asOf: string) {
  const snapshot = new Date(asOf);
  const start = new Date(Date.UTC(snapshot.getUTCFullYear(), snapshot.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const year = start.getUTCFullYear(), month = start.getUTCMonth();
  const length = new Date(end.getTime() - 86400000).getUTCDate();
  const rows: { item: Commitment; day: number }[] = [];
  const undated = items.filter(item => item.cadence === "irregular" || item.dateConfidence === "unknown");
  for (const item of items) {
    if (undated.includes(item)) continue;
    const anchor = new Date(item.nextCharge ?? item.lastCharge);
    if (!Number.isFinite(anchor.getTime())) continue;
    if (item.cadence === "weekly") {
      let time = anchor.getTime();
      time += Math.max(0, Math.ceil((start.getTime() - time) / (7 * 86400000))) * 7 * 86400000;
      for (; time < end.getTime(); time += 7 * 86400000) rows.push({ item, day: new Date(time).getUTCDate() });
    } else {
      const gap = (year - anchor.getUTCFullYear()) * 12 + month - anchor.getUTCMonth();
      if (gap < 0) continue;
      if (item.cadence === "annual" && gap % 12 !== 0) continue;
      if (item.cadence === "quarterly" && gap % 3 !== 0) continue;
      rows.push({ item, day: Math.min(anchor.getUTCDate(), length) });
    }
  }
  return { year, month, length, blanks: (start.getUTCDay() + 6) % 7, rows: rows.sort((a, b) => a.day - b.day), undated };
}
