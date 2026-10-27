/**
 * Live Neo4j only — multi-hop walk Payment → Merchant ← Message / Mandate.
 * Hidden on the offline CSV path so we never fake relationship types.
 */
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function EvidencePath({ item }: { item: Commitment }) {
  const latest = item.evidenceRows[item.evidenceRows.length - 1];
  const priceNotices = item.notices.filter((notice) => notice.eventType === "price_change");
  const silentHike =
    item.signals.includes("silent_hike") || (item.amountPattern === "step" && priceNotices.length === 0);
  const hops: { edge: string; to: string; detail: string }[] = [
    {
      edge: "-[:PAID_TO]->",
      to: `Merchant · ${item.merchant}`,
      detail: latest
        ? `${item.evidenceRows.length} Payment nodes · latest ${formatDate(latest.date)} · ${formatINR(latest.amount)}`
        : `${item.evidenceRows.length} Payment nodes`
    }
  ];
  if (item.notices.length > 0) {
    hops.push({
      edge: "<-[:ABOUT]-",
      to: `Message · ${item.notices.length}`,
      detail: item.notices
        .slice(-2)
        .map((notice) => `${notice.eventType} · ${formatDate(notice.sentOn)}`)
        .join(" · ")
    });
  } else {
    hops.push({
      edge: "<-[:ABOUT]-",
      to: "Message · none",
      detail: silentHike
        ? "No price_change Message on this merchant — that missing edge is the silent hike"
        : "No SMS or email is linked to this merchant"
    });
  }
  if (item.mandateRef) {
    hops.push({
      edge: "-[:AUTHORIZED_BY]->",
      to: `Mandate · ${item.mandateRef}`,
      detail: `status ${item.mandateStatus ?? "unknown"} · ${item.instrument}`
    });
  }
  hops.push({
    edge: "-[:GROUPED_INTO]->",
    to: `Commitment · ${item.merchant}`,
    detail: item.stopMoney || item.cancellationPath || "Cancel path lives on the Pattern that matched the narration"
  });

  return (
    <section className="detail-block evidence-path" aria-label="Neo4j evidence path">
      <h3>Evidence path · Neo4j</h3>
      <p className="detail-note">
        Multi-hop walk on the live graph. A flat CSV cannot show these relationship types.
      </p>
      <ol className="path-hops">
        <li className="path-root">
          <code>Payment</code>
          <span>{item.rawNarration}</span>
        </li>
        {hops.map((hop) => (
          <li key={hop.edge + hop.to}>
            <code className="path-rel">{hop.edge}</code>
            <div>
              <strong>{hop.to}</strong>
              <span>{hop.detail}</span>
            </div>
          </li>
        ))}
      </ol>
      {silentHike && (
        <p className="path-finding">
          Finding: amount stepped
          {item.previousAmount !== undefined ? ` ${formatINR(item.previousAmount)} → ${formatINR(item.amount)}` : ""} with{" "}
          <strong>no</strong> <code>price_change</code> Message → <code>silent_hike</code>
        </p>
      )}
    </section>
  );
}
