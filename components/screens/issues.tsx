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
        eyebrow="CHANGES, ISSUES, UNUSED"
        title="Only what deserves your attention"
        copy="The list screen is the whole book. This page is the part that should change what she does. The full year stays visible so flags are not mistaken for her entire financial life."
      />
      <section className="issue-metrics">
        <Metric value={formatINR(total)} label="Everything on the list screen, this year." />
        <Metric
          value={formatINR(leakage)}
          label={
            keptLeak > 0
              ? `Still leaving for things she does not use. ${formatINR(keptLeak)} of it is on rows she chose to keep, so it is accepted, not stopped.`
              : "Still leaving for the gym, Canva, FitApp, and the caller tune."
          }
          accent
        />
        <Metric value={formatINR(hike)} label="Spotify's silent hike. ₹119 became ₹139, with no price message." accent />
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
      <h2 className="viz-heading">The price that moved</h2>
      <PriceHistory items={allItems} onOpen={onOpen} />

      <h2 className="viz-heading">What stopping them would be worth</h2>
      <UnusedSavings items={allItems} onOpen={onOpen} onGoToCancel={onGoToCancel} />

      <p className="screen-footnote">
        Not on this page: Netflix, Google One, Prime, JioHotstar, insurance, electricity, society, and the loan.
        {allItems.some((item) => item.signals.includes("new")) &&
          ` ${allItems
            .filter((item) => item.signals.includes("new"))
            .map((item) => item.merchant)
            .join(", ")} was just detected. Nothing is wrong with it, so it is not listed here. `}
        Electricity&apos;s changing amount and society&apos;s uneven dates are discovery signals, not waste.
      </p>
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
