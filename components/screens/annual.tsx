/**
 * Screen 04 — Annual
 * The next twelve months: totals, Neo4j proof, charts, five-way split.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { SourcePanel } from "@/components/chrome/source-panel";
import { AnnualDashboard } from "@/components/visualizations/annual-dashboard";
import { PaymentCalendar } from "@/components/visualizations/payment-calendar";
import type { SourceInfo } from "@/db/neo4j/dataset";
import { splitByBucket } from "@/lib/analysis";
import { bucketCopy, bucketLabels } from "@/lib/engine";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function AnnualScreen({
  items,
  total,
  leakage,
  debt,
  stoppedValue,
  asOf,
  source,
  detected,
  onOpen
}: {
  items: Commitment[];
  total: number;
  leakage: number;
  debt: number;
  stoppedValue: number;
  asOf: string;
  source: SourceInfo;
  detected: number;
  onOpen: (id: string) => void;
}) {
  const split = splitByBucket(items);
  const largest = Math.max(...split.map((group) => group.total), 1);

  return (
    <>
      <ScreenHeader
        number="4"
        eyebrow="THE YEAR"
        title="The next twelve months, on one screen"
        copy="Every commitment projected forward and split five ways. The unused part is the money that should move. The loan sits apart from both: it is a debt, not a subscription."
      />
      <section className="annual-headline">
        <article className="annual-figure">
          <span>COMMITTED TO LEAVE</span>
          <strong>{formatINR(total)}</strong>
          <small>Over the next twelve months, across the savings account and the card.</small>
        </article>
        <article className="annual-figure accent">
          <span>STILL DEBITING, NOT USED</span>
          <strong>{formatINR(leakage)}</strong>
          <small>The part of the year that a decision can remove.</small>
        </article>
        <article className="annual-figure muted">
          <span>HOME-LOAN EMI</span>
          <strong>{formatINR(debt)}</strong>
          <small>This prototype has no cancel button for it.</small>
        </article>
      </section>

      {stoppedValue > 0 && (
        <p className="revoke-banner">
          A revoke confirmed on screen 3 has taken <strong>{formatINR(stoppedValue)}</strong> out of the year.
        </p>
      )}

      <SourcePanel source={source} detected={detected} />

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
