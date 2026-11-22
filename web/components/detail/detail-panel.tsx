/**
 * Side drawer for one commitment: facts, notices, statement proof, Evidence path.
 */
import { useEffect, useRef, useState } from "react";
import { EvidencePath } from "@/web/components/detail/evidence-path";
import type { SourceInfo } from "@/neo4j/dataset";
import { monthlyCost } from "@/server/presentation/commitment-ui";
import { formatDate, formatINR } from "@/server/presentation/format";
import type { Commitment, MerchantIdentity } from "@/server/payments/types";
import type { Dataset } from "@/server/payments/types";
import { FindingChallenge } from "./finding-challenge";
import { PriceHistory, ProofChain } from "./price-and-proof";

export function DetailPanel({
  item,
  asOf,
  source,
  dataset,
  challengeLive,
  challengeInitiallyOpen = false,
  onClose
}: {
  item: Commitment;
  asOf: string;
  source: SourceInfo;
  dataset: Dataset;
  challengeLive: boolean;
  challengeInitiallyOpen?: boolean;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = Array.from(
          panel.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled), summary, [href], input, select, textarea"
          ) ?? []
        ).filter((el) => el.getClientRects().length);
        const first = controls[0],
          last = controls.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === panel.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", keys);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", keys);
      previous?.focus();
    };
  }, [onClose]);
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  const flagged = ["unused", "silent", "trial"].includes(item.kind);
  return (
    <div
      className="detail-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-title"
      onClick={onClose}
    >
      <aside
        ref={panel}
        tabIndex={-1}
        className="detail-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-bar">
          <button className="drawer-back" onClick={onClose} aria-label="Back to the list">
            ‹ <span>Payment details</span>
          </button>
          <button className="drawer-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <header>
          <div>
            <h2 id="transaction-title">{item.merchant}</h2>
            <code>{item.rawNarration}</code>
            <p>{item.plainDescription}</p>
          </div>
        </header>

        {source.personal && item.merchantIdentity && <MerchantIdentityReview key={`${item.merchantIdentity.id}-${item.merchantIdentity.status}`} identity={item.merchantIdentity} />}

        <PriceHistory item={item} flagged={flagged} />
        <ProofChain item={item} flagged={flagged} live={source.kind === "neo4j"} />

        <FindingChallenge
          item={item}
          dataset={dataset}
          live={challengeLive}
          personal={source.personal}
          initiallyOpen={challengeInitiallyOpen}
        />
        {source.kind === "neo4j" && !source.personal && (
          <details className="detail-accordion">
            <summary>Linked evidence</summary>
            <EvidencePath item={item} />
          </details>
        )}

        <details className="detail-accordion" open>
          <summary>Payment overview</summary>
          <section className="detail-facts">
            <Fact label="This year" value={formatINR(item.annualCost)} />
            <Fact label={item.combinedCycle ? "Combined cycle" : "Each charge"} value={monthlyCost(item)} />
            <Fact label="Rhythm" value={item.cadence} />
            <Fact label="Instrument" value={item.instrument} />
            <Fact label={item.basis === "notices" ? "Debit notices seen" : "Evidence records"} value={String(item.debitCount)} />
            <Fact label="Paying since" value={formatDate(item.startedOn)} />
            <Fact label={item.basis === "notices" ? "Reported total (unconfirmed)" : "Recorded total"} value={formatINR(item.spentToDate)} />
            <Fact label="Next charge" value={formatDate(item.nextCharge)} />
            <Fact
              label="Last used (you told us)"
              value={item.lastOpened ? formatDate(item.lastOpened) : "Not known"}
            />
          </section>
        </details>

        <details className="detail-accordion">
          <summary>Why it counts as recurring</summary>
          <p>{item.whyRecurring}</p>
          {item.mandateRef && (
            <p className="detail-mandate">
              Mandate {item.mandateRef} · status {item.mandateStatus ?? "unknown"} as of{" "}
              {formatDate(asOf)}.
            </p>
          )}
        </details>

        {item.issue && (
          <details className="detail-accordion flagged">
            <summary>What is wrong</summary>
            <p>{item.issue}</p>
          </details>
        )}

        <details className="detail-accordion">
          <summary>Notices · {item.notices.length}</summary>
          <p className="detail-note">
            Price-change messages ·{" "}
            <strong>{priceNotices.length === 0 ? "none" : priceNotices.length}</strong>
            {priceNotices.length === 0 &&
              item.amountPattern === "step" &&
              " — that empty list is the finding."}
          </p>
          <ul className="notice-list">
            {item.notices.map((notice) => (
              <li key={notice.noticeId}>
                <span>
                  {formatDate(notice.sentOn)} · {notice.channel.toUpperCase()} · {notice.eventType}
                </span>
                <p>{notice.text}</p>
              </li>
            ))}
            {item.notices.length === 0 && (
              <li className="empty">No message is attached to this row.</li>
            )}
          </ul>
        </details>

        {item.holds.length > 0 && (
          <details className="detail-accordion">
            <summary>Authorisation holds</summary>
            <p className="detail-note">
              Held out of the price. A ₹{item.holds[0].amount} hold is a card check, not the plan.
            </p>
          </details>
        )}

        <details className="detail-accordion">
          <summary>Evidence · {item.evidenceRows.length} {item.basis === "notices" ? "debit notices" : "records"}</summary>
          <div className="evidence-table">
            {item.evidenceRows.map((row) => (
              <div key={row.txnId}>
                <span>{formatDate(row.date)}</span>
                <code>{row.narration}</code>
                <b>{formatINR(row.amount)}</b>
                <small>{row.reference}</small>
              </div>
            ))}
          </div>
        </details>
      </aside>
    </div>
  );
}

function MerchantIdentityReview({ identity }: { identity: MerchantIdentity }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function decide(decision: "confirmed" | "rejected") {
    setBusy(true);
    try {
      const response = await fetch("/api/account/merchants/identity", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: identity.id, decision })
      });
      if (!response.ok) throw new Error();
      setMessage("Saved. Your next dashboard refresh will show the change.");
    } catch { setMessage("Could not save. Please retry."); setBusy(false); }
  }
  return <section className="drawer-block merchant-identity-review" aria-label="Merchant identity review">
    <h3>{identity.status === "confirmed" ? "Identity confirmed by you" : "Review AI merchant suggestion"}</h3>
    <p>{identity.name} · {identity.category}. This does not verify an autopay method or cancellation path.</p>
    <div className="merchant-identity-actions">
      {identity.status === "suggested" && <button type="button" className="primary-button" disabled={busy} onClick={() => void decide("confirmed")}>Confirm identity</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void decide("rejected")}>{identity.status === "confirmed" ? "Undo confirmation" : "Not this merchant"}</button>
    </div>
    {message && <p className="drawer-note" role="status">{message}</p>}
  </section>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
