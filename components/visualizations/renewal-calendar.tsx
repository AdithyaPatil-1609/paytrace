"use client";

import { useState } from "react";
import { upcomingRenewals } from "@/lib/analysis";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

type Filter = "all" | "annual" | "monthly" | "variable" | "flagged";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "annual", label: "Annual renewals" },
  { id: "monthly", label: "Monthly autopay" },
  { id: "variable", label: "Variable bills" },
  { id: "flagged", label: "Flagged" }
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** The two months after the as-of date. October shows November, then December. */
function ahead(asOf: string) {
  const start = new Date(Date.parse(asOf));
  return [1, 2].map((step) => {
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + step, 1));
    return { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() };
  });
}

function dayInMonth(item: Commitment, year: number, month: number) {
  if (item.cadence === "irregular" || item.dateConfidence === "unknown") return undefined;
  if (item.cadence === "annual") {
    if (!item.nextCharge) return undefined;
    const when = new Date(Date.parse(item.nextCharge));
    return when.getUTCFullYear() === year && when.getUTCMonth() === month ? when.getUTCDate() : undefined;
  }
  const anchor = new Date(Date.parse(item.lastCharge));
  if (item.cadence === "quarterly") {
    const gap = (year - anchor.getUTCFullYear()) * 12 + (month - anchor.getUTCMonth());
    if (gap <= 0 || gap % 3 !== 0) return undefined;
  }
  return Math.min(anchor.getUTCDate(), daysInMonth(year, month));
}

function matches(item: Commitment, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "annual") return item.cadence === "annual";
  if (filter === "monthly") return item.cadence === "monthly" && item.amountPattern !== "variable";
  if (filter === "variable") return item.amountPattern === "variable" || item.cadence === "irregular";
  return ["unused", "silent", "trial"].includes(item.kind);
}

/**
 * What is due next. A date only appears when the payment history supports
 * it; everything else says so plainly instead of showing a guess.
 */
export function RenewalCalendar({
  items,
  asOf,
  onOpen
}: {
  items: Commitment[];
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const visible = items.filter((item) => matches(item, filter));
  const months = ahead(asOf).map((slot) => ({
    ...slot,
    rows: visible
      .flatMap((item) => {
        const day = dayInMonth(item, slot.year, slot.month);
        return day === undefined ? [] : [{ item, day }];
      })
      .sort((a, b) => a.day - b.day)
  }));
  const undatedRows = upcomingRenewals(visible).filter((row) => !row.date);

  return (
    <section className="viz-block">
      <div className="calendar-controls">
        {filters.map((entry) => (
          <button
            key={entry.id}
            className={filter === entry.id ? "active" : ""}
            onClick={() => setFilter(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {months.map((slot) => (
        <div className="renewal-list" key={`${slot.year}-${slot.month}`}>
          <h3 className="renewal-month">
            {MONTH_NAMES[slot.month]} {slot.year}
          </h3>
          {slot.rows.map(({ item, day }) => (
            <button className="renewal-row" key={`${item.id}-${slot.month}`} onClick={() => onOpen(item.id)}>
              <div className="renewal-date">
                <span>{MONTHS[slot.month]}</span>
                <strong>{String(day).padStart(2, "0")}</strong>
              </div>
              <div className="renewal-body">
                <strong>{item.merchant}</strong>
                <span>{item.cadence === "annual" ? "Once a year" : "Same day every month"}</span>
                <em className={item.dateConfidence === "confirmed" ? "stamp confirmed" : "stamp estimated"}>
                  {item.dateConfidence === "confirmed" ? "date from the schedule" : "estimated, amount varies"}
                </em>
              </div>
              <b>
                {item.amountPattern === "variable" ? "about " : ""}
                {formatINR(item.amount)}
              </b>
            </button>
          ))}
          {slot.rows.length === 0 && <p className="renewal-empty">Nothing is due this month.</p>}
        </div>
      ))}

      {undatedRows.length > 0 && (
        <div className="undated">
          <strong>No confirmed next date</strong>
          <p>
            These arrive on uneven dates, so Paytrace does not place them on a calendar. They are still commitments and
            still counted in the year.
          </p>
          <div className="bucket-rows">
            {undatedRows.map(({ item }) => (
              <button key={item.id} onClick={() => onOpen(item.id)}>
                <span>{item.merchant}</span>
                <b>{formatINR(item.annualCost)}</b>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
