/**
 * Screen 03 — Cancel paths
 * Stop the service, stop the money, and what to do if they stay silent.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { modeLabel, monthlyCost } from "@/lib/presentation/commitment-ui";
import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";
import { useState } from "react";
import { CancellationDrawer } from "@/components/detail/cancellation-drawer";

export function CancelPathsScreen({
  items,
  allItems,
  revoked,
  kept,
  onConfirm,
  onKeep,
  onFlagAgain,
  initialOpenId
}: {
  items: Commitment[];
  allItems: Commitment[];
  revoked: string[];
  kept: string[];
  onConfirm: (id: string) => void;
  onKeep: (id: string) => void;
  onFlagAgain: (id: string) => void;
  initialOpenId?: string | null;
}) {
  const [openGuide, setOpenGuide] = useState<string | null>(initialOpenId ?? null);
  function closeGuide() {
    setOpenGuide(null);
  }
  const selectedGuide = items.find((item) => item.id === openGuide && item.cancelMode !== "block");
  const stoppedRows = allItems.filter((item) => revoked.includes(item.id));
  const saved = stoppedRows.reduce((sum, item) => sum + item.annualCost, 0);

  return (
    <>
      <ScreenHeader
        number="3"
        eyebrow="HOW TO STOP EACH ONE"
        title="A cancel path for every autopay"
        copy="Follow the steps for your service and payment provider, then keep the confirmation."
        help="Cancelling a service and stopping its payment permission can be separate steps. Each guide includes follow-up instructions if charges continue. Bills, insurance and loans can remain due even when automatic payments stop; the loan has no revoke control. PayTrace only records your report."
      />
      {saved > 0 && (
        <p className="revoke-banner">
          Payments you reported as stopped have taken <strong>{formatINR(saved)}</strong> out of the
          estimate: {stoppedRows.map((item) => item.merchant).join(", ")}.
        </p>
      )}
      <section className="path-list">
        {items.map((item) => {
          const isKept = kept.includes(item.id);
          const isIssue = ["unused", "silent", "trial"].includes(item.kind) && !isKept;
          return (
            <article
              className={`path-card ${isIssue ? "issue" : ""} ${isKept ? "kept" : ""} ${item.signals.includes("new") ? "is-new" : ""}`}
              data-row={item.id}
              key={item.id}
            >
              <div className="path-name">
                <strong>{item.merchant}</strong>
                <span>{monthlyCost(item)}</span>
                <small className="path-mode">{modeLabel(item)}</small>
                <small className="path-spent">
                  Since {formatDate(item.startedOn)} · {formatINR(item.spentToDate)} taken
                </small>
                {item.mandateRef && <small>Mandate: {item.mandateRef}</small>}
              </div>
              <div className="path-copy path-guide-intro">
                <p>
                  {item.cancelMode === "block"
                    ? "This is a loan obligation. Contact the lender about repayment or closure; do not stop its mandate from this app."
                    : "Follow the service and payment-provider steps, keep confirmation, and check what to do if charges continue."}
                </p>
                {isKept && (
                  <p className="kept-note">
                    Kept. The warning is settled and the mandate stays <strong>Active</strong>, so
                    the year is unchanged.{" "}
                    <button onClick={() => onFlagAgain(item.id)}>Flag it again</button>
                  </p>
                )}
              </div>
              <div className="path-action">
                {item.cancelMode === "block" ? (
                  <span className="no-action">No revoke control</span>
                ) : (
                  <>
                    {isIssue && (
                      <button className="keep-button" onClick={() => onKeep(item.id)}>
                        Keep it
                      </button>
                    )}
                    <button
                      className="danger-button"
                      id={`cancel-trigger-${item.id}`}
                      aria-haspopup="dialog"
                      aria-expanded={openGuide === item.id}
                      aria-controls={openGuide === item.id ? `cancel-guide-${item.id}` : undefined}
                      onClick={() => setOpenGuide(item.id)}
                    >
                      Steps to cancel <i>→</i>
                    </button>
                    <small>
                      {item.cancelMode === "normal"
                        ? "View guidance. No payment is cancelled by opening it."
                        : "This does not change the year. The amount due remains."}
                    </small>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
      {selectedGuide && (
        <CancellationDrawer
          key={selectedGuide.id}
          item={selectedGuide}
          onClose={closeGuide}
          onComplete={() => {
            onConfirm(selectedGuide.id);
            setOpenGuide(null);
          }}
        />
      )}
    </>
  );
}
