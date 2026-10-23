"use client";

import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

/**
 * The guided run. One button plays the product end to end: a new autopay is
 * detected, a price change is raised, and a forgotten autopay is put up for a
 * decision that lands on its cancel path.
 *
 * Every step is advanced by a click rather than a timer, so a presenter can
 * hold on a screen for as long as the story needs.
 */
export type DemoStep = "idle" | "autopay" | "price" | "unused" | "cancel" | "done";

export function DemoOverlay({
  step,
  newItem,
  hikeItem,
  zombieItem,
  onAdvance,
  onDecline,
  onFinish
}: {
  step: DemoStep;
  newItem?: Commitment;
  hikeItem?: Commitment;
  zombieItem?: Commitment;
  onAdvance: () => void;
  onDecline: () => void;
  onFinish: () => void;
}) {
  if (step === "idle" || step === "done") return null;

  // The forgotten-autopay step is a decision, so it takes the middle of the
  // screen and waits. The rest are alerts that sit beside the work.
  if (step === "unused" && zombieItem) {
    return (
      <div className="demo-modal-backdrop" role="dialog" aria-modal="true">
        <div className="demo-modal">
          <p className="demo-kicker">Nothing opened it in months</p>
          <h2>Stop paying for {zombieItem.merchant}?</h2>
          <p className="demo-body">
            {formatINR(zombieItem.amount)} leaves every month, and{" "}
            <strong>{formatINR(zombieItem.annualCost)}</strong> over a year.
            {zombieItem.lastOpened
              ? ` It was last opened on ${formatDate(zombieItem.lastOpened)}, and ${zombieItem.debitCount} debits have posted since.`
              : " There is no record of it being opened at all."}
          </p>
          <p className="demo-caveat">
            Paytrace cannot cancel it for you. Choosing to stop opens the exact steps — stop the service, then stop the
            money — on the cancel screen.
          </p>
          <div className="demo-actions">
            <button className="primary-button" onClick={onAdvance}>
              Show me how to stop it
            </button>
            <button className="secondary-button" onClick={onDecline}>
              Keep paying for it
            </button>
          </div>
        </div>
      </div>
    );
  }

  const alerts: Record<string, { kicker: string; title: string; body: string; cta: string } | undefined> = {
    autopay: newItem && {
      kicker: "New mandate detected",
      title: `${newItem.merchant} is now being tracked`,
      body: `A UPI Autopay mandate was registered and ${formatINR(newItem.amount)} has already been debited. Paytrace found it from the statement line and the mandate, not from anyone typing it in.`,
      cta: "Next: a price that moved"
    },
    price: hikeItem && {
      kicker: "Price changed without a notice",
      title: `${hikeItem.merchant} went from ${formatINR(hikeItem.previousAmount ?? 0)} to ${formatINR(hikeItem.amount)}`,
      body: `Every debit message arrived. No price-change message did. That silence is why this is flagged — the extra ${formatINR((hikeItem.amount - (hikeItem.previousAmount ?? 0)) * 12)} a year would otherwise go unnoticed.`,
      cta: "Next: something nobody uses"
    },
    cancel: zombieItem && {
      kicker: "Here is the path",
      title: `Two tracks to stop ${zombieItem.merchant}`,
      body: "Cancel the membership, then revoke the mandate in your UPI app. The revoke works even if the merchant never replies — that is the step people miss.",
      cta: "End the run"
    }
  };

  const alert = alerts[step];
  if (!alert) return null;

  return (
    <aside className="demo-alert" role="status">
      <p className="demo-kicker">{alert.kicker}</p>
      <h2>{alert.title}</h2>
      <p className="demo-body">{alert.body}</p>
      <div className="demo-actions">
        <button className="primary-button" onClick={step === "cancel" ? onFinish : onAdvance}>
          {alert.cta}
        </button>
        <button className="demo-quit" onClick={onFinish}>
          Stop the run
        </button>
      </div>
      <div className="demo-progress">
        <i className={step === "autopay" ? "on" : ""} />
        <i className={step === "price" ? "on" : ""} />
        <i className={step === "cancel" ? "on" : ""} />
      </div>
    </aside>
  );
}
