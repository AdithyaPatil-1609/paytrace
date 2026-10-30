/**
 * Screen 01 — All payments
 * The full book of recurring commitments before any judgement.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";
import { useState } from "react";

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  simulating,
  onSimulate,
  onReset,
  onOpen,
  asOf
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  simulating: boolean;
  /** Who decided the simulated rows: Cypher in a rolled-back transaction, or the fixture engine. */
  simulatedIn?: "neo4j" | "app";
  onSimulate: () => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  asOf: string;
}) {
  const [search, setSearch] = useState("");
  const visibleItems = items.filter((item) =>
    `${item.merchant} ${item.rawNarration}`.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <>
      <ScreenHeader
        number="1"
        eyebrow="YOUR PAYMENTS"
        title="All your regular payments"
        copy="Find a service below. Tap it to see its charges, messages and payment details."
      />
      <section className="year-banner">
        <div>
          <span>ESTIMATED SPENDING OVER TWELVE MONTHS</span>
          <strong>{formatINR(total)}</strong>
          {simulated && baseline !== total && (
            <p className="year-delta">
              <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> after one new autopay
            </p>
          )}
          <small>{items.length} regular payments found in the available records.</small>
        </div>
        <div className="year-note">
          <b>{simulated ? "Planned payment added" : "An estimate, not a bill"}</b>
          <p>
            {simulated
              ? "Headspace is included in this estimate. You can remove it at any time."
              : "This is what regular payments could cost over the next twelve months. Bills can change."}
          </p>
        </div>
      </section>

      <label className="payment-search">
        Find a payment
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a service name, like Netflix" />
      </label>
      <p className="chart-note" role="status">{visibleItems.length} {visibleItems.length === 1 ? "payment" : "payments"} shown</p>
      <section className="data-panel simple-payment-list">
        <div className="table-caption">
          <span>SERVICE</span>
          <span>EACH PAYMENT</span>
          <span>YEARLY ESTIMATE</span>
          <span>MESSAGES</span>
        </div>
        <div className="payment-rows">
          {visibleItems.map((item) => (
            <button
              className={["payment-row", item.signals.includes("new") ? "is-new" : ""].join(" ").trim()}
              data-row={item.id}
              key={item.id}
              onClick={() => onOpen(item.id)}
            >
              <span className="pay-plain">
                <strong>
                  {item.merchant}
                  {!item.inDictionary && <i className="unknown-tag">unknown</i>}
                </strong>
                <em>{item.product}</em>
              </span>
              <span className="pay-month">{monthlyCost(item)}</span>
              <b>{formatINR(item.annualCost)} / year</b>
              <small>{item.source} messages</small>
            </button>
          ))}
          {visibleItems.length === 0 && <p className="chart-note search-empty">No payments match “{search}”. Try another name or clear the search.</p>}
        </div>
      </section>
      <p className="chart-note">One-time purchases, transfers and income are not included. This list shows repeating payments.</p>

      <details className="calendar-disclosure">
        <summary>See upcoming payment dates</summary>
        <RenewalCalendar items={items} asOf={asOf} onOpen={onOpen} />
      </details>

      <section className="simulation-card">
        <div>
          <p>PLAN A PAYMENT</p>
          <h2>{simulated ? "Headspace is included in your plan" : "See the cost of a new payment"}</h2>
          <span>
            {simulated
              ? "A planned ₹299 monthly Headspace payment is included in your estimate. No charge has been set up."
              : "Include a ₹299 monthly Headspace payment in your spending plan. This only changes the estimate."}
          </span>
        </div>
        {simulated ? (
          <button className="secondary-button" onClick={onReset}>
            Remove planned payment
          </button>
        ) : (
          <button className="primary-button" onClick={onSimulate} disabled={simulating}>
            {simulating ? "Updating estimate…" : "Add to spending plan"} <i>→</i>
          </button>
        )}
      </section>
    </>
  );
}
