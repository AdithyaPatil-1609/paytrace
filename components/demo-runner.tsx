"use client";

import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

/**
 * One incoming message. Dismissing it leaves the new autopay on the list.
 */
export function AutopayNotice({
  open,
  channel,
  sender,
  message,
  item,
  onDismiss
}: {
  open: boolean;
  channel: string;
  sender: string;
  message: string;
  item?: Commitment;
  onDismiss: () => void;
}) {
  if (!open) return null;

  return (
    <aside className="demo-alert" role="status">
      <p className="demo-kicker">
        {channel} · {sender}
      </p>
      <h2>Autopay message received</h2>
      <p className="demo-message">{message}</p>
      {item && (
        <p className="demo-body">
          <strong>{item.merchant}</strong> is now tracked. The payments, the plain name, the cancel path, and the year all include it.{" "}
          {formatINR(item.amount)} a month, {formatINR(item.annualCost)} this year. It is not an issue.
        </p>
      )}
      <div className="demo-actions">
        <button className="primary-button" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </aside>
  );
}
