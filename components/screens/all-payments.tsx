/**
 * Screen 01 — All payments
 * The full book of recurring commitments before any judgement: a headline
 * with the live radar beside it, then the evidence log of every payment.
 */
import { useState } from "react";
import { WarningTag } from "@/components/chrome/warning-tag";
import { issueItems } from "@/lib/payments/analysis";
import { ChargeSparkline } from "@/components/visualizations/charge-sparkline";
import { PaymentRadar } from "@/components/visualizations/payment-radar";
import { RenewalCalendar } from "@/components/visualizations/renewal-calendar";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

const CADENCE: Record<Commitment["cadence"], string> = {
  weekly: "WEEKLY",
  monthly: "MONTHLY",
  quarterly: "QUARTERLY",
  annual: "ONCE A YEAR",
  irregular: "UNEVEN DATES"
};

const HELP =
  "Variable bills and payments with uneven dates still belong here. Open a payment to inspect the statement records and messages that explain why it was included. The next-month section shows the dates supported by these records.";

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  kept = [],
  onOpen,
  asOf
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  /** Payments the person chose to keep: their warning is settled everywhere. */
  kept?: string[];
  onOpen: (id: string) => void;
  asOf: string;
}) {
  // The same test the Issues screen uses, so both screens always agree.
  const flagged = new Set(issueItems(items, kept).map((item) => item.id));
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  return (
    <>
      <section className="hero">
        <header className="hero-copy">
          <div className="hero-meta">
            <p>
              <span>SCREEN 1</span> · ALL OF THEM
            </p>
            <span className="hero-status">
              <i aria-hidden="true" />
              {items.reduce((sum, item) => sum + item.evidenceRows.length, 0)} DEBITS READ
            </span>
          </div>
          <h1>
            {items.length} payments leave on their own.{" "}
            {flagged.size ? (
              <span className="hero-mark">
                {flagged.size} {flagged.size === 1 ? "needs" : "need"} a look.
                <svg viewBox="0 0 300 14" preserveAspectRatio="none" aria-hidden="true">
                  <path pathLength={1} d="M3 9.5C58 4.5 129 3 196 5.5c38 1.4 70 3.4 101 6" />
                </svg>
              </span>
            ) : (
              "Nothing needs a look."
            )}
          </h1>
          <div className="hero-foot">
            <p className="hero-lede">
              See every recurring payment, its original bank description and its yearly estimate.
            </p>
            <div className="hero-figure">
              <span>COMMITTED YEARLY</span>
              <strong>{formatINR(total)}</strong>
              {simulated && baseline !== total ? (
                <p className="year-delta">
                  <s>{formatINR(baseline)}</s> → <b>{formatINR(total)}</b> after one new autopay
                </p>
              ) : (
                <small>{items.length} commitments from statement lines and messages.</small>
              )}
            </div>
          </div>
          <p className="hero-note">
            {simulated
              ? "New autopay is included. Headspace was detected from one statement line and one live mandate. It is not an issue."
              : "The current Spotify price is shown here. Price history belongs on the issues screen."}
          </p>
          <details className="screen-reading-help">
            <summary>How to read this</summary>
            <p>{HELP}</p>
          </details>
        </header>
        <PaymentRadar items={items} flagged={flagged} onOpen={onOpen} />
      </section>

      <section className="evidence-log">
        <div className="log-head">
          <div>
            <span>EVIDENCE LOG / {items.length} TOTAL</span>
            <h2>Every autopay we found</h2>
          </div>
          <div className="log-filter" role="group" aria-label="Show payments">
            <button type="button" aria-pressed={!onlyFlagged} onClick={() => setOnlyFlagged(false)}>
              All
            </button>
            <button type="button" aria-pressed={onlyFlagged} onClick={() => setOnlyFlagged(true)}>
              Needs a look · {flagged.size}
            </button>
          </div>
        </div>
        <div className="payment-rows">
          {items
            .filter((item) => !onlyFlagged || flagged.has(item.id))
            .map((item, index) => (
              <button
                className={[
                  "payment-row",
                  item.signals.includes("new") ? "is-new" : "",
                  flagged.has(item.id) ? "is-flagged" : ""
                ]
                  .join(" ")
                  .trim()}
                data-row={item.id}
                key={item.id}
                onClick={() => onOpen(item.id)}
              >
                <span className="row-index">{String(index + 1).padStart(2, "0")}</span>
                <span className="pay-plain">
                  <strong>
                    {item.merchant}
                    {!item.inDictionary && <i className="unknown-tag">unknown</i>}
                    {flagged.has(item.id) && <WarningTag kind={item.kind} />}
                  </strong>
                  <code className="raw-narration">
                    <span>STATEMENT SAYS:</span> {item.rawNarration}
                  </code>
                  <em>{item.plainDescription}</em>
                </span>
                <ChargeSparkline rows={item.evidenceRows} flagged={flagged.has(item.id)} />
                <span className="pay-amount">
                  <b>
                    {item.amountPattern === "variable" ? "about " : ""}
                    {formatINR(item.amount)}
                  </b>
                  <small>
                    {CADENCE[item.cadence]} · {formatINR(item.annualCost)} / YR · {item.source}
                  </small>
                </span>
                <span className="row-go" aria-hidden="true">
                  →
                </span>
              </button>
            ))}
        </div>
      </section>
      <p className="exclusion-note">
        <strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary
        credits, the credit-card repayment, and YouTube&apos;s ₹1 authorisation. One-off debits have
        no second debit or active mandate; credits, card repayments, and authorisation holds are
        excluded separately. Open any row above to see the rule that kept it.
      </p>

      <h2 className="viz-heading">Next month’s payments</h2>
      <RenewalCalendar items={items} asOf={asOf} flagged={flagged} onOpen={onOpen} />
    </>
  );
}
