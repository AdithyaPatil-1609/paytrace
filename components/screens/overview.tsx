import type { Commitment } from "@/lib/types";
import { formatDate, formatINR } from "@/lib/format";

export function FindingCards({ items, onOpen }: { items: Commitment[]; onOpen: (id: string) => void }) {
  return <section className="finding-grid" aria-label="Payments to review">
    {items.length === 0 && <p>No payments need review in the available records.</p>}
    {items.map((item) => {
      const increased = item.signals.includes("silent_hike");
      const trial = item.signals.includes("trial_converted");
      return <article className="finding-card" key={item.id}>
        <p className="finding-label">{increased ? "PRICE INCREASE" : trial ? "TRIAL BECAME PAID" : "USAGE TO REVIEW"}</p>
        <h2>{increased ? `${item.merchant} increased from ${formatINR(item.previousAmount ?? 0)} to ${formatINR(item.amount)}` : trial ? `${item.merchant} now has paid charges` : `${item.merchant} keeps charging with little recorded use`}</h2>
        <p><strong>{formatINR(item.annualCost)} estimated over twelve months</strong></p>
        <p>{increased ? "We found a higher charge and no matching price-change notice in the supplied messages." : trial ? "A trial-ending notice was followed by a matching paid charge." : "Recorded usage suggests this service may deserve a review. Missing usage does not prove it is unwanted."}</p>
        <p>Review the charges, then decide whether to keep the payment or follow cancellation steps.</p>
        <button className="primary-button" onClick={() => onOpen(item.id)}>Review payment<span className="sr-only"> for {item.merchant}</span> →</button>
      </article>;
    })}
  </section>;
}

export function OverviewScreen({ items, issues, total, asOf, onOpen, onPayments, onSpending }: {
  items: Commitment[]; issues: Commitment[]; total: number; asOf: string;
  onOpen: (id: string) => void; onPayments: () => void; onSpending: () => void;
}) {
  return <>
    <header className="screen-header"><p>YOUR PAYMENT OVERVIEW</p><h1>Know what keeps charging you</h1>
      <div>Find recurring payments, spot unexpected charges, and learn how to stop them.</div></header>
    <p className="chart-note">Synthetic demo data · Records as of {formatDate(asOf)}. No bank account is connected.</p>
    <section className="money-summary overview-metrics" aria-label="Payment summary">
      <article><span>Recurring payments</span><strong>{items.length}</strong><button className="secondary-button" onClick={onPayments}>See all payments →</button></article>
      <article><span>Estimated yearly spending</span><strong>{formatINR(total)}</strong><p>If current payments continue; amounts and dates can vary.</p><button className="secondary-button" onClick={onSpending}>Explore spending →</button></article>
      <article><span>Payments needing review</span><strong>{issues.length}</strong><p>Review these findings before deciding what to change.</p></article>
    </section>
    <h2 className="viz-heading">Start with these payments</h2>
    <FindingCards items={issues} onOpen={onOpen} />
  </>;
}
