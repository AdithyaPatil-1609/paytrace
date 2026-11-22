"use client";

import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment } from "@/lib/payments/types";
import { cancelOptions, ifStillCharged, missingCancellationGuidance, requiresProviderReview, type CancelLink } from "@/lib/presentation/cancel-links";

function InstructionFlow({ text }: { text: string }) {
  const parts = text
    .trim()
    .split(/\s+→\s+/)
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
  const generalGuidance = missingCancellationGuidance(item);
  const obligation = item.cancelMode !== "normal" || (generalGuidance && requiresProviderReview(item));
  // The ways to cancel, best first; the person uses the first one that works.
  const options = cancelOptions(item);
  const still = ifStillCharged(item);
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
          <h2 id={`cancel-title-${item.id}`}>{item.inDictionary ? item.product || item.merchant : item.merchant}</h2>
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
      {generalGuidance && (
        <p className="cancellation-warning">
          Merchant-specific cancellation instructions are not verified. The guidance below is based on the available payment information. Confirm the billing method and provider first.
        </p>
      )}
      {obligation && (
        <p className="cancellation-warning">
          Stopping automatic payments does not end the bill, policy or other obligation. Review the
          consequences with your provider first.
        </p>
      )}
      <div className="cancellation-columns">
        <div>
          <h3 className="cancellation-eyebrow">HOW TO CANCEL</h3>
          <ol className="cancel-options">
            {options.map((option, index) => (
              <li key={option.title}>
                <p className="cancel-option-title">
                  <span>{index === 0 ? "Best" : "If not"}</span> {option.title}
                </p>
                {option.steps.map((step, i) => <InstructionFlow key={i} text={step} />)}
                <LinkRow links={option.links} />
              </li>
            ))}
          </ol>
          {item.nextCharge && (
            <p className="cancellation-deadline">
              {generalGuidance || obligation ? <>Next expected debit: {formatDate(item.nextCharge)}. Confirm the correct process with your provider.</> : <>Cancel before {formatDate(item.nextCharge)}, the next expected debit.</>}
            </p>
          )}
        </div>
        <div>
          <h3 className="cancellation-eyebrow">STILL CHARGED AFTER CANCELLING?</h3>
          <ol className="still-charged">
            {still.steps.map((step, index) => <li key={index}>{step}</li>)}
          </ol>
          <LinkRow links={still.links} />
          {item.trap && (
            <p className="cancellation-warning">
              <strong>Careful:</strong> {item.trap}
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

function LinkRow({ links }: { links: CancelLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="cancel-link-row">
      <div>
        {links.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" title={link.note}>
            {link.label} ↗
          </a>
        ))}
      </div>
      {links.filter((link) => link.note).map((link) => <p key={`${link.href}-note`}>{link.note}</p>)}
    </div>
  );
}
