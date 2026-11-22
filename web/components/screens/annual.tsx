/**
 * Screen 04 — Annual
 * The next twelve months: totals, charts, five-way split.
 */
import { ScreenHeader } from "@/web/components/chrome/screen-header";
import { AnnualDashboard } from "@/web/components/visualizations/annual-dashboard";
import { PaymentCalendar } from "@/web/components/visualizations/payment-calendar";
import { splitByBucket } from "@/server/payments/analysis";
import { bucketCopy, bucketLabels } from "@/server/payments/engine";
import { formatINR } from "@/server/presentation/format";
import type { Commitment } from "@/server/payments/types";

export function AnnualScreen({
  items,
  total,
  leakage,
  debt,
  stoppedValue,
  asOf,
  onOpen,
  personal = false
}: {
  items: Commitment[];
  total: number;
  leakage: number;
  debt: number;
  stoppedValue: number;
  asOf: string;
  onOpen: (id: string) => void;
  personal?: boolean;
}) {
  const split = splitByBucket(items);
  const largest = Math.max(...split.map((group) => group.total), 1);

  return (
    <>
      <ScreenHeader
        number="4"
        eyebrow="THE YEAR"
        title="The next twelve months, on one screen"
        copy="See what your recurring payments could cost over the next twelve months."
        help="This is what your repeating payments cost in a year. Services you no longer use are money you could save. Bills, insurance and loans still have to be paid, so they are not savings. Amounts that change, like electricity, are our best guess."
      />
      <section className="annual-headline">
        <article className="annual-figure">
          <span>COMMITTED TO LEAVE</span>
          <strong>{formatINR(total)}</strong>
          <small>{personal ? "Over the next twelve months, based on the imported records." : "Over the next twelve months, across the savings account and the card."}</small>
        </article>
        <article className="annual-figure accent">
          <span>STILL DEBITING, NOT USED</span>
          <strong>{formatINR(leakage)}</strong>
          <small>The part of the year that a decision can remove.</small>
        </article>
        <article className="annual-figure muted">
          <span>{personal ? "LOAN REPAYMENTS" : "HOME-LOAN EMI"}</span>
          <strong>{formatINR(debt)}</strong>
          <small>Loan repayments must be managed with the lender.</small>
        </article>
      </section>

      {stoppedValue > 0 && (
        <p className="revoke-banner">
          A revoke confirmed on screen 3 has taken <strong>{formatINR(stoppedValue)}</strong> out of
          the year.
        </p>
      )}

      <AnnualDashboard items={items} asOf={asOf} onOpen={onOpen} />

      <h2 className="viz-heading">The month on the fridge door</h2>
      <PaymentCalendar items={items} asOf={asOf} onOpen={onOpen} />

      <h2 className="viz-heading">The same year, split by what to do about it</h2>
      <section className="bucket-list">
        {split.map((group) => (
          <article className="bucket-card" key={group.bucket} data-bucket={group.bucket}>
            <header>
              <div>
                <strong>{bucketLabels[group.bucket]}</strong>
                <span>{bucketCopy[group.bucket]}</span>
              </div>
              <b>{formatINR(group.total)}</b>
            </header>
            <div className="bucket-bar">
              <i style={{ width: `${Math.max((group.total / largest) * 100, 2)}%` }} />
            </div>
            <div className="bucket-rows">
              {group.rows.map((item) => (
                <button
                  className={item.signals.includes("new") ? "is-new" : ""}
                  key={item.id}
                  onClick={() => onOpen(item.id)}
                >
                  <span>{item.merchant}</span>
                  <b>{formatINR(item.annualCost)}</b>
                </button>
              ))}
              {group.rows.length === 0 && <p className="bucket-empty">Nothing in this group.</p>}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
