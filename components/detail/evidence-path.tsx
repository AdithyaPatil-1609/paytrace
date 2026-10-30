import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function EvidencePath({ item }: { item: Commitment }) {
  const latest = item.evidenceRows.at(-1);
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  const silentHike = item.signals.includes("silent_hike");

  return (
    <section className="detail-block evidence-path" aria-label="How this payment was checked">
      <h3>How we checked this payment</h3>
      <ol className="payment-proof">
        <li>
          <strong>Bank payments</strong>
          <span>
            {item.evidenceRows.length} recorded payments to {item.merchant}.
            {latest && ` Most recent: ${formatINR(latest.amount)} on ${formatDate(latest.date)}.`}
          </span>
        </li>
        <li>
          <strong>Messages</strong>
          <span>
            {item.notices.length > 0
              ? `${item.notices.length} related messages found. Read them below.`
              : "No related messages found in the available records."}
            {silentHike && priceNotices.length === 0 && " None announced a price increase."}
          </span>
        </li>
        {item.mandateRef && (
          <li>
            <strong>Autopay permission</strong>
            <span>{item.instrument} · {item.mandateStatus ?? "status unknown"}. Reference: {item.mandateRef}.</span>
          </li>
        )}
      </ol>
      {silentHike && (
        <p className="path-finding">
          The price increased{item.previousAmount !== undefined ? ` from ${formatINR(item.previousAmount)} to ${formatINR(item.amount)}` : ""},
          but no price-change notice was found.
        </p>
      )}
    </section>
  );
}
