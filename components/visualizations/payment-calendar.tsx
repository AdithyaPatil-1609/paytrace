"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

type Due = { item: Commitment; day: number };

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Monday-first index of the 1st, so the grid lines up with a wall calendar. */
function leadingBlanks(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return (first + 6) % 7;
}

/**
 * Which commitments fall in this month, and on which day. A monthly debit
 * keeps the day it has always landed on. An annual one appears only in its
 * renewal month. An uneven transfer is never placed: it gets a note instead.
 */
function duesFor(items: Commitment[], year: number, month: number): Due[] {
  const length = daysInMonth(year, month);
  const dues: Due[] = [];

  for (const item of items) {
    if (item.cadence === "irregular") continue;

    if (item.cadence === "annual") {
      if (!item.nextCharge) continue;
      const when = new Date(Date.parse(item.nextCharge));
      if (when.getUTCFullYear() === year && when.getUTCMonth() === month) {
        dues.push({ item, day: when.getUTCDate() });
      }
      continue;
    }

    const anchor = new Date(Date.parse(item.lastCharge));
    if (item.cadence === "quarterly") {
      const gap = (year - anchor.getUTCFullYear()) * 12 + (month - anchor.getUTCMonth());
      if (gap <= 0 || gap % 3 !== 0) continue;
    }
    // A debit on the 31st lands on the last day of a shorter month.
    dues.push({ item, day: Math.min(anchor.getUTCDate(), length) });
  }

  return dues.sort((a, b) => a.day - b.day);
}

/**
 * The month on the fridge door. Every note is a debit that is going to leave,
 * written where it lands, so the month reads as a list of things about to
 * happen rather than a table of figures.
 */
export function PaymentCalendar({
  items,
  asOf,
  onOpen
}: {
  items: Commitment[];
  asOf: string;
  onOpen: (id: string) => void;
}) {
  const start = new Date(Date.parse(asOf));
  const [offset, setOffset] = useState(0);
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();

  const dues = duesFor(items, year, month);
  const undated = items.filter((item) => item.cadence === "irregular");
  const monthTotal = dues.reduce((sum, due) => sum + due.item.amount, 0);
  const blanks = leadingBlanks(year, month);
  const length = daysInMonth(year, month);

  return (
    <section className="viz-block">
      <div className="fridge">
        <header className="fridge-head">
          <div>
            <strong>
              {MONTH_NAMES[month]} {year}
            </strong>
            <span>
              {dues.length} debits · {formatINR(monthTotal)} leaves this month
            </span>
          </div>
          <div className="fridge-nav">
            <button onClick={() => setOffset(offset - 1)} aria-label="Previous month">
              ‹
            </button>
            <button onClick={() => setOffset(0)} disabled={offset === 0}>
              This month
            </button>
            <button onClick={() => setOffset(offset + 1)} aria-label="Next month">
              ›
            </button>
          </div>
        </header>

        <div className="fridge-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="fridge-grid">
          {Array.from({ length: blanks }).map((_, index) => (
            <div className="fridge-day empty" key={`blank-${index}`} />
          ))}

          {Array.from({ length }).map((_, index) => {
            const day = index + 1;
            const onThisDay = dues.filter((due) => due.day === day);
            return (
              <div className={onThisDay.length ? "fridge-day has-notes" : "fridge-day"} key={day}>
                <b>{day}</b>
                {onThisDay.map(({ item }) => (
                  <button
                    key={item.id}
                    className={`note note-${item.bucket}`}
                    onClick={() => onOpen(item.id)}
                    title={`${item.merchant} — ${formatINR(item.amount)}`}
                  >
                    <span>{item.merchant}</span>
                    <i>
                      {item.amountPattern === "variable" ? "~" : ""}
                      {formatINR(item.amount)}
                    </i>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {undated.length > 0 && (
          <p className="fridge-foot">
            Not pinned to a day: {undated.map((item) => item.merchant).join(", ")}. The transfers arrive on uneven
            dates, so there is no day to write them on. They are still counted in the year.
          </p>
        )}
      </div>
    </section>
  );
}
