/**
 * Screen 03 — Cancel paths
 * Stop the service, stop the money, and what to do if they stay silent.
 */
import { ScreenHeader } from "@/components/chrome/screen-header";
import { modeLabel, monthlyCost } from "@/lib/commitment-ui";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function CancelPathsScreen({
  items,
  allItems,
  revoked,
  kept,
  onConfirm,
  onKeep,
  onFlagAgain
}: {
  items: Commitment[];
  allItems: Commitment[];
  revoked: string[];
  kept: string[];
  onConfirm: (id: string) => void;
  onKeep: (id: string) => void;
  onFlagAgain: (id: string) => void;
}) {
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
          Confirmed stops have taken <strong>{formatINR(saved)}</strong> out of the year:{" "}
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
              <div className="path-copy">
                <div>
                  <b>STOP THE SERVICE</b>
                  <p>{item.stopService}</p>
                  {item.mechanism === "vas" && (
                    <code className="stop-line">Sample: send STOP CT to 155223</code>
                  )}
                </div>
                <div>
                  <b>STOP THE MONEY</b>
                  <p>{item.stopMoney}</p>
                </div>
                <div className="silent-line">
                  <b>IF THEY STAY SILENT</b>
                  <p>{item.ifSilent}</p>
                </div>
                {item.trap && (
                  <p className="trap">
                    <strong>Watch for:</strong> {item.trap}
                  </p>
                )}
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
                    <button className="danger-button" onClick={() => onConfirm(item.id)}>
                      {item.cancelMode === "normal" ? "Cancel the autopay" : "Mark it handled"} <i>→</i>
                    </button>
                    <small>
                      {item.cancelMode === "normal"
                        ? `Cancelling drops the year by ${formatINR(item.annualCost)}.`
                        : "This does not change the year. The amount due remains."}
                    </small>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
