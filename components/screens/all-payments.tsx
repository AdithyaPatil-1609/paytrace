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
import { simulatedStatements, simulatedNotices, simulationMerchant, simulatedPattern } from "@/data/simulation";
import { rejectedPriceNotices } from "@/lib/notice-evidence";

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  simulating,
  simulatedIn,
  simulationError,
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
  simulationError?: string;
  onSimulate: () => void;
  onReset: () => void;
  onOpen: (id: string) => void;
  asOf: string;
}) {
  const [search, setSearch] = useState("");
  const scenario = simulated ? items.find((item) => item.merchant === simulationMerchant) : undefined;
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
              <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> including the synthetic scenario
            </p>
          )}
          <small>{items.length} regular payments found in the available records.</small>
        </div>
        <div className="year-note">
          <b>{simulated ? "Demo scenario included" : "An estimate, not a bill"}</b>
          <p>
            {simulated
              ? "Lumen Notes is included in this estimate. Reset the demo to remove the scenario."
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
          <p>SYNTHETIC DEMO · A HARDER CASE</p>
          <h2>{simulated ? "What did PayTrace find?" : "Can an old notice hide a new price increase?"}</h2>
          <span>
            {simulated
              ? "Results below are calculated from the synthetic records. No payment has been created."
              : "Four differently described charges belong to Lumen Notes. The price rises from ₹99 to ₹129, but the only price notice concerns an older ₹99 price."}
          </span>
          <details><summary>See the synthetic inputs</summary>
            <ul>{simulatedStatements.map((row) => <li key={row.txnId}>{row.date} · {row.narration} · {formatINR(row.debit ?? 0)}</li>)}</ul>
            <p>Shared merchant pattern: {simulatedPattern.pattern}. The dictionary links these descriptions to one service; the account stays the same.</p>
            <p>Older notice · {simulatedNotices[0].sentOn}: {simulatedNotices[0].text}</p>
          </details>
          {simulationError && <p role="alert">{simulationError}</p>}
          {scenario && <div className="simulation-result" role="status">
            <p><strong>{scenario.merchant}: {scenario.debitCount} charges grouped into one recurring payment.</strong></p>
            <p>Price: {formatINR(scenario.previousAmount ?? 0)} → {formatINR(scenario.amount)} per month. Estimated yearly cost: {formatINR(scenario.annualCost)}.</p>
            {scenario.previousAmount !== undefined && <p>Increase: {formatINR(scenario.amount - scenario.previousAmount)} per month, or {formatINR((scenario.amount - scenario.previousAmount) * 12)} more per year if this monthly price continues.</p>}
            <p>{scenario.signals.includes("silent_hike") ? "Price increase flagged: no matching notice was found in the supplied messages." : "No unannounced price increase was detected."}</p>
            {rejectedPriceNotices(scenario).map(({ notice, reasons }) => <p key={notice.noticeId}>Notice from {notice.sentOn} excluded: {reasons.join("; ")}.</p>)}
            <p>{simulatedIn === "neo4j" ? "Calculated in Neo4j; the transaction rolled back and the stored graph is unchanged." : "Calculated by the offline engine; no graph was changed."}</p>
            <button className="primary-button" onClick={() => onOpen(scenario.id)}>Review Lumen Notes evidence →</button>
          </div>}
        </div>
        {simulated ? (
          <button className="secondary-button" onClick={onReset}>
            Reset demo scenario
          </button>
        ) : (
          <button className="primary-button" onClick={onSimulate} disabled={simulating}>
            {simulating ? "Checking the evidence…" : "Run difficult scenario"} <i>→</i>
          </button>
        )}
      </section>
    </>
  );
}
