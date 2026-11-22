/**
 * The dark-red tag for a payment with a problem. It always carries an icon
 * and words, so the warning never depends on colour alone.
 */
import type { CommitmentKind } from "@/server/payments/types";

const LABELS: Partial<Record<CommitmentKind, string>> = {
  silent: "Price rose",
  unused: "Not used",
  trial: "Trial → paid"
};

export function warningLabel(kind: CommitmentKind) {
  return LABELS[kind];
}

export function WarningTag({ kind }: { kind: CommitmentKind }) {
  const label = LABELS[kind];
  if (!label) return null;
  return (
    <span className="warning-tag">
      <WarningIcon />
      {label}
    </span>
  );
}

/** A triangle with an exclamation mark, drawn in the current text colour. */
export function WarningIcon() {
  return (
    <svg className="warning-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path d="M8 1.5 15 14H1L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 6v3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.8" r="0.95" fill="currentColor" />
    </svg>
  );
}
