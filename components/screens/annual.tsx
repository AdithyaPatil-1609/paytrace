import { AnnualDashboard } from "@/components/visualizations/annual-dashboard";
import { PaymentCalendar } from "@/components/visualizations/payment-calendar";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function AnnualScreen({ items, total, leakage, stoppedValue, asOf, onOpen, onGoToSavings }: {
  items: Commitment[];
  total: number;
  leakage: number;
  stoppedValue: number;
  asOf: string;
  onOpen: (id: string) => void;
  onGoToSavings: () => void;
}) {
  return (
    <>
      <header className="screen-header">
        <p>YOUR MONEY AT A GLANCE</p>
        <h1>See where your money goes</h1>
        <div>See your regular payments for the next twelve months. All amounts are in Indian rupees (₹).</div>
      </header>
      <section className="money-summary" aria-label="Yearly spending and possible savings">
        <article>
          <span>Estimated spending</span>
          <strong>{formatINR(total)}</strong>
          <p>Over the next twelve months, if current payments continue.</p>
        </article>
        <article className="money-summary-savings">
          <span>Unused services cost</span>
          <strong>{formatINR(leakage)} <small>a year</small></strong>
          <p>Review these services to see what you could save.</p>
          <button className="primary-button" onClick={onGoToSavings}>Find ways to save →</button>
        </article>
      </section>
      {stoppedValue > 0 && (
        <p className="chart-note">Payments you marked as stopped have reduced this estimate by {formatINR(stoppedValue)} a year. This does not cancel a bank payment.</p>
      )}
      <AnnualDashboard items={items} asOf={asOf} onOpen={onOpen} />
      <details className="calendar-disclosure">
        <summary>See payment dates on a calendar</summary>
        <PaymentCalendar items={items} asOf={asOf} onOpen={onOpen} />
      </details>
    </>
  );
}
