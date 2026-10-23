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

/* Chart frame. Room at the bottom for the month and what lands on it. */
const BW = 780;
const BH = 320;
const BPAD = { top: 40, right: 18, bottom: 70, left: 66 };

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

  // The base run is identical every month, so one line explains the whole floor.
  const base = months[0]?.base ?? 0;
  const peak = Math.max(...months.map((month) => month.total));
  const ceiling = Math.ceil(peak / 5000) * 5000;
  const plotW = BW - BPAD.left - BPAD.right;
  const plotH = BH - BPAD.top - BPAD.bottom;
  const slot = plotW / months.length;
  const barW = slot * 0.56;
  const yOf = (value: number) => BPAD.top + plotH - (value / ceiling) * plotH;
  const gridValues = [0, ceiling / 2, ceiling];
  const extras = months.filter((month) => month.segments.length > 0);

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
              <i className="key-base" /> the usual run
              <i className="key-extra" /> something extra
            </span>
          </figcaption>

          <svg viewBox={`0 0 ${BW} ${BH}`} className="forecast-chart" role="img" aria-label="Forecast debits by month">
            <defs>
              <pattern id="estimate-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="6" height="6" fill="var(--plum)" />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--paper-lift)" strokeWidth="2.4" />
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

            {months.map((month, index) => {
              const x = BPAD.left + index * slot + (slot - barW) / 2;
              const baseTop = yOf(month.base);
              let stackTop = baseTop;

              return (
                <g key={month.key}>
                  <rect x={x} y={baseTop} width={barW} height={BPAD.top + plotH - baseTop} rx="2" className="seg-base">
                    <title>{`${month.label}: ${formatINR(month.total)} — the usual ${formatINR(month.base)}${
                      month.segments.length ? `, plus ${month.segments.map((s) => `${s.label} ${formatINR(s.amount)}`).join(", ")}` : ""
                    }`}</title>
                  </rect>

                  {month.segments.map((segment) => {
                    const height = (segment.amount / ceiling) * plotH;
                    stackTop -= height;
                    return (
                      <rect
                        key={segment.label}
                        x={x}
                        y={stackTop}
                        width={barW}
                        height={Math.max(height, 2)}
                        rx="2"
                        className="seg-extra"
                        fill={segment.kind === "irregular" ? "url(#estimate-hatch)" : "var(--plum)"}
                      >
                        <title>{`${segment.label}: ${formatINR(segment.amount)}${
                          segment.kind === "irregular" ? " — date estimated" : ""
                        }`}</title>
                      </rect>
                    );
                  })}

                  <text x={x + barW / 2} y={stackTop - 10} className="bar-value" textAnchor="middle">
                    {formatCompactINR(month.total)}
                  </text>
                  <text x={x + barW / 2} y={BH - 44} className="bar-month" textAnchor="middle">
                    {month.label}
                  </text>
                  {month.segments.map((segment, position) => (
                    <text
                      key={segment.label}
                      x={x + barW / 2}
                      y={BH - 30 + position * 12}
                      className="bar-extra"
                      textAnchor="middle"
                    >
                      + {segment.label}
                    </text>
                  ))}
                </g>
              );
            })}

            {/* the floor: what leaves in a month with nothing extra on it */}
            <line x1={BPAD.left} x2={BW - BPAD.right} y1={yOf(base)} y2={yOf(base)} className="base-line" />
            <text x={BPAD.left + 6} y={yOf(base) - 9} className="base-label">
              every month · {formatINR(base)}
            </text>

            <line
              x1={BPAD.left}
              x2={BW - BPAD.right}
              y1={BPAD.top + plotH}
              y2={BPAD.top + plotH}
              className="axis-line"
            />
          </svg>

          <p className="viz-note">
            The solid block is the run that leaves every single month — {formatINR(base)}, the same each time. Only the
            darker caps on top differ:{" "}
            {extras
              .slice(0, 3)
              .map((month) => `${month.label} carries ${month.segments.map((segment) => segment.label).join(" and ")}`)
              .join(", ")}
            . Electricity sits in the base at its median, since the bill itself varies. The twelve months add to{" "}
            {formatINR(year)}.
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
