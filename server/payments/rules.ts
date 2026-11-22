/**
 * One rule book, two runners.
 *
 * The thresholds, ids, and sentences below are the parts of detection that
 * must never drift between server/payments/engine.ts (the offline CSV path) and
 * neo4j/analyze.ts (live Cypher). The engine imports them directly; the
 * Cypher query receives RULES as the $rules parameter, so a change here moves
 * both. tests/cypher/cypher.test.ts asserts the two engines then agree field by field.
 */
import type { AmountPattern, Cadence, CommitmentKind, Instrument, Mechanism, Signal, UsageSource } from "./types";

export const RULES = {
  /** A service unopened for longer than this (about 2 months) is a zombie. */
  zombieDays: 60,
  noticeWindowDays: 45,
  /** Gaps scattering by more than this share of their median make a row irregular. */
  irregularSpread: 0.35,
  /** Median-gap ceilings, in days, for each cadence. Above quarterly is annual. */
  weeklyMaxGap: 10,
  monthlyMaxGap: 45,
  quarterlyMaxGap: 135,
  /** Next-charge gap for a row with one debit under a mandate. */
  defaultGapDays: 30,
  /**
   * A gap close to a whole number of usual gaps is missed records (an email
   * not synced, an SMS lost), not a slower cadence: 17 Dec to 17 Aug is eight
   * missed months of a monthly SIP. Close means within this share of the usual gap.
   */
  missedCycleTolerance: 0.2,
  /** Folding missed cycles needs at least this many gaps to know the usual one. */
  missedCycleMinGaps: 3
} as const;

/** The same keys with any value, for a test that overrides one threshold. */
export type Rules = { [Key in keyof typeof RULES]: number };

export const instrumentByMechanism: Record<Mechanism, Instrument> = {
  upi_autopay: "UPI Autopay",
  card_recurring: "Card",
  play_store: "Store plan",
  enach: "eNACH",
  bbps: "Bill autopay",
  neft_standing: "Standing transfer",
  vas: "Operator pack",
  emi_ach: "Loan",
  none: "Card"
};

export function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * An id has to identify one commitment, not one merchant. Grouping is per
 * pattern and per account, so the id carries both: the same brand reached
 * through a second account, or through a second descriptor such as
 * PAYPAL *SPOTIFY, is a different commitment and must not share an id.
 *
 * The descriptor is only added for a brand the dictionary reaches by more
 * than one pattern, so ordinary rows keep a readable id.
 */
export function commitmentId(brand: string, pattern: string, accountId: string, ambiguous: boolean) {
  const brandSlug = slug(brand);
  const accountSlug = slug(accountId);
  if (!ambiguous) return [brandSlug, accountSlug].filter(Boolean).join("-");

  const patternSlug = slug(pattern);
  const descriptor = patternSlug.startsWith(brandSlug)
    ? patternSlug.slice(brandSlug.length).replace(/^-/, "")
    : patternSlug;
  return [brandSlug, descriptor, accountSlug].filter(Boolean).join("-");
}

export function describeRecurring(context: {
  count: number;
  cadence: Cadence;
  pattern: AmountPattern;
  gapCentre: number;
  gapMin?: number;
  gapMax?: number;
  mandate: boolean;
}) {
  const { count, cadence, pattern, gapCentre, gapMin, gapMax, mandate } = context;
  if (count < 2 && mandate) {
    return "One debit so far, under a mandate that is still active. The mandate is what makes it recurring.";
  }
  const rhythm =
    cadence === "irregular"
      ? `${count} debits on uneven dates, ${gapMin} to ${gapMax} days apart`
      : `${count} debits about ${gapCentre} days apart`;
  const shape =
    pattern === "fixed"
      ? "the same amount every time"
      : pattern === "step"
        ? "one amount, then a second amount that stayed"
        : "a different amount each time";
  return `${rhythm}, ${shape}. The interval holds, so the grouping keeps it.`;
}

