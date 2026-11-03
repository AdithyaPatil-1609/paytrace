/**
 * Screen 03 — Cancel paths
 * Stop the service, stop the money, and what to do if they stay silent.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { modeLabel, monthlyCost } from "@/lib/commitment-ui";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";
import { useState } from "react";
import { CancellationGuide } from "@/components/detail/cancellation-guide";

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
  function closeGuide(id: string) {
    setOpenGuide(null);
    document.getElementById(`cancel-trigger-${id}`)?.focus();
  }
  const stoppedRows = allItems.filter((item) => revoked.includes(item.id));
  const saved = stoppedRows.reduce((sum, item) => sum + item.annualCost, 0);

  return (
    <>
      <ScreenHeader
        number="3"
        eyebrow="HOW TO STOP EACH ONE"
        title="A cancel path for every autopay"
        copy="A normal path has two tracks: stop the service, then stop the money. Every path also says what to do when the merchant never replies, because the revoke does not need their answer. The loan has no revoke control."
      />
      {saved > 0 && (
        <p className="revoke-banner">
          Payments you reported as stopped have taken <strong>{formatINR(saved)}</strong> out of the estimate:{" "}
          {stoppedRows.map((item) => item.merchant).join(", ")}.
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
                <p>{item.cancelMode === "block" ? "This is a loan obligation. Contact the lender about repayment or closure; do not stop its mandate from this app." : "Follow the service and payment-provider steps, keep confirmation, and check what to do if charges continue."}</p>
                {isKept && (
                  <p className="kept-note">
                    Kept. The warning is settled and the mandate stays <strong>Active</strong>, so the year is
                    unchanged.{" "}
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
                    <button className="danger-button" id={`cancel-trigger-${item.id}`} aria-expanded={openGuide === item.id} aria-controls={openGuide === item.id ? `cancel-guide-${item.id}` : undefined} onClick={() => openGuide === item.id ? closeGuide(item.id) : setOpenGuide(item.id)}>
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
              {openGuide === item.id && item.cancelMode !== "block" && <CancellationGuide item={item} onClose={() => closeGuide(item.id)} onComplete={() => { onConfirm(item.id); setOpenGuide(null); }} />}
            </article>
          );
        })}
      </section>
    </>
  );
}
