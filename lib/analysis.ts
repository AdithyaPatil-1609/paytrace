import type { Bucket, Commitment, SpendGroup } from "./types";
import { ZOMBIE_DAYS } from "./engine";

export function yearlyTotal(items: Commitment[]) {
  return items.reduce((total, item) => total + item.annualCost, 0);
}

export function unusedTotal(items: Commitment[]) {
  return yearlyTotal(items.filter((item) => item.kind === "unused"));
}

export function groupByKind(items: Commitment[]) {
  return Object.groupBy(items, (item) => item.kind);
}

/** The five-way split behind the annual screen. */
export function splitByBucket(items: Commitment[]) {
  const order: Bucket[] = ["unused", "review", "used", "bills", "debt"];
  return order.map((bucket) => {
    const rows = items.filter((item) => item.bucket === bucket);
    return { bucket, rows, total: yearlyTotal(rows) };
  });
}

/** A price moved and no message said so. That absence is the finding. */
export function isSilentPriceHike(item: Commitment) {
  return item.signals.includes("silent_hike") && !item.hasPriceChangeNotice;
}

export function hikeAmount(item: Commitment) {
  if (!isSilentPriceHike(item) || item.previousAmount === undefined) return 0;
  const monthsAtNewPrice = item.evidenceRows.filter((row) => row.amount === item.amount).length;
  return (item.amount - item.previousAmount) * monthsAtNewPrice;
}

export function isZombie(item: Commitment) {
  if (item.lastOpenedMonthsAgo === undefined) return item.signals.includes("zombie");
  return item.lastOpenedMonthsAgo * 30 >= ZOMBIE_DAYS;
}

export function isTrialConverted(item: Commitment) {
  return item.signals.includes("trial_converted");
}

/**
 * Rows that deserve a decision: unused, a silent hike, or a converted trial.
 * A row the person has chosen to keep is settled, so it drops off this list
 * on every screen that uses it, not just the one the choice was made on.
 */
export function issueItems(items: Commitment[], kept: string[] = []) {
  return items.filter((item) => ["unused", "silent", "trial"].includes(item.kind) && !kept.includes(item.id));
}

/** The part of the leak that sits on rows the person decided to keep. */
export function keptLeakTotal(items: Commitment[], kept: string[]) {
  return yearlyTotal(items.filter((item) => kept.includes(item.id) && item.kind === "unused"));
}

/* ---------------------------------------------------------------
   Visualization helpers
   --------------------------------------------------------------- */

export type CategorySlice = {
  group: SpendGroup;
  total: number;
  share: number;
  rows: Commitment[];
};

/**
 * Composition of the year by where the money goes. This is independent of
 * kind: a gym nobody uses is still a subscription, and "unused" is a status
 * rather than a category of spend.
 */
export function groupByCategory(items: Commitment[]): CategorySlice[] {
  const order: SpendGroup[] = ["debt", "subscriptions", "utilities", "insurance"];
  const total = yearlyTotal(items);
  return order
    .map((group) => {
      const rows = items.filter((item) => item.spendGroup === group);
      const groupTotal = yearlyTotal(rows);
      return { group, rows, total: groupTotal, share: total === 0 ? 0 : groupTotal / total };
    })
    .filter((slice) => slice.rows.length > 0)
    .sort((a, b) => b.total - a.total);
}

export type ForecastSegment = {
  label: string;
  amount: number;
  /** base repeats every month. The others land only occasionally. */
  kind: "base" | "annual" | "irregular";
};

export type ForecastMonth = {
  key: string;
  label: string;
  total: number;
  /** The run that leaves in a plain month, identical across the year. */
  base: number;
  /** Only the occasional extras, so a tall bar can explain itself. */
  segments: ForecastSegment[];
  /** True when a segment's date is a projection rather than a schedule. */
  estimated: boolean;
};

function addMonths(date: Date, count: number) {
  const next = new Date(date);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + count);
  return next;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The next twelve months of scheduled debits, split into the run that repeats
 * every month and the extras that land on top of it. Deliberately not
 * annualCost / 12: an annual renewal belongs to one month, and an irregular
 * transfer lands on its own spacing.
 */