export function describeIssue(
  signals: Signal[],
  context: { lastOpened?: string; notOpenedSince?: string; usageSource?: UsageSource; previous?: number; latest: number; openedDaysAgo?: number }
) {
  if (signals.includes("silent_hike")) {
    return `₹${context.previous ?? context.latest} became ₹${context.latest}. Debit messages exist. A price-change message does not.`;
  }
  if (signals.includes("trial_converted")) return "A trial-ending notice, then the paid price. The ₹1 hold is not the price.";
  if (signals.includes("zombie")) {
    const months = Math.floor((context.openedDaysAgo ?? 0) / 30);
    if (context.lastOpened) {
      const told = context.usageSource === "phone" ? "from your phone's screen time" : "as you told PayTrace";
      return `Your last use was ${context.lastOpened}, about ${months} months ago (${told}), while payments continue.`;
    }
    if (context.notOpenedSince) {
      return `Not opened on your phone since at least ${context.notOpenedSince}, about ${months} months (from your phone's screen time), while payments continue.`;
    }
    return "PayTrace has no record of when you last used it. Review whether you still use it.";
  }
  return undefined;
}

export function statusFor(signals: Signal[], kind: CommitmentKind) {
  if (kind === "debt") return "Loan repayment";
  if (signals.includes("zombie")) return "Stopped using it";
  if (signals.includes("silent_hike")) return "Price changed without a notice";
  if (signals.includes("trial_converted")) return "Trial became paid";
  if (signals.includes("obligation")) return "Obligation";
  if (signals.includes("variable_amount")) return "Variable bill";
  if (signals.includes("irregular_interval")) return "Irregular dates";
  if (signals.includes("new")) return "New autopay";
  if (signals.includes("annual_next_date")) return "Annual payment";
  return "In use";
}

/** Limits for the AI reader (card U1): longer text is refused before any model sees it. */
export const READER_LIMITS = {
  maxTextChars: 2000,
  maxSenderChars: 40
} as const;

/** Limits for POST /api/ingest/sms (plan card S2): cheap checks before the body is read. */
export const SMS_INGEST_LIMITS = {
  maxBodyBytes: 4096,
  /** A phone clock may run a little fast; anything further ahead is refused. */
  maxFutureSkewMs: 5 * 60_000,
  /** Older messages are history imports, not live SMS. */
  maxAgeMs: 7 * 24 * 60 * 60_000,
  /** Retries when Qwen is down, in milliseconds after the first try. */
  retryDelaysMs: [5_000, 30_000, 120_000]
} as const;

/**
 * Gmail API pacing for account sync. Gmail's per-user limit is shared by
 * every laptop and server that reads the same mailbox through our Google
 * project, so the sync slows down and waits as long as Gmail asks.
 */
export const GMAIL_SYNC_LIMITS = {
  /** Pause between message reads: at most ~12 reads a second, well under Gmail's per-user limit. */
  pauseBetweenReadsMs: 80,
  /** Tries per request when Gmail says "slow down" or has a server error. */
  maxAttempts: 6,
  /** Longest single wait we accept inside one sync; a longer "retry after" stops the sync with a clear error. */
  maxWaitMs: 120_000
} as const;

/** Limits for the live graph warnings (neo4j/warnings.ts). Cypher reads these as parameters. */
export const GRAPH_WARNING_LIMITS = {
  /** A rise between two consecutive payments of at least this percent is a price increase. */
  priceRisePct: 2,
  /** Consecutive payments closer or further apart than this are not one subscription's cycle. */
  minCycleDays: 5,
  maxCycleDays: 400,
  /** How far before the higher charge a price notice still counts as announcing it. */
  noticeLeadDays: 60,
  /** Emails about a merchant needed before a missing notice suggests a silent rise. */
  emailsForSilent: 2,
  /** Verified days without use beyond which a subscription counts as unused. Same as RULES.zombieDays. */
  unusedDays: 60,
  /** Days ahead an upcoming debit is warned about. */
  upcomingWindowDays: 7,
  /** Days ahead a debit is pushed to the person as a heads-up (phone notification and banner). */
  headsUpDays: 3,
  /** A mandate limit this many times the usual charge is a risk worth showing. */
  highMandateRatio: 3,
  /** Severity steps for a price rise, in percent. */
  severityMediumPct: 10,
  severityHighPct: 20
} as const;

/** Pre-debit notice timing (plan card G4), used by server/payments/notice-timing.ts. */
export const NOTICE_TIMING_LIMITS = {
  /** A debit notice should arrive at least this many hours before the debit. */
  minNoticeHours: 24
} as const;

/** Body limits for the browser POST routes (Ask AI, Challenge), read before parsing. */
export const BROWSER_BODY_LIMITS = {
  assistantBytes: 4 * 1024,
  challengeBytes: 2 * 1024
} as const;

