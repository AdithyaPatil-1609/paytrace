/**
 * The payment radar on the All payments screen: a strip of the next 30 days
 * with one dot on the day each payment is due. Dots that need a look are
 * danger red; the rest are navy. Every dot is a button that opens that
 * payment, so the radar is a way in, not decoration. Only payments with a
 * known next date are placed; the app never invents a date.
 */
import type { CSSProperties } from "react";
import { warningLabel } from "@/components/chrome/warning-tag";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

const WINDOW_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;
/** Dots closer than this many days share a column and stack upwards. */
const CROWDED_DAYS = 1.6;

function shortDate(time: number) {
  return new Date(time).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Dot = { item: Commitment; flagged: boolean; day: number; lane: number; time: number };

function placeDots(items: Commitment[], flagged: Set<string>, start: number): Dot[] {
  const dots = items
    .filter((item) => item.nextCharge)
    .map((item) => {
      const time = Date.parse(item.nextCharge as string);
      return { item, flagged: flagged.has(item.id), day: (time - start) / DAY, lane: 0, time };
    })
    .filter((dot) => dot.day >= 0 && dot.day <= WINDOW_DAYS)
    .sort((a, b) => a.day - b.day || Number(b.flagged) - Number(a.flagged));
  dots.forEach((dot, index) => {
    const near = dots.slice(0, index).filter((other) => dot.day - other.day < CROWDED_DAYS);
    dot.lane = Math.min(near.length ? Math.max(...near.map((other) => other.lane)) + 1 : 0, 3);
  });
  return dots;
}

export function PaymentRadar({
  items,
  flagged,
  asOf,
  onOpen
}: {
  items: Commitment[];
  flagged: Set<string>;
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const start = Date.parse(asOf);
  const dots = placeDots(items, flagged, start);
  const ticks = [0, 7, 14, 21, 28].map((day) => ({ day, label: day === 0 ? "Today" : shortDate(start + day * DAY) }));

  return (
    <figure className="pay-radar" aria-label={`Payment radar: ${dots.length} payments due in the next ${WINDOW_DAYS} days`}>
      <header className="pay-radar-head">
        <p>
          <strong>Live payment radar</strong> recurring debits due in the next {WINDOW_DAYS} days
        </p>
        <span className="pay-radar-key">
          <i className="key-flagged" aria-hidden="true" /> needs a look
          <i className="key-other" aria-hidden="true" /> upcoming recurring
        </span>
      </header>

      <div className="pay-radar-track">
        <div className="pay-radar-line" aria-hidden="true" />
        {ticks.map((tick) => (
          <span key={tick.day} className="pay-radar-tick" style={{ "--x": `${(tick.day / WINDOW_DAYS) * 100}%` } as CSSProperties}>
            {tick.label}
          </span>
        ))}
        {dots.map((dot) => {
          const warning = dot.flagged ? warningLabel(dot.item.kind) : undefined;
          const label = `${dot.item.merchant} · ${formatINR(dot.item.amount)} · ${shortDate(dot.time)}${warning ? ` · ${warning}` : ""}`;
          const size = dot.item.amount >= 5000 ? "lg" : dot.item.amount >= 1000 ? "md" : "sm";
          return (
            <button
              key={dot.item.id}
              type="button"
              className={`pay-radar-dot size-${size}${dot.flagged ? " is-flagged" : ""}${dot.day > WINDOW_DAYS * 0.8 ? " opens-left" : ""}`}
              style={{ "--x": `${(dot.day / WINDOW_DAYS) * 100}%`, "--lane": dot.lane } as CSSProperties}
              aria-label={`${label}. Open details.`}
              data-label={label}
              onClick={() => onOpen(dot.item.id)}
            >
              <i aria-hidden="true" />
            </button>
          );
        })}
      </div>

    </figure>
  );
}
