/**
 * Screen 02 — Issues
 * Silent hikes, trial conversions, unused plans — only what deserves attention.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { PriceHistory } from "@/components/visualizations/price-history";
import { UnusedSavings } from "@/components/visualizations/unused-savings";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function IssuesScreen({
  items,
  allItems,
  total,
  leakage,
  keptLeak = 0,
  hike,
  onOpen,
  onGoToCancel
}: {
  items: Commitment[];
  allItems: Commitment[];
  total: number;
  leakage: number;
  /** Part of the leak sitting on rows the person chose to keep. */
  keptLeak?: number;
  hike: number;
  onOpen: (id: string) => void;
  onGoToCancel: () => void;
}) {
  return (
    <>
      <ScreenHeader
        number="2"
        eyebrow="SAVE MONEY"
        title="Pay for what you use"
        copy="See what you could save by stopping unused services. Choosing a service here does not cancel it."
      />
      <UnusedSavings items={allItems} onOpen={onOpen} onGoToCancel={onGoToCancel} />
      <details className="review-disclosure">
        <summary>See payments that changed or need a review ({items.length})</summary>
        <section className="issue-metrics">
          <Metric value={formatINR(total)} label="Estimated cost of all regular payments over the next 12 months." />
          <Metric
            value={formatINR(leakage)}
            label={
              keptLeak > 0
                ? `Estimated cost of services not used recently. ${formatINR(keptLeak)} is for services you chose to keep.`
                : "Estimated cost of services not used recently."
            }
            accent
          />
          <Metric value={formatINR(hike)} label="Extra yearly cost from Spotify's price increase: ₹119 became ₹139 with no price-change message." accent />
        </section>
        <section className="issues-table">
          <div className="issue-caption">
            <span>PLAIN NAME</span>
            <span>WHAT IS WRONG</span>
            <span>MONTH</span>
            <span>THIS YEAR</span>
            <span>MESSAGE</span>
          </div>
          {items.map((item) => (
            <button className="issue-row" data-row={item.id} key={item.id} onClick={() => onOpen(item.id)}>
              <strong>{item.merchant}</strong>
              <p>{item.issue}</p>
              <span>{monthlyCost(item)}</span>
              <b>{formatINR(item.annualCost)}</b>
              <small>{item.source}</small>
            </button>
          ))}
        </section>
        <h2 className="viz-heading">Price change to review</h2>
        <PriceHistory items={allItems} onOpen={onOpen} />

        <p className="screen-footnote">
          Not on this page: Netflix, Google One, Prime, JioHotstar, insurance, electricity, society, and the loan.
          {allItems.some((item) => item.signals.includes("new")) &&
            ` ${allItems
              .filter((item) => item.signals.includes("new"))
              .map((item) => item.merchant)
              .join(", ")} was just detected. Nothing is wrong with it, so it is not listed here. `}
          Electricity&apos;s changing amount and society&apos;s uneven dates are discovery signals, not waste.
        </p>
      </details>
    </>
  );
}

function Metric({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <article className={accent ? "issue-metric accent" : "issue-metric"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}
