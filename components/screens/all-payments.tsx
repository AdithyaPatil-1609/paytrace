/**
 * Screen 01 — All payments
 * Three parts side by side: the yearly total and the radar of what is due
 * next, the table of every payment, and a docked panel on the right with the
 * selected payment's price history and evidence path. On narrow screens the
 * panel is hidden and a row opens the full drawer instead.
 */
import { useState, type ReactNode } from "react";
import { warningLabel } from "@/components/chrome/warning-tag";
import { PriceHistory, ProofChain } from "@/components/detail/price-and-proof";
import { UpiCancelLink } from "@/components/detail/upi-cancel-link";
import { issueItems } from "@/lib/payments/analysis";
import { ChargeSparkline } from "@/components/visualizations/charge-sparkline";
import { PaymentRadar } from "@/components/visualizations/payment-radar";
import { formatINR } from "@/lib/presentation/format";
import { lastUsedLine } from "@/lib/presentation/last-used";
import { issueGroups, type IssueCategory } from "@/lib/presentation/issue-cards";
import { CueChip, CueIcon, MerchantMark, MoneyBar, toneOf, type CueKind } from "@/components/chrome/visual-cues";
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

/** One picture per kind of problem, shared with the Issues screen. */
export const CUE_FOR_GROUP: Record<IssueCategory, CueKind> = {
  price: "price",
  announced: "price",
  unused: "unused",
  trial: "trial",
  new: "new",
  unknown: "unknown"
};

const SHORT_GROUP: Record<IssueCategory, string> = {
  price: "silent price rise",
  announced: "price rise",
  unused: "not used",
  trial: "trial now paid",
  new: "new autopay",
  unknown: "unknown"
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
  personal = false,
  subscriptionNotices
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
  subscriptionNotices?: ReactNode;
}) {
  // The same test the Issues screen uses, so both screens always agree.
  const flagged = new Set(issueItems(items, kept).map((item) => item.id));
  const problems = issueGroups(items, kept).filter((group) => group.rows.length > 0);
  // The panel stays closed until the person clicks a payment.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function pick(id: string) {
    if (window.matchMedia(DOCKED).matches) setSelectedId(id);
    else onOpen(id);
  }

  return (
    <div className={`ledger-split${selected ? " has-panel" : ""}`}>
      <div className="ledger-screen">
        <header className="ledger-hero glance-hero">
          <h1 className="visually-hidden">All payments</h1>
          <p className="glance-total">
            <strong>{formatINR(total / 12)}</strong>
            <span>/ month</span>
            <small>
              {formatINR(total)} a year · {items.length} {items.length === 1 ? "payment" : "payments"}
              {simulated && baseline !== total && (
                <>
                  {" "}
                  (was <s>{formatINR(baseline)}</s>)
                </>
              )}
            </small>
          </p>
          <MoneyBar items={items} flagged={flagged} onOpen={pick} />
          <div className="glance-chips" aria-label="Problems found">
            {problems.length === 0 && items.length > 0 ? (
              <CueChip kind="ok" tone="calm">Nothing needs a look</CueChip>
            ) : (
              problems.map((group) => (
                <CueChip key={group.id} kind={CUE_FOR_GROUP[group.id]} title={group.title}>
                  <b>{group.rows.length}</b> {SHORT_GROUP[group.id]}
                </CueChip>
              ))
            )}
          </div>
        </header>

        <PaymentRadar items={items} flagged={flagged} asOf={asOf} onOpen={pick} />

        <section className="ledger-table" aria-label="Every repeating payment">
          <div className="ledger-head" aria-hidden="true">
            <span>Merchant</span>
            <span>Paid by</span>
            <span>Last 12 months</span>
            <span>Amount</span>
          </div>

          {personal && items.length === 0 && (
            <p className="personal-empty">
              No repeating payments yet. A payment appears here once two charges or renewal notices show it repeating. Check the Subscription watchlist for signup emails, or use Sync Gmail at the top to rescan up to 2 years.
            </p>
          )}

          {items.map((item) => {
            // A notice rarely says how the money moves; say so instead of guessing "Card".
            const rail = RAIL[item.mechanism] ?? (item.basis === "notices" ? "Rail not known" : item.instrument);
            const rise = priceRise(item);
            const warning = flagged.has(item.id) && item.kind !== "silent" ? warningLabel(item.kind) : undefined;
            const lastUsed = lastUsedLine(item);
            return (
              <button
                type="button"
                className={["ledger-row", item.id === selected?.id ? "is-selected" : ""].join(" ").trim()}
                aria-pressed={item.id === selected?.id}
                data-row={item.id}
                key={item.id}
                onClick={() => pick(item.id)}
              >
                <span className="ledger-merchant has-mark">
                  <MerchantMark name={item.merchant} tone={toneOf(item, flagged)} />
                  <span>
                    <strong title={item.rawNarration}>
                      {item.merchant}
                      {!item.inDictionary && (
                        <i className="unknown-tag" title="Not in our merchant list">
                          <CueIcon kind="unknown" size={12} />
                        </i>
                      )}
                    </strong>
                    {lastUsed && (
                      <small className={`last-used${item.kind === "unused" ? " is-stale" : ""}`}>
                        <CueIcon kind={item.kind === "unused" ? "unused" : "clock"} size={12} />
                        {lastUsed}
                      </small>
                    )}
                  </span>
                </span>
                <span className="ledger-rail">
                  <span className="rail-tag">{rail}</span>
                  {item.basis === "notices" && (
                    <em className="notice-tag" title="Built from debit or renewal notices in Gmail. No bank debit confirms it yet.">
                      Not confirmed
                    </em>
                  )}
                </span>
                <ChargeSparkline rows={item.evidenceRows} flagged={false} />
                <span className="ledger-amount">
                  <b>
                    {item.amountPattern === "variable" ? "≈ " : ""}
                    {formatINR(item.amount)}
                    <small>{PER[item.cadence]}</small>
                  </b>
                  {rise !== undefined && <CueChip kind="price">+{rise}%</CueChip>}
                  {warning && <CueChip kind={item.kind === "trial" ? "trial" : "unused"}>{warning}</CueChip>}
                </span>
              </button>
            );
          })}
        </section>

        {subscriptionNotices}

        <details className="exclusion-note">
          <summary>What is not counted</summary>
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
        </details>
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
            <UpiCancelLink item={selected} />
            <button type="button" className="ledger-panel-more" onClick={() => onOpen(selected.id)}>
              View payment details and checklist →
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
