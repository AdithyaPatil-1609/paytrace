/**
 * Screen 01 — All payments
 * Three parts side by side: the yearly total and the radar of what is due
 * next, the table of every payment, and a docked panel on the right with the
 * selected payment's price history and evidence path. On narrow screens the
 * panel is hidden and a row opens the full drawer instead.
 */
import { useState } from "react";
import { warningLabel } from "@/components/chrome/warning-tag";
import { PriceHistory, ProofChain } from "@/components/detail/price-and-proof";
import { issueItems } from "@/lib/payments/analysis";
import { ChargeSparkline } from "@/components/visualizations/charge-sparkline";
import { PaymentRadar } from "@/components/visualizations/payment-radar";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment, Mechanism } from "@/lib/payments/types";

const RAIL: Record<Mechanism, string | null> = {
  upi_autopay: "UPI Autopay",
  card_recurring: "SI-Card",
  play_store: "App store",
  enach: "eNACH",
  bbps: "BBPS bill",
  neft_standing: "Standing order",
  vas: "Operator pack",
  emi_ach: "Loan EMI",
  none: null
};

const PER: Record<Commitment["cadence"], string> = {
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
  annual: "/yr",
  irregular: " each time"
};

/** The docked panel shows only when the window is wide enough for three columns. */
const DOCKED = "(min-width: 1200px)";

/** The rise from the previous charge, in whole percent, when the price went up. */
export function priceRise(item: Commitment) {
  if (!item.previousAmount || item.amount <= item.previousAmount) return undefined;
  return Math.round(((item.amount - item.previousAmount) / item.previousAmount) * 100);
}

export function AllPaymentsScreen({
  items,
  total,
  baseline,
  simulated,
  kept = [],
  onOpen,
  asOf,
  live = false,
  personal = false
}: {
  items: Commitment[];
  total: number;
  baseline: number;
  simulated: boolean;
  /** Payments the person chose to keep: their warning is settled everywhere. */
  kept?: string[];
  onOpen: (id: string) => void;
  asOf: string;
  /** The records come from Neo4j, so the evidence path can say so. */
  live?: boolean;
  personal?: boolean;
}) {
  // The same test the Issues screen uses, so both screens always agree.
  const flagged = new Set(issueItems(items, kept).map((item) => item.id));
  // Start on the first price rise, so the panel opens on something worth seeing.
  const firstPick = items.find((item) => priceRise(item) !== undefined) ?? items[0];
  const [selectedId, setSelectedId] = useState<string | null>(firstPick?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? firstPick ?? null;

  function pick(id: string) {
    if (window.matchMedia(DOCKED).matches) setSelectedId(id);
    else onOpen(id);
  }

  return (
    <div className={`ledger-split${selected ? " has-panel" : ""}`}>
      <div className="ledger-screen">
        <header className="ledger-hero">
          <h1>Every periodic payment, on one page</h1>
          <p className="ledger-total">
            <strong>{formatINR(total)}</strong> across {items.length} repeating{" "}
            {items.length === 1 ? "payment" : "payments"}
            {simulated && baseline !== total && (
              <small>
                {" "}
                (was <s>{formatINR(baseline)}</s>)
              </small>
            )}
          </p>
        </header>

        <PaymentRadar items={items} flagged={flagged} asOf={asOf} onOpen={pick} />

        <section className="ledger-table" aria-label="Every repeating payment">
          <div className="ledger-head" aria-hidden="true">
            <span>Merchant &amp; Raw Bank Text</span>
            <span>Payment Rail Tags</span>
            <span>Inline Mini Sparklines</span>
            <span>Indian Rupee Amounts</span>
          </div>

          {personal && items.length === 0 && (
            <p className="personal-empty">
              No recurring payments detected yet. Connect Gmail and import more payment history to discover recurring
              charges.
            </p>
          )}

          {items.map((item) => {
            const rail = RAIL[item.mechanism] ?? item.instrument;
            const rise = priceRise(item);
            const warning = flagged.has(item.id) && item.kind !== "silent" ? warningLabel(item.kind) : undefined;
            return (
              <button
                type="button"
                className={["ledger-row", item.id === selected?.id ? "is-selected" : ""].join(" ").trim()}
                aria-pressed={item.id === selected?.id}
                data-row={item.id}
                key={item.id}
                onClick={() => pick(item.id)}
              >
                <span className="ledger-merchant">
                  <strong>
                    {item.merchant}
                    {!item.inDictionary && <i className="unknown-tag">unknown</i>}
                  </strong>
                  <code>{item.rawNarration}</code>
                </span>
                <span className="ledger-rail">
                  <span className="rail-tag">{rail}</span>
                </span>
                <ChargeSparkline rows={item.evidenceRows} flagged={false} />
                <span className="ledger-amount">
                  <b>
                    {item.amountPattern === "variable" ? "≈ " : ""}
                    {formatINR(item.amount)}
                    <small>{PER[item.cadence]}</small>
                  </b>
                  {rise !== undefined && <em className="hike-tag">+{rise}% hike</em>}
                  {warning && <em className="hike-tag">{warning}</em>}
                </span>
              </button>
            );
          })}
        </section>

        <p className="exclusion-note">
          {personal ? (
            <>
              <strong>About this list:</strong> only detected recurring payments appear here. One-off payments and
              ambiguous duplicates are excluded from the recurring estimate.
            </>
          ) : (
            <>
              <strong>Not added to this list:</strong> one Swiggy order, a transfer to Rahul, salary credits, the
              credit-card repayment, and YouTube&apos;s ₹1 authorisation. Open any row to see the rule that kept it.
            </>
          )}
        </p>
      </div>

      {selected && (
        <aside className="ledger-panel" aria-label={`${selected.merchant} details`}>
          <div className="ledger-panel-bar">
            <span>
              <span aria-hidden="true">‹</span> Payment details
            </span>
            <button type="button" onClick={() => setSelectedId(null)} aria-label="Close the payment panel">
              ✕
            </button>
          </div>
          <div className="ledger-panel-body">
            <h2>{selected.merchant}</h2>
            <code>{selected.rawNarration}</code>
            <PriceHistory item={selected} flagged={flagged.has(selected.id)} />
            <ProofChain item={selected} flagged={flagged.has(selected.id)} live={live} />
            <button type="button" className="ledger-panel-more" onClick={() => onOpen(selected.id)}>
              All details and cancel steps →
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
