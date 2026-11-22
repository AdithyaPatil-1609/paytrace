/**
 * Small pictures that stand in for sentences: a letter badge per merchant, one
 * icon per kind of problem, and a coloured tone for each payment.
 * Mentor feedback was that the screens asked people to read too much.
 */
import type { ReactNode } from "react";
import type { Commitment } from "@/server/payments/types";

export type CueKind =
  | "price"
  | "unused"
  | "trial"
  | "new"
  | "unknown"
  | "loan"
  | "ok"
  | "clock"
  | "app"
  | "bank"
  | "receipt"
  | "repeat";

const PATHS: Record<CueKind, ReactNode> = {
  price: (
    <>
      <path d="M2 12.5 6 8.5l3 2.5 5-6" />
      <path d="M10.5 5H14v3.5" />
    </>
  ),
  unused: <path d="M13.2 9.6A5.6 5.6 0 1 1 6.4 2.8a4.4 4.4 0 0 0 6.8 6.8Z" />,
  trial: (
    <>
      <path d="M4 2h8M4 14h8" />
      <path d="M5 2c0 3.6 6 3.6 6 6s-6 2.4-6 6M11 2c0 3.6-6 3.6-6 6s6 2.4 6 6" />
    </>
  ),
  new: (
    <>
      <path d="M8 1.8v3.4M8 10.8v3.4M1.8 8h3.4M10.8 8h3.4" />
      <path d="m3.6 3.6 2 2M10.4 10.4l2 2M12.4 3.6l-2 2M5.6 10.4l-2 2" />
    </>
  ),
  unknown: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3v.3" />
      <circle cx="8" cy="11.6" r=".5" fill="currentColor" />
    </>
  ),
  loan: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1.4" />
      <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
    </>
  ),
  ok: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="m5.2 8.2 2 2 3.8-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 4.6V8l2.4 1.6" />
    </>
  ),
  app: (
    <>
      <rect x="4.2" y="1.6" width="7.6" height="12.8" rx="1.6" />
      <path d="M7 12h2" />
    </>
  ),
  bank: (
    <>
      <path d="M2 6 8 2.4 14 6H2Z" />
      <path d="M3.6 6.4v5.4M6.5 6.4v5.4M9.5 6.4v5.4M12.4 6.4v5.4M2 13.6h12" />
    </>
  ),
  receipt: (
    <>
      <path d="M3.6 1.8h8.8v12.4l-2.2-1.3-2.2 1.3-2.2-1.3-2.2 1.3V1.8Z" />
      <path d="M6 5.4h4M6 8h4" />
    </>
  ),
  repeat: (
    <>
      <path d="M2.6 7.2A5.4 5.4 0 0 1 12.4 4.6M13.4 8.8a5.4 5.4 0 0 1-9.8 2.6" />
      <path d="M12.6 1.8v3h-3M3.4 14.2v-3h3" />
    </>
  )
};

/** A 16-unit line icon drawn in the current text colour. */
export function CueIcon({ kind, size = 16 }: { kind: CueKind; size?: number }) {
  return (
    <svg
      className={`cue-icon cue-icon-${kind}`}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[kind]}
    </svg>
  );
}

/** Icon plus a few words: the warning reads the same in colour or not. */
export function CueChip({
  kind,
  children,
  tone = "problem",
  title
}: {
  kind: CueKind;
  children: ReactNode;
  tone?: "problem" | "calm" | "fixed";
  title?: string;
}) {
  return (
    <span className={`cue-chip cue-chip-${tone}`} title={title}>
      <CueIcon kind={kind} size={14} />
      {children}
    </span>
  );
}

/** Up to two letters from the merchant's name, e.g. "Home loan" → "HL". */
export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** A round letter badge, so each payment is recognised without reading. */
export function MerchantMark({ name, tone = "ok" }: { name: string; tone?: Tone }) {
  return (
    <span className={`merchant-mark merchant-mark-${tone}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** Three tones used everywhere: red only for a problem. */
export type Tone = "issue" | "fixed" | "ok";

export function toneOf(item: Pick<Commitment, "id" | "bucket">, flagged: Set<string>): Tone {
  if (flagged.has(item.id)) return "issue";
  if (item.bucket === "bills" || item.bucket === "debt") return "fixed";
  return "ok";
}