export function monthlyForecast(items: Commitment[], asOf: string): ForecastMonth[] {
  const start = addMonths(new Date(Date.parse(asOf)), 1);
  const months: ForecastMonth[] = [];

  for (let index = 0; index < 12; index += 1) {
    const when = addMonths(start, index);
    months.push({
      key: `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[when.getUTCMonth()],
      total: 0,
      base: 0,
      segments: [],
      estimated: false
    });
  }

  const indexOf = new Map(months.map((month, position) => [month.key, position]));

  const add = (position: number, segment: ForecastSegment) => {
    const month = months[position];
    if (!month) return;
    month.total += segment.amount;
    if (segment.kind === "base") month.base += segment.amount;
    else month.segments.push(segment);
    if (segment.kind === "irregular") month.estimated = true;
  };

  for (const item of items) {
    if (item.cadence === "annual") {
      if (!item.nextCharge) continue;
      const position = indexOf.get(item.nextCharge.slice(0, 7));
      if (position !== undefined) add(position, { label: item.merchant, amount: item.amount, kind: "annual" });
      continue;
    }

    if (item.cadence === "irregular") {
      const spacing = Math.max(1, Math.round(12 / Math.max(item.debitCount, 1)));
      const positions = Array.from({ length: Math.floor(12 / spacing) }, (_, index) => (index + 1) * spacing - 1);
      // Dates are estimates; preserve the annual amount even when past bills varied.
      positions.forEach((position, index) => {
        const amount = Math.round(item.annualCost * (index + 1) / positions.length)
          - Math.round(item.annualCost * index / positions.length);
        add(position, { label: item.merchant, amount, kind: "irregular" });
      });
      continue;
    }

    if (item.cadence === "quarterly") {
      const anchor = new Date(item.lastCharge);
      months.forEach((month, position) => {
        const when = new Date(`${month.key}-01T00:00:00Z`);
        const gap = (when.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + when.getUTCMonth() - anchor.getUTCMonth();
        if (gap > 0 && gap % 3 === 0) add(position, { label: item.merchant, amount: item.amount, kind: "annual" });
      });
      continue;
    }

    if (item.cadence === "weekly") {
      // A monthly budget for weekly payments, with rounding that preserves the year.
      months.forEach((month, position) => {
        const amount = Math.round(item.annualCost * (position + 1) / 12) - Math.round(item.annualCost * position / 12);
        add(position, { label: item.merchant, amount, kind: "base" });
        month.estimated = true;
      });
      continue;
    }

    for (let position = 0; position < 12; position += 1) {
      add(position, { label: item.merchant, amount: item.amount, kind: "base" });
    }
  }

  return months.map((month) => ({
    ...month,
    total: Math.round(month.total),
    base: Math.round(month.base)
  }));
}

export type PriceHike = {
  item: Commitment;
  from: number;
  to: number;
  delta: number;
  percent: number;
  annualExtra: number;
  /** A hike that arrived with a message is real, but it is not silent. */
  noticed: boolean;
};

/**
 * Every commitment whose price stepped up. A hike with a matching
 * price-change notice is reported at lower severity than a silent one.
 */
export function detectPriceHikes(items: Commitment[]): PriceHike[] {
  return items
    .filter((item) => item.amountPattern === "step" && item.previousAmount !== undefined && item.amount > item.previousAmount)
    .map((item) => {
      const from = item.previousAmount as number;
      const to = item.amount;
      const delta = to - from;
      return {
        item,
        from,
        to,
        delta,
        percent: Math.round((delta / from) * 1000) / 10,
        annualExtra: delta * 12,
        noticed: item.hasPriceChangeNotice
      };
    })
    .sort((a, b) => b.annualExtra - a.annualExtra);
}

/**
 * What stopping the selected rows would take out of the year. Insurance and
 * the loan can never be selected, and nothing here marks a mandate cancelled:
 * it is a projection, not a realized saving.
 */
export function potentialSavings(items: Commitment[], selectedIds: string[]) {
  const eligible = items.filter(
    (item) => item.kind === "unused" && item.cancelMode !== "block" && item.cancelMode !== "warn"
  );
  const selected = eligible.filter((item) => selectedIds.includes(item.id));
  const saved = yearlyTotal(selected);
  return {
    eligible,
    selected,
    saved,
    revisedYear: yearlyTotal(items) - saved
  };
}

export type Renewal = {
  item: Commitment;
  date?: string;
  confidence: Commitment["dateConfidence"];
};

/**
 * Upcoming charges, soonest first. A row whose date cannot be supported by
 * the payment history keeps no date at all rather than a guessed one.
 */
export function upcomingRenewals(items: Commitment[]): Renewal[] {
  return items
    .map((item) => ({
      item,
      date: item.dateConfidence === "unknown" ? undefined : item.nextCharge,
      confidence: item.dateConfidence
    }))
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
}
