"use client";

import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";

function InstructionFlow({ text }: { text: string }) {
  const parts = text
    .trim()
    .split(/\.\s+|\.$|,\s+then\s+|\s+→\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return (
    <p className="cancellation-instruction">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && (
            <>
              <span className="instruction-arrow" aria-hidden="true">
                →
              </span>
              <span className="sr-only"> then </span>
            </>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

export function CancellationGuide({
  item,
  onClose,
  onComplete
}: {
  item: Commitment;
  onClose: () => void;
  onComplete: () => void;
}) {
  const obligation = item.cancelMode !== "normal";
  const steps = [
    item.stopService,
    "Ask the service for written confirmation and keep a copy of your request.",
    item.stopMoney,
    item.mandateRef
      ? `Keep your mandate reference: ${item.mandateRef}. You may need it when contacting your payment provider.`
      : "Keep the payment reference and your cancellation confirmation for any follow-up.",
    item.nextCharge
      ? `Check the next expected debit on ${formatDate(item.nextCharge)}. Confirm the provider's processing time before that date.`
      : "Check your provider's next debit date and processing time. Future payment dates may vary."
  ].filter(Boolean);
  return (
    <section
      className="cancellation-guide"
      id={`cancel-guide-${item.id}`}
      aria-labelledby={`cancel-title-${item.id}`}
    >
      <header className="cancellation-guide-header">
        <div>
          <p className="cancellation-eyebrow">
            {item.instrument} / {item.mechanism.replaceAll("_", " ")}
          </p>
          <h2 id={`cancel-title-${item.id}`}>{item.product || item.merchant}</h2>
          <p>
            {formatINR(item.annualCost)} a year · {item.merchant}
          </p>
        </div>
        <div className="cancellation-guide-controls">
          <button
            className="secondary-button"
            onClick={onClose}
            aria-label="Close cancellation steps"
          >
            <span aria-hidden="true">×</span>
          </button>
          <span className="cancellation-status">
            {item.kind === "unused"
              ? "NOT USED RECENTLY"
              : obligation
                ? "OBLIGATION"
                : "REVIEW PAYMENT"}
          </span>
        </div>
      </header>
      <p className="cancellation-disclaimer">
        These steps guide you through changes with the service and payment provider. PayTrace does
        not cancel anything for you.
      </p>
      {obligation && (
        <p className="cancellation-warning">
          Stopping automatic payments does not end the bill, policy or other obligation. Review the
          consequences with your provider first.
        </p>
      )}
      <div className="cancellation-columns">
        <div>
          <h3 className="cancellation-eyebrow">DO THIS</h3>
          <ol className="cancellation-timeline">
            <li className="timeline-start">
              <span className="timeline-marker" aria-hidden="true" />
              <span className="timeline-label">YOU</span>
            </li>
            {steps.map((step, index) => (
              <li key={index}>
                <span className="timeline-marker" aria-hidden="true">
                  {index + 1}
                </span>
                <InstructionFlow text={step} />
              </li>
            ))}
            <li className="timeline-end">
              <span className="timeline-marker" aria-hidden="true" />
              <span className="timeline-label">
                {obligation ? "PROVIDER CONFIRMATION" : "CANCELLATION CONFIRMED BY PROVIDER"}
              </span>
            </li>
          </ol>
        </div>
        <div>
          <h3 className="cancellation-eyebrow">IF THEY DON&apos;T STOP</h3>
          <ol className="cancellation-timeline cancellation-escalation">
            <li className="timeline-start">
              <span className="timeline-marker" aria-hidden="true" />
              <span className="timeline-label">STILL CHARGED</span>
            </li>
            <li>
              <span className="timeline-marker" aria-hidden="true">
                1
              </span>
              <InstructionFlow
                text={
                  item.ifSilent ||
                  "Contact the service and payment provider with the debit details and your cancellation confirmation."
                }
              />
            </li>
            <li>
              <span className="timeline-marker" aria-hidden="true">
                2
              </span>
              <InstructionFlow text="Keep the debit reference, cancellation date, confirmation and complaint reference. If unresolved, follow your provider's formal complaints process." />
            </li>
            <li className="timeline-end">
              <span className="timeline-marker" aria-hidden="true" />
              <span className="timeline-label">FOLLOW UP UNTIL RESOLVED</span>
            </li>
          </ol>
          {item.trap && (
            <p className="cancellation-warning">
              <strong>Watch for:</strong> {item.trap}
            </p>
          )}
        </div>
      </div>
      {!obligation && (
        <footer className="cancellation-guide-footer">
          <p>
            Only record completion after you have taken the steps with your service and payment
            provider. This updates your estimate based on your report.
          </p>
          <button className="secondary-button" onClick={onComplete}>
            I completed these steps
          </button>
        </footer>
      )}
    </section>
  );
}
