/**
 * Plan card G4, the 24-hour notice check. A pre-debit notice should reach the
 * person at least 24 hours before the money is taken. Both the CSV engine and
 * the Neo4j warnings call this one function, so they always agree.
 *
 * Notice and debit dates are calendar days, so the longest the gap can be is
 * from the start of the notice day to the end of the debit day. Only when even
 * that longest gap is within the limit is the notice certainly late: in
 * practice, a notice dated on the debit day or after it. A notice the day
 * before may or may not have been in time, so nothing is said. Never guess.
 */
import { NOTICE_TIMING_LIMITS } from "./rules";
import type { NotificationRow } from "./types";

/** Shown with the debit. A late notice is a prompt to check, never a "violation". */
export const LATE_NOTICE_MESSAGE = "This notice may have come late. Check your other messages and your bank.";

const DAY = /^\d{4}-\d{2}-\d{2}/;

/** The most hours that can lie between the notice and the debit, or null when either date is unreadable. */
export function maxNoticeHours(sentOn: string | null | undefined, debitOn: string | null | undefined): number | null {
  if (!sentOn || !debitOn || !DAY.test(sentOn) || !DAY.test(debitOn)) return null;
  const sent = Date.parse(`${sentOn.slice(0, 10)}T00:00:00Z`), debit = Date.parse(`${debitOn.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(sent) || Number.isNaN(debit)) return null;
  return Math.max(0, Math.round((debit - sent) / 3_600_000) + 24);
}

/** True only when the notice certainly arrived less than 24 hours before the debit (or after it). */
export function isLateNotice(sentOn: string | null | undefined, debitOn: string | null | undefined): boolean {
  const hours = maxNoticeHours(sentOn, debitOn);
  return hours != null && hours <= NOTICE_TIMING_LIMITS.minNoticeHours;
}

/** Notice kinds that announce a debit on a stated date. The graph warnings read the same two. */
const DEBIT_NOTICES = new Set(["debit_scheduled", "subscription_renewal"]);

/** The CSV engine's side of the check: a debit or renewal notice row whose stated date came too soon after it. */
export function isLateDebitNotice(row: Pick<NotificationRow, "eventType" | "sentOn" | "renewalDate">): boolean {
  return DEBIT_NOTICES.has(row.eventType) && isLateNotice(row.sentOn, row.renewalDate);
}
