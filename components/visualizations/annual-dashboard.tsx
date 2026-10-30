"use client";

import { useState } from "react";
import { monthlyForecast } from "@/lib/analysis";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

/** Visible amounts and native buttons make the chart usable without hover. */
export function AnnualDashboard({ items, asOf, onOpen }: {
  items: Commitment[];
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const [openedMonth, setOpenedMonth] = useState<string | null>(null);
  const months = monthlyForecast(items, asOf);
  const forecasts = items.map((item) => ({ item, months: monthlyForecast([item], asOf) }));
  const highest = Math.max(...months.map((month) => month.total), 1);

  return (
    <section className="simple-chart" aria-labelledby="monthly-spending-heading">
      <header className="simple-chart-heading">
        <p className="chart-eyebrow">SPENDING ESTIMATE</p>
        <h2 id="monthly-spending-heading">Estimated payments by month</h2>
        <p>Each bar shows the estimated total for that month. Tap a month to see the payments.</p>
      </header>
      <p className="chart-note">These are future estimates, not payments already made. Bills and payment dates can change.</p>
      <ul className="spending-bars">
        {months.map((month, index) => {
          const label = new Date(`${month.key}-01T00:00:00Z`).toLocaleDateString("en-IN", {
            month: "long", year: "numeric", timeZone: "UTC"
          });
          const expanded = openedMonth === month.key;
          const rows = forecasts.filter((entry) => entry.months[index].total > 0);
          const panelId = `spending-${month.key}`;
          return (
            <li key={month.key}>
              <button
                className="spending-bar-button"
                aria-label={`${label}, ${formatINR(month.total)} estimated. ${expanded ? "Hide" : "Show"} payments`}
                aria-expanded={expanded}
                aria-controls={expanded ? panelId : undefined}
                onClick={() => setOpenedMonth(expanded ? null : month.key)}
              >
                <span className="spending-month">{label}</span>
                <span className="simple-bar-track" aria-hidden="true">
                  <span className="simple-bar-fill" style={{ width: `${month.total / highest * 100}%` }} />
                </span>
                <strong>{formatINR(month.total)} <span aria-hidden="true">{expanded ? "−" : "+"}</span></strong>
              </button>
              {expanded && (
                <section className="month-payment-details" id={panelId} aria-label={`Estimated payments for ${label}`}>
                  <h3>{label}: estimated payments</h3>
                  <p>Tap a service to read its payment details.</p>
                  <ul>
                    {rows.map(({ item, months: itemMonths }) => (
                      <li key={item.id}>
                        <button onClick={() => onOpen(item.id)}>
                          <span>{item.merchant}{item.cadence === "annual" && <small>Yearly payment</small>}</span>
                          <strong>{formatINR(itemMonths[index].total)} <span aria-hidden="true">→</span></strong>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {rows.length === 0 && <p>No payments are estimated for this month.</p>}
                </section>
              )}
            </li>
          );
        })}
      </ul>
      <p className="chart-note">Some services charge once a year. Payments with uneven dates are spread into estimated months. Weekly payments are shown as a monthly budget.</p>
    </section>
  );
}