/**
 * Signed requests from paired phones (plan cards S5 and M2). Each phone keeps a
 * P-256 key in the Android Keystore; the server keeps only the public key.
 */
export const DEVICE_LIMITS = {
  /** A signed request whose time is further off than this is refused. */
  maxClockSkewMs: 5 * 60_000,
  /** A one-use number is remembered this long; longer than the skew, so a replay can never slip through. */
  nonceMemoryMs: 10 * 60_000,
  /** Distinct one-use numbers remembered at once before the oldest are dropped. */
  maxRememberedNonces: 50_000,
  /** The code shown on the account page to pair a phone. */
  pairingCodeMs: 10 * 60_000,
  pairingCodeLength: 8,
  /** A P-256 public key in X.509 form is 91 bytes; allow some room, nothing more. */
  maxPublicKeyBytes: 200,
  /** Phones one person may pair. */
  maxDevicesPerUser: 5,
  /** How long a device lookup is cached in memory. */
  deviceCacheMs: 60_000
} as const;

/**
 * The public sandbox (/sandbox): each visitor gets a private, temporary copy of
 * the synthetic demo person, kept in this server's memory only.
 */
export const SANDBOX_LIMITS = {
  /** A sandbox not used for this long is forgotten. */
  idleMs: 2 * 60 * 60_000,
  /** Sandboxes kept at once; the least recently used is dropped first. */
  maxSandboxes: 300,
  /** Messages one sandbox may hold before it must be reset. */
  maxMessages: 60,
  /** Request body limit for the sandbox routes. */
  maxBodyBytes: 6 * 1024,
  /** Messages waiting for the AI reader before new ones get "busy". */
  maxWaitingForReader: 4
} as const;

/** How the assistant treats subscriptions seen only in emails (ai/assistant/watchlist.ts). */
export const ASSISTANT_WATCH_LIMITS = {
  /** Days past one full cycle after the last renewal email before a subscription counts as possibly stopped. */
  graceDays: 10,
  /** At most this many older, possibly stopped subscriptions are named in an answer. */
  olderNamed: 5
} as const;

/** Job 4, everyday spending kept out of the recurring list (server/payments/recurring-check.ts). */
export const RECURRING_CHECK_LIMITS = {
  /** Groups sent to the local model per refresh; the rest wait for the next dashboard load. */
  perRun: 15
} as const;

/**
 * Merchant matching (server/payments/merchant-match.ts). Scores run from 0 to 1.
 * A score never merges payments: it only suggests a SIMILAR link that the
 * person confirms or rejects. Thresholds are checked by tests/merchant-match.test.ts.
 */
export const MERCHANT_MATCH = {
  /** At or above this: a strong candidate ("probably the same merchant"). */
  strong: 0.9,
  /** At or above this and below strong: needs the person's review. Below: kept separate. */
  review: 0.75,
  /** Two words count as the same word at this similarity (typos), and only when both have this many letters. */
  fuzzyWord: 0.85,
  fuzzyWordMinLength: 5,
  /** The person's own merchants compared at most, newest first, so a long history stays fast. */
  maxProfileMerchants: 200,
  /** Bumped when the scoring changes; stored on every SIMILAR link. */
  algorithmVersion: "merchant-match-v1"
} as const;

/**
 * Family View (neo4j/family.ts): a read-only share of recurring payments
 * that the owner starts with a one-time link and can revoke at any time.
 */
export const FAMILY_LIMITS = {
  /** An invite link works once, for this long. */
  inviteHours: 48,
  /** Access ends after this many days unless the owner shares again. */
  grantDays: 90,
  /** Unused invite links one owner may have open at once. */
  maxPendingInvites: 5,
  /** People who may view one owner's payments at once. */
  maxViewers: 10,
  /** The Family View screen re-checks access this often, so a revoke shows within seconds. */
  recheckMs: 20_000
} as const;

/**
 * App-usage reports from the Android app (card M3): for apps already known to
 * be paid subscriptions, the day each was last opened and its minutes in the
 * last 30 days. Nothing else about the phone is sent.
 */
export const APP_USAGE_LIMITS = {
  maxBodyBytes: 8192,
  maxApps: 40,
  /** 30 days of minutes. */
  maxMinutes: 30 * 24 * 60,
  /** How far back the phone looks for "last opened". */
  windowDays: 180,
  /** An app name and a subscription name must share at least this many letters to match. */
  minMatchLength: 4
} as const;
