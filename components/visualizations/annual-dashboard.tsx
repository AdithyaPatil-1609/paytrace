"use client";

import { useState } from "react";
import { groupByCategory, monthlyForecast, unusedTotal, yearlyTotal } from "@/lib/analysis";
import { spendGroupLabels } from "@/lib/engine";
import { formatCompactINR, formatINR } from "@/lib/format";
import type { Commitment, SpendGroup } from "@/lib/types";

/** Donut geometry: one ring, drawn as stroked arcs on a single circle. */
const RADIUS = 78;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const sliceColor: Record<SpendGroup, string> = {
  debt: "var(--ink-soft)",
  subscriptions: "var(--marigold)",
  utilities: "var(--plum)",
  insurance: "var(--sage)"
};

/* Bar chart frame. Generous left gutter so the money axis is readable. */
const BW = 760;
const BH = 300;
const BPAD = { top: 34, right: 16, bottom: 52, left: 62 };

export function AnnualDashboard({
  items,
  asOf,
  onOpen
}: {
  items: Commitment[];
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const [picked, setPicked] = useState<SpendGroup | null>(null);

  const slices = groupByCategory(items);
  const months = monthlyForecast(items, asOf);
  const year = yearlyTotal(items);
  const leak = unusedTotal(items);
  const monthlyAverage = Math.round(year / 12);
  const listed = picked ? items.filter((item) => item.spendGroup === picked) : [];

  let travelled = 0;

  // A rounded ceiling makes the gridline labels land on whole numbers.
  const peak = Math.max(...months.map((month) => month.total));
  const ceiling = Math.ceil(peak / 5000) * 5000;
  const plotW = BW - BPAD.left - BPAD.right;
  const plotH = BH - BPAD.top - BPAD.bottom;
  const slot = plotW / months.length;
  const barW = slot * 0.58;
  const yOf = (value: number) => BPAD.top + plotH - (value / ceiling) * plotH;
  const gridValues = [0, ceiling / 4, ceiling / 2, (ceiling * 3) / 4, ceiling];
  const tallest = months.reduce((best, month) => (month.total > best.total ? month : best), months[0]);

  return (
    <section className="viz-block">
      <div className="kpi-row">
        <Kpi label="Committed this year" value={formatINR(year)} lead />
        <Kpi label="Average month" value={formatINR(monthlyAverage)} />
        <Kpi label="Going to things unused" value={formatINR(leak)} alarm />
        <Kpi label="Active commitments" value={String(items.length)} />
      </div>

      <div className="viz-split">
        <figure className="donut-figure">
          <figcaption>Where the year goes</figcaption>
          <div className="donut-wrap">
            <svg viewBox="0 0 200 200" role="img" aria-label="Annual spending by category">
              <circle cx="100" cy="100" r={RADIUS} className="donut-track" />
              {slices.map((slice) => {
                const length = slice.share * CIRCUMFERENCE;
                const offset = travelled;
                travelled += length;
                const active = picked === slice.group;
                return (
                  <circle
                    key={slice.group}
                    cx="100"
                    cy="100"
                    r={RADIUS}
                    className={active ? "donut-slice active" : "donut-slice"}
                    stroke={sliceColor[slice.group]}
                    strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                    strokeDashoffset={-offset}
                    onClick={() => setPicked(active ? null : slice.group)}
                  />
                );
              })}
              <text x="100" y="96" className="donut-centre">
                {formatINR(year)}
              </text>
              <text x="100" y="114" className="donut-sub">
                per year
              </text>
            </svg>
          </div>

          <ul className="legend">
            {slices.map((slice) => (
              <li key={slice.group}>
                <button
                  className={picked === slice.group ? "active" : ""}
                  onClick={() => setPicked(picked === slice.group ? null : slice.group)}
                >
                  <i style={{ background: sliceColor[slice.group] }} />
                  <span>{spendGroupLabels[slice.group]}</span>
                  <b>{formatINR(slice.total)}</b>
                </button>
              </li>
            ))}
          </ul>
        </figure>

        <figure className="bars-figure">
          <figcaption>
            What leaves each month
            <span className="chart-key">
              <i className="key-solid" /> scheduled
              <i className="key-hatch" /> estimate
            </span>
          </figcaption>

          <svg viewBox={`0 0 ${BW} ${BH}`} className="forecast-chart" role="img" aria-label="Forecast debits by month">
            <defs>
              <pattern id="estimate-hatch" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill="var(--marigold-skin)" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--marigold)" strokeWidth="4" />
              </pattern>
            </defs>

            {gridValues.map((value) => (
              <g key={value}>
                <line x1={BPAD.left} x2={BW - BPAD.right} y1={yOf(value)} y2={yOf(value)} className="grid-line" />
                <text x={BPAD.left - 12} y={yOf(value) + 4} className="axis-label" textAnchor="end">
                  {value === 0 ? "0" : formatCompactINR(value)}
                </text>
              </g>
            ))}

            {/* what a typical month looks like, so a tall bar has a reference */}
            <line
              x1={BPAD.left}
              x2={BW - BPAD.right}
              y1={yOf(monthlyAverage)}
              y2={yOf(monthlyAverage)}
              className="average-line"
            />
            <text x={BW - BPAD.right} y={yOf(monthlyAverage) - 8} className="average-label" textAnchor="end">
              average month · {formatINR(monthlyAverage)}
            </text>

            {months.map((month, index) => {
              const x = BPAD.left + index * slot + (slot - barW) / 2;
              const top = yOf(month.total);
              const isTallest = month.key === tallest.key;
              return (
                <g key={month.key}>
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={Math.max(BPAD.top + plotH - top, 2)}
                    rx="3"
                    className={`forecast-bar${isTallest ? " peak" : ""}`}
                    fill={month.estimated ? "url(#estimate-hatch)" : "var(--marigold)"}
                  >
                    <title>{`${month.label}: ${formatINR(month.total)}${month.estimated ? " (estimate)" : ""}`}</title>
                  </rect>
                  <text x={x + barW / 2} y={top - 9} className="bar-value" textAnchor="middle">
                    {formatCompactINR(month.total)}
                  </text>
                  <text x={x + barW / 2} y={BH - 30} className="bar-month" textAnchor="middle">
                    {month.label}
                  </text>
                  {(index === 0 || month.label === "Jan") && (
                    <text x={x + barW / 2} y={BH - 14} className="bar-year" textAnchor="middle">
                      {month.key.slice(0, 4)}
                    </text>
                  )}
                </g>
              );
            })}

            <line
              x1={BPAD.left}
              x2={BW - BPAD.right}
              y1={BPAD.top + plotH}
              y2={BPAD.top + plotH}
              className="axis-line"
            />
          </svg>

          <p className="viz-note">
            Each month holds the debits actually due that month, not the year divided by twelve — which is why{" "}
            {tallest.label} stands out: an annual renewal lands on top of the usual monthly run. A hatched bar contains
            a varying amount or an uneven date. The twelve add to {formatINR(year)}.
          </p>
        </figure>
      </div>

      {picked && (
        <div className="slice-drill">
          <header>
            <strong>{spendGroupLabels[picked]}</strong>
            <button onClick={() => setPicked(null)}>Clear filter</button>
          </header>
          <div className="bucket-rows">
            {listed.map((item) => (
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

function Kpi({ label, value, lead = false, alarm = false }: { label: string; value: string; lead?: boolean; alarm?: boolean }) {
  return (
    <article className={`kpi${lead ? " lead" : ""}${alarm ? " alarm" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
