import type { Commitment } from "./types";

export type CalendarRow = { item: Commitment; day: number; amount: number; paid: boolean };

/**
 * Every debit in one calendar month. A month already over shows the debits that
 * really left (from the evidence rows); a month still to come shows the debits
 * expected from each payment's cadence; the current month shows both.
 */
export function monthSchedule(items: Commitment[], asOf: string, year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  const length = new Date(end.getTime() - 86400000).getUTCDate();
  const asOfTime = Date.parse(`${asOf.slice(0, 10)}T00:00:00Z`);
  const inMonth = (date: string) => { const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`); return t >= start.getTime() && t < end.getTime(); };
  const rows: CalendarRow[] = [];
  const undated = items.filter(item => item.cadence === "irregular" || item.dateConfidence === "unknown");

  for (const item of items) {
    // What really left: past and current months.
    if (start.getTime() <= asOfTime) {
      for (const row of item.evidenceRows ?? []) {
        if (inMonth(row.date) && Date.parse(`${row.date}T00:00:00Z`) <= asOfTime && row.amount > 0) rows.push({ item, day: Number(row.date.slice(8, 10)), amount: row.amount, paid: true });
      }
    }
    // What is expected: current and future months, from the cadence.
    if (end.getTime() <= asOfTime || undated.includes(item)) continue;
    const anchor = new Date(item.nextCharge ?? item.lastCharge);
    if (!Number.isFinite(anchor.getTime())) continue;
    const add = (day: number) => {
      const when = Date.UTC(year, month, day);
      if (when > asOfTime && !rows.some(r => r.item === item && r.day === day)) rows.push({ item, day, amount: item.amount, paid: false });
    };
    if (item.cadence === "weekly") {
      let time = anchor.getTime();
      time += Math.max(0, Math.ceil((start.getTime() - time) / (7 * 86400000))) * 7 * 86400000;
      for (; time < end.getTime(); time += 7 * 86400000) add(new Date(time).getUTCDate());
    } else {
      const gap = (year - anchor.getUTCFullYear()) * 12 + month - anchor.getUTCMonth();
      if (gap < 0) continue;
      if (item.cadence === "annual" && gap % 12 !== 0) continue;
      if (item.cadence === "quarterly" && gap % 3 !== 0) continue;
      add(Math.min(anchor.getUTCDate(), length));
    }
  }
  return { year, month, length, blanks: (start.getUTCDay() + 6) % 7, rows: rows.sort((a, b) => a.day - b.day), undated };
}

/** All dated occurrences in the calendar month after the dataset snapshot. */
export function nextMonthSchedule(items: Commitment[], asOf: string) {
  const snapshot = new Date(asOf);
  const next = new Date(Date.UTC(snapshot.getUTCFullYear(), snapshot.getUTCMonth() + 1, 1));
  return monthSchedule(items, asOf, next.getUTCFullYear(), next.getUTCMonth());
}
