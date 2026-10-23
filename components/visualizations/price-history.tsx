"use client";

import { useState } from "react";
import { detectPriceHikes } from "@/lib/analysis";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

const W = 720;
const H = 230;
const PAD = { top: 20, right: 90, bottom: 34, left: 52 };

/**
 * A step chart of the actual dated debits, with the month the price changed
 * marked. Every point is a real statement line, so clicking one opens the
 * evidence behind it rather than a label.
 */
export function PriceHistory({ items, onOpen }: { items: Commitment[]; onOpen: (id: string) => void }) {
  const hikes = detectPriceHikes(items);
  const [pickedId, setPickedId] = useState<string | null>(hikes[0]?.item.id ?? null);
  const hike = hikes.find((entry) => entry.item.id === pickedId) ?? hikes[0];

  if (!hike) {
    return (
      <section className="viz-block">
        <p className="viz-empty">No price has stepped up in this fixture.</p>
      </section>
    );
  }

  const series = hike.item.priceSeries;
  const amounts = series.map((point) => point.amount);
  const low = Math.min(...amounts);
  const high = Math.max(...amounts);
  const floor = Math.max(0, low - Math.max(Math.round((high - low) * 0.8), 10));
  const ceiling = high + Math.max(Math.round((high - low) * 0.8), 10);

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (series.length === 1 ? plotW / 2 : (index / (series.length - 1)) * plotW);
  const y = (amount: number) => PAD.top + plotH - ((amount - floor) / (ceiling - floor)) * plotH;

  // A step path: hold the old price until the month it actually changed.
  const path = series
    .map((point, index) => {
      if (index === 0) return `M ${x(0)} ${y(point.amount)}`;
      return `L ${x(index)} ${y(series[index - 1].amount)} L ${x(index)} ${y(point.amount)}`;
    })
    .join(" ");

  const changeIndex = series.findIndex((point) => point.amount === hike.to);
  const ticks = [floor, Math.round((floor + ceiling) / 2), ceiling];

  return (
    <section className="viz-block">
      {hikes.length > 1 && (
        <div className="merchant-switch">
          {hikes.map((entry) => (
            <button
              key={entry.item.id}
              className={entry.item.id === hike.item.id ? "active" : ""}
              onClick={() => setPickedId(entry.item.id)}
            >
              {entry.item.merchant}
            </button>
          ))}
        </div>
      )}

      <figure className="price-figure">
        <figcaption>
          {hike.item.merchant} — every charge on the statement
          <em className={hike.noticed ? "badge noticed" : "badge silent"}>
            {hike.noticed ? "rise came with a notice" : "no notice found"}
          </em>
        </figcaption>

        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${hike.item.merchant} price history`}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="grid-line" />
              <text x={PAD.left - 10} y={y(tick) + 4} className="axis-label" textAnchor="end">
                ₹{tick}
              </text>
            </g>
          ))}

          {changeIndex > 0 && (
            <>
              <line x1={x(changeIndex)} x2={x(changeIndex)} y1={PAD.top} y2={PAD.top + plotH} className="change-line" />
              <text x={x(changeIndex) + 7} y={PAD.top + 12} className="change-label">
                price changed
              </text>
            </>
          )}

          <path d={path} className="price-path" />

          {series.map((point, index) => (
            <circle
              key={point.date}
              cx={x(index)}
              cy={y(point.amount)}
              r={index === changeIndex ? 6 : 4}
              className={index === changeIndex ? "price-dot change" : "price-dot"}
            >
              <title>{`${formatDate(point.date)} — ${formatINR(point.amount)}`}</title>
            </circle>
          ))}

          {series.map((point, index) =>
            index % 2 === 0 ? (
              <text key={`${point.date}-label`} x={x(index)} y={H - 12} className="axis-label" textAnchor="middle">
                {formatDate(point.date).slice(3, 6)}
              </text>
            ) : null
          )}

          <text x={W - PAD.right + 14} y={y(hike.to) + 4} className="delta-label">
            +{formatINR(hike.delta)}/mo
          </text>
        </svg>
      </figure>

      <div className="hike-facts">
        <article>
          <strong>
            {formatINR(hike.from)} → {formatINR(hike.to)}
          </strong>
          <span>
            {hike.percent}% more each month, from {formatDate(series[changeIndex]?.date)}.
          </span>
        </article>
        <article className="alarm">
          <strong>{formatINR(hike.annualExtra)}</strong>
          <span>Extra over a year if the new price holds.</span>
        </article>
        <article>
          <strong>{hike.item.notices.filter((notice) => notice.eventType === "price_change").length || "None"}</strong>
          <span>
            {hike.noticed
              ? "A price-change message was found."
              : "Price-change messages in the inbox. The debit messages arrived; the warning did not."}
          </span>
        </article>
      </div>

      <button className="viz-link" onClick={() => onOpen(hike.item.id)}>
        Open the {series.length} statement lines behind this
      </button>
    </section>
  );
}
