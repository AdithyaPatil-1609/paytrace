"use client";

import { useState } from "react";
import { groupByCategory, monthlyForecast, unusedTotal, yearlyTotal } from "@/lib/analysis";
import { spendGroupLabels } from "@/lib/engine";
import { formatINR } from "@/lib/format";
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
  const tallest = Math.max(...months.map((month) => month.total), 1);
  const listed = picked ? items.filter((item) => item.spendGroup === picked) : [];

  let travelled = 0;

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
          <figcaption>What leaves each month, next twelve</figcaption>
          <div className="month-bars">
            {months.map((month) => (
              <div className="month-bar" key={month.key}>
                <div className="month-track">
                  <i
                    className={month.estimated ? "estimated" : ""}
                    style={{ height: `${Math.max((month.total / tallest) * 100, 2)}%` }}
                    title={`${month.label}: ${formatINR(month.total)}${month.estimated ? " (estimate)" : ""}`}
                  />
                </div>
                <span>{month.label}</span>
              </div>
            ))}
          </div>
          <p className="viz-note">
            Built from each commitment&apos;s own rhythm, not the year divided by twelve. A hatched bar contains a
            varying amount or an uneven date, so it is an estimate. The twelve months add to the same{" "}
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
