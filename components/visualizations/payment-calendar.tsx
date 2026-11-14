"use client";

import { motion, useReducedMotion } from "framer-motion";
import { nextMonthSchedule } from "@/lib/payments/calendar";
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
  const reduceMotion = useReducedMotion();
  const { year, month, rows: dues, undated, blanks, length } = nextMonthSchedule(items, asOf);
  const monthTotal = dues.reduce((sum, due) => sum + due.item.amount, 0);

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
                {onThisDay.map(({ item }, noteIndex) => {
                  const tilt = noteIndex % 2 === 0 ? -0.6 : 0.7;
                  return (
                    <motion.button
                      key={item.id}
                      className={`note note-${item.bucket}`}
                      initial={reduceMotion ? false : { opacity: 0, scale: 0.8, rotate: tilt }}
                      animate={{ opacity: 1, scale: 1, rotate: tilt }}
                      transition={reduceMotion ? { duration: 0 } : {
                        type: "spring", stiffness: 440, damping: 24,
                        delay: Math.min(index * 0.05 + noteIndex * 0.03, 0.7)
                      }}
                      whileHover={reduceMotion ? undefined : { scale: 1.05, rotate: 0 }}
                      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
                      onClick={() => onOpen(item.id)}
                      title={`${item.merchant} — ${formatINR(item.amount)}`}
                    >
                      <span>{item.merchant}</span>
                      <i>
                        {item.amountPattern === "variable" ? "~" : ""}
                        {formatINR(item.amount)}
                      </i>
                    </motion.button>
                  );
                })}
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
