"use client";

import { useState } from "react";
import { nextMonthSchedule } from "@/lib/calendar";
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
  const schedule = nextMonthSchedule(visible, asOf);
  const months = [schedule];
  const undatedRows = schedule.undated.map(item => ({ item }));

  return (
    <section className="viz-block">
      <div className="calendar-controls">
        {filters.map((entry) => (
          <button
            key={entry.id}
            className={filter === entry.id ? "active" : ""}
            aria-pressed={filter === entry.id}
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
            <button className="renewal-row" key={`${item.id}-${slot.month}-${day}`} onClick={() => onOpen(item.id)}>
              <div className="renewal-date">
                <span>{MONTHS[slot.month]}</span>
                <strong>{String(day).padStart(2, "0")}</strong>
              </div>
              <div className="renewal-body">
                <strong>{item.merchant}</strong>
                <span>{item.cadence === "annual" ? "Once a year" : item.cadence === "weekly" ? "Weekly payment" : item.cadence === "quarterly" ? "Quarterly payment" : "Monthly payment"}</span>
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
