/**
 * Side drawer for one commitment: facts, notices, statement proof, Evidence path.
 */
import { useEffect, useRef } from "react";
import { EvidencePath } from "@/components/detail/evidence-path";
import type { SourceInfo } from "@/db/neo4j/dataset";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";
import type { Dataset } from "@/lib/types";
import { FindingChallenge } from "./finding-challenge";

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
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>("button:not(:disabled), summary, [href], input, select, textarea") ?? []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", keys);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keys); previous?.focus(); };
  }, [onClose]);
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  return (
    <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby="transaction-title" onClick={onClose}>
      <aside ref={panel} tabIndex={-1} className="detail-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <code>{item.rawNarration}</code>
            <h2 id="transaction-title">{item.merchant}</h2>
            <p>{item.plainDescription}</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <FindingChallenge item={item} dataset={dataset} live={challengeLive} initiallyOpen={challengeInitiallyOpen} />
        {source.kind === "neo4j" && <details className="detail-accordion"><summary>Linked evidence</summary><EvidencePath item={item} /></details>}

        <details className="detail-accordion" open><summary>Payment overview</summary><section className="detail-facts">
          <Fact label="This year" value={formatINR(item.annualCost)} />
          <Fact label="Each charge" value={monthlyCost(item)} />
          <Fact label="Rhythm" value={item.cadence} />
          <Fact label="Instrument" value={item.instrument} />
          <Fact label="Debits seen" value={String(item.debitCount)} />
          <Fact label="Paying since" value={formatDate(item.startedOn)} />
          <Fact label="Spent so far" value={formatINR(item.spentToDate)} />
          <Fact label="Next charge" value={formatDate(item.nextCharge)} />
          <Fact label="Last opened" value={item.lastOpened ? formatDate(item.lastOpened) : "No record"} />
          <Fact
            label="Opens in 12 months"
            value={item.opensLast12Months === undefined ? "—" : String(item.opensLast12Months)}
          />
        </section></details>

        <details className="detail-accordion"><summary>Why it counts as recurring</summary>
          <p>{item.whyRecurring}</p>
          {item.mandateRef && (
            <p className="detail-mandate">
              Mandate {item.mandateRef} · status {item.mandateStatus ?? "unknown"} as of {formatDate(asOf)}.
            </p>
          )}
        </details>

        {item.issue && (
          <details className="detail-accordion flagged"><summary>What is wrong</summary>
            <p>{item.issue}</p>
          </details>
        )}

        <details className="detail-accordion"><summary>Notices · {item.notices.length}</summary>
          <p className="detail-note">
            Price-change messages · <strong>{priceNotices.length === 0 ? "none" : priceNotices.length}</strong>
            {priceNotices.length === 0 && item.amountPattern === "step" && " — that empty list is the finding."}
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
            {item.notices.length === 0 && <li className="empty">No message is attached to this row.</li>}
          </ul>
        </details>

        {item.holds.length > 0 && (
          <details className="detail-accordion"><summary>Authorisation holds</summary>
            <p className="detail-note">
              Held out of the price. A ₹{item.holds[0].amount} hold is a card check, not the plan.
            </p>
          </details>
        )}

        <details className="detail-accordion"><summary>Evidence · {item.evidenceRows.length} statement lines</summary>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
