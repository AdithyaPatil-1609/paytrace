"use client";

import { useState } from "react";
import { monthSchedule } from "@/lib/payments/calendar";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

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
  // Opens on next month; every month of that year, January to December, is one click away.
  const snapshot = new Date(asOf);
  const opening = new Date(Date.UTC(snapshot.getUTCFullYear(), snapshot.getUTCMonth() + 1, 1));
  const year = opening.getUTCFullYear();
  const [month, setMonth] = useState(opening.getUTCMonth());
  const [picking, setPicking] = useState(false);
  const { rows: dues, undated, blanks, length } = monthSchedule(items, asOf, year, month);
  const monthTotal = dues.reduce((sum, due) => sum + due.amount, 0);
  const asOfMonth = snapshot.getUTCFullYear() === year ? snapshot.getUTCMonth() : snapshot.getUTCFullYear() < year ? -1 : 12;
  const verb = month < asOfMonth ? "left" : month === asOfMonth ? "leaves" : "will leave";

  return (
    <section className="viz-block">
      <div className="fridge">
        <header className="fridge-head">
          <div>
            <button type="button" className="fridge-title" aria-expanded={picking} onClick={() => setPicking(value => !value)}>
              {MONTH_NAMES[month]} {year} <span aria-hidden="true">▾</span>
            </button>
            <span>
              {dues.length} {dues.length === 1 ? "debit" : "debits"} · {formatINR(monthTotal)} {verb} this month
            </span>
          </div>
          <div className="fridge-arrows">
            <button type="button" aria-label="Previous month" disabled={month === 0} onClick={() => { setMonth(month - 1); setPicking(false); }}>‹</button>
            <button type="button" aria-label="Next month" disabled={month === 11} onClick={() => { setMonth(month + 1); setPicking(false); }}>›</button>
          </div>
          {picking && (
            <div className="fridge-picker" role="listbox" aria-label={`Pick a month of ${year}`}>
              {MONTH_NAMES.map((name, index) => (
                <button key={name} type="button" role="option" aria-selected={index === month} className={index === month ? "on" : undefined} onClick={() => { setMonth(index); setPicking(false); }}>
                  {name.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
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
                {onThisDay.map(({ item, amount, paid }) => (
                  <button
                    key={`${item.id}-${paid ? "paid" : "due"}`}
                    className={`note note-${item.bucket} note-kind-${item.kind}${paid ? " note-paid" : ""}`}
                    onClick={() => onOpen(item.id)}
                    title={`${item.merchant} — ${formatINR(amount)}${paid ? " (paid)" : " (expected)"}`}
                  >
                    <span>{item.merchant}</span>
                    <i>
                      {!paid && item.amountPattern === "variable" ? "~" : ""}
                      {formatINR(amount)}
                      {paid ? " · paid" : ""}
                    </i>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {undated.length > 0 && (
          <p className="fridge-foot">
            Not pinned to a day: {undated.map((item) => item.merchant).join(", ")}. The transfers
            arrive on uneven dates, so there is no day to write them on. They are still counted in
            the year.
          </p>
        )}
      </div>
    </section>
  );
}
