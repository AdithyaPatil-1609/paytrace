/**
 * Side drawer for one commitment: facts, notices, statement proof, Evidence path.
 */
import { EvidencePath } from "@/components/detail/evidence-path";
import type { SourceInfo } from "@/db/neo4j/dataset";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function DetailPanel({
  item,
  asOf,
  source,
  onClose
}: {
  item: Commitment;
  asOf: string;
  source: SourceInfo;
  onClose: () => void;
}) {
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  return (
    <div className="detail-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <aside className="detail-panel" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <code>{item.rawNarration}</code>
            <h2>{item.merchant}</h2>
            <p>{item.plainDescription}</p>
          </div>
          <button onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        {source.kind === "neo4j" && <EvidencePath item={item} />}

        <section className="detail-facts">
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
        </section>

        <section className="detail-block">
          <h3>Why it counts as recurring</h3>
          <p>{item.whyRecurring}</p>
          {item.mandateRef && (
            <p className="detail-mandate">
              Mandate {item.mandateRef} · status {item.mandateStatus ?? "unknown"} as of {formatDate(asOf)}.
            </p>
          )}
        </section>

        {item.issue && (
          <section className="detail-block flagged">
            <h3>What is wrong</h3>
            <p>{item.issue}</p>
          </section>
        )}

        <section className="detail-block">
          <h3>Notices · {item.notices.length}</h3>
          <p className="detail-note">
            Price-change messages · <strong>{priceNotices.length === 0 ? "none" : priceNotices.length}</strong>
            {priceNotices.length === 0 && item.amountPattern === "step" && " — that empty list is the finding."}
          </p>
          <ul className="notice-list">
            {item.notices.slice(-6).map((notice) => (
              <li key={notice.noticeId}>
                <span>
                  {formatDate(notice.sentOn)} · {notice.channel.toUpperCase()} · {notice.eventType}
                </span>
                <p>{notice.text}</p>
              </li>
            ))}
            {item.notices.length === 0 && <li className="empty">No message is attached to this row.</li>}
          </ul>
        </section>

        {item.holds.length > 0 && (
          <section className="detail-block">
            <h3>Authorisation holds</h3>
            <p className="detail-note">
              Held out of the price. A ₹{item.holds[0].amount} hold is a card check, not the plan.
            </p>
          </section>
        )}

        <section className="detail-block">
          <h3>Evidence · {item.evidenceRows.length} statement lines</h3>
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
        </section>
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
