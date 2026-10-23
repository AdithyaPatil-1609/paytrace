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
export function RenewalCalendar({ items, onOpen }: { items: Commitment[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = upcomingRenewals(items.filter((item) => matches(item, filter)));
  const dated = rows.filter((row) => row.date);
  const undatedRows = rows.filter((row) => !row.date);

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

      <div className="renewal-list">
        {dated.map(({ item, date, confidence }) => {
          const when = new Date(Date.parse(date as string));
          return (
            <button className="renewal-row" key={item.id} onClick={() => onOpen(item.id)}>
              <div className="renewal-date">
                <span>{MONTHS[when.getUTCMonth()]}</span>
                <strong>{String(when.getUTCDate()).padStart(2, "0")}</strong>
              </div>
              <div className="renewal-body">
                <strong>{item.merchant}</strong>
                <span>
                  {when.getUTCFullYear()} · {item.cadence === "annual" ? "annual membership" : "next scheduled debit"}
                </span>
                <em className={confidence === "confirmed" ? "stamp confirmed" : "stamp estimated"}>
                  {confidence === "confirmed" ? "date from the schedule" : "estimated, amount varies"}
                </em>
              </div>
              <b>
                {item.amountPattern === "variable" ? "about " : ""}
                {formatINR(item.amount)}
              </b>
            </button>
          );
        })}
      </div>

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
