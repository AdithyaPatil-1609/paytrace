/**
 * Screen 03 — Cancel paths
 * Stop the service, stop the money, and what to do if they stay silent.
 */
import { ScreenHeader } from "@/web/components/chrome/screen-header";
import { modeLabel, monthlyCost } from "@/server/presentation/commitment-ui";
import { formatDate, formatINR } from "@/server/presentation/format";
import type { Commitment } from "@/server/payments/types";
import { useState } from "react";
import { CancellationDrawer } from "@/web/components/detail/cancellation-drawer";
import { CueIcon, MerchantMark } from "@/web/components/chrome/visual-cues";
import { cancelStrip } from "@/server/presentation/cancel-strip";

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
        help="Pick a payment to see how to stop it, step by step. Cancelling the service and stopping the payment are sometimes two separate steps, and we show both. Bills, insurance and loans still have to be paid even if you turn off autopay."
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
                <span className="path-name-top">
                  <MerchantMark name={item.merchant} tone={isIssue ? "issue" : item.cancelMode === "block" ? "fixed" : "ok"} />
                  <strong>{item.merchant}</strong>
                </span>
                <span>{monthlyCost(item)}</span>
                <small className="path-mode">{modeLabel(item)}</small>
                <small className="path-spent">
                  Since {formatDate(item.startedOn)} · {formatINR(item.spentToDate)} taken
                </small>
                {item.mandateRef && <small>Mandate: {item.mandateRef}</small>}
              </div>
              <div className="path-copy path-guide-intro">
                {item.cancelMode === "block" ? (
                  <p
                    className="path-blocked"
                    title="This is a loan obligation. Contact the lender about repayment or closure; do not stop its mandate from this app."
                  >
                    <span className="path-step-icon">
                      <CueIcon kind="loan" size={18} />
                    </span>
                    Loan: talk to the lender
                  </p>
                ) : (
                  <>
                    {item.nextCharge && (
                      <p className="path-next">
                        <CueIcon kind="clock" size={15} />
                        {item.cancelMode === "normal"
                          ? `Next ${formatINR(item.amount)} on ${formatDate(item.nextCharge)}: stop it before then`
                          : `Next ${formatINR(item.amount)} due ${formatDate(item.nextCharge)}`}
                      </p>
                    )}
                    <ol className="path-steps" aria-label={`How to stop ${item.merchant}`}>
                      {cancelStrip(item).map((step) => (
                        <li key={step.label} title={step.hint}>
                          <span className="path-step-icon">
                            <CueIcon kind={step.icon} size={18} />
                          </span>
                          {step.label}
                        </li>
                      ))}
                    </ol>
                  </>
                )}
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
                      className="secondary-button"
                      id={`cancel-trigger-${item.id}`}
                      aria-haspopup="dialog"
                      aria-expanded={openGuide === item.id}
                      aria-controls={openGuide === item.id ? `cancel-guide-${item.id}` : undefined}
                      onClick={() => setOpenGuide(item.id)}
                    >
                      Show steps <i aria-hidden="true">→</i>
                      <span className="visually-hidden"> to stop {item.merchant}</span>
                    </button>
                    {item.cancelMode !== "normal" && <small>The amount due remains.</small>}
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
