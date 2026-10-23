import type {
  AmountPattern,
  Bucket,
  Cadence,
  Commitment,
  CommitmentKind,
  Dataset,
  DateConfidence,
  DictionaryEntry,
  EvidenceRow,
  Instrument,
  Mechanism,
  NoticeRow,
  Signal,
  SpendGroup,
  StatementRow
} from "./types";

const DAY = 24 * 60 * 60 * 1000;
/** A service unopened for this long is a zombie. */
export const ZOMBIE_DAYS = 90;

const instrumentByMechanism: Record<Mechanism, Instrument> = {
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

function days(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function addYears(date: string, count: number) {
  const next = new Date(Date.parse(date));
  next.setUTCFullYear(next.getUTCFullYear() + count);
  return next.toISOString().slice(0, 10);
}

function addDays(date: string, count: number) {
  return new Date(Date.parse(date) + count * DAY).toISOString().slice(0, 10);
}

/**
 * The dictionary is hand written, so the longest matching pattern wins.
 * That keeps PAYPAL *SPOTIFY apart from the Indian SPOTIFY descriptor.
 */
export function matchDictionary(narration: string, dictionary: DictionaryEntry[]) {
  const haystack = narration.toUpperCase();
  return [...dictionary]
    .filter((entry) => entry.pattern && haystack.includes(entry.pattern.toUpperCase()))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
}

function cadenceFromGaps(gaps: number[], fallback: string | undefined): { cadence: Cadence; irregular: boolean } {
  if (gaps.length === 0) {
    const frequency = (fallback ?? "monthly").toLowerCase();
    if (frequency === "annual") return { cadence: "annual", irregular: false };
    if (frequency === "irregular") return { cadence: "irregular", irregular: true };
    return { cadence: "monthly", irregular: false };
  }

  const centre = median(gaps);
  const spread = Math.sqrt(gaps.reduce((sum, gap) => sum + (gap - centre) ** 2, 0) / gaps.length);
  // Uneven dates are still a commitment. Society is the case this protects.
  const irregular = gaps.length >= 2 && centre > 0 && spread / centre > 0.35;
  if (irregular) return { cadence: "irregular", irregular: true };
  if (centre <= 10) return { cadence: "weekly", irregular: false };
  if (centre <= 45) return { cadence: "monthly", irregular: false };
  if (centre <= 135) return { cadence: "quarterly", irregular: false };
  return { cadence: "annual", irregular: false };
}

function amountShape(amounts: number[]): { pattern: AmountPattern; previous?: number } {
  const distinct = new Set(amounts);
  if (distinct.size === 1) return { pattern: "fixed" };

  // A step is one price, then another price that stays. Anything else varies.
  for (let index = 1; index < amounts.length; index += 1) {
    const head = amounts.slice(0, index);
    const tail = amounts.slice(index);
    if (new Set(head).size === 1 && new Set(tail).size === 1 && head[0] !== tail[0]) {
      return { pattern: "step", previous: head[0] };
    }
  }
  return { pattern: "variable" };
}

function multiplierFor(cadence: Cadence) {
  if (cadence === "weekly") return 52;
  if (cadence === "monthly") return 12;
  if (cadence === "quarterly") return 4;
  return 1;
}

function projectYear(cadence: Cadence, pattern: AmountPattern, amounts: number[], latest: number) {
  // An irregular row is the money that actually left over the window.
  if (cadence === "irregular") return amounts.reduce((sum, value) => sum + value, 0);
  if (cadence === "annual") return latest;
  if (pattern === "variable") return Math.round(median(amounts)) * multiplierFor(cadence);
  return latest * multiplierFor(cadence);
}

/** The spend group answers "where does the money go", not "should it stop". */
function spendGroupFor(mechanism: Mechanism, category: string): SpendGroup {
  if (mechanism === "emi_ach") return "debt";
  if (mechanism === "enach" || category === "insurance") return "insurance";
  if (mechanism === "bbps" || mechanism === "neft_standing") return "utilities";
  return "subscriptions";
}

/** A varying amount or an uneven date is never presented as a firm date. */
function confidenceFor(cadence: Cadence, pattern: AmountPattern): DateConfidence {
  if (cadence === "irregular") return "unknown";
  if (pattern === "variable") return "estimated";
  return "confirmed";
}

function bucketFor(kind: CommitmentKind, mechanism: Mechanism): Bucket {
  if (kind === "debt") return "debt";
  if (mechanism === "enach" || mechanism === "bbps" || mechanism === "neft_standing") return "bills";
  if (kind === "unused") return "unused";
  if (kind === "trial") return "review";
  return "used";
}

type Group = {
  key: string;
  narration: string;
  entry?: DictionaryEntry;
  rows: StatementRow[];
  holds: StatementRow[];
};

function toEvidence(row: StatementRow): EvidenceRow {
  return {
    txnId: row.txnId,
    date: row.date,
    narration: row.narration,
    amount: row.debit ?? 0,
    reference: row.reference,
    channel: row.channel,
    account: row.accountId
  };
}

/**
 * Every commitment on every screen comes out of this function. Nothing about a
 * merchant is hard coded: the grouping, the signals, the year, and the cancel
 * copy are all computed from the statement, the notices, the usage file, the
 * mandate register, and the hand-written dictionary.
 */
export function detectCommitments(dataset: Dataset): Commitment[] {
  const { asOf, statement, notifications, usage, mandates, dictionary } = dataset;
  const groups = new Map<string, Group>();

  for (const row of statement) {
    if (!row.debit || row.debit <= 0) continue; // Salary and card repayments are credits.
    const entry = matchDictionary(row.narration, dictionary);
    const key = `${entry ? entry.pattern : row.narration}|${row.accountId}`;
    const group = groups.get(key) ?? { key, narration: row.narration, entry, rows: [], holds: [] };
    // The ₹1 hold belongs to its commitment as evidence, never as its own price.
    if (row.txnKind === "authorisation") group.holds.push(row);
    else group.rows.push(row);
    groups.set(key, group);
  }

  const commitments: Commitment[] = [];

  for (const group of groups.values()) {
    const entry = group.entry;
    if (entry?.cancelMode === "exclude") continue; // A food order and a transfer to a person.

    const rows = [...group.rows].sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length === 0) continue;

    const mandate = mandates.find(
      (item) => item.narration === group.narration || (entry && item.brand === entry.brand)
    );
    // One debit is a purchase. Two debits, or one debit under a live mandate, is a commitment.
    if (rows.length < 2 && !mandate) continue;

    const dates = rows.map((row) => row.date);
    const amounts = rows.map((row) => row.debit ?? 0);
    const gaps = dates.slice(1).map((date, index) => days(dates[index], date));
    const { cadence } = cadenceFromGaps(gaps, mandate?.frequency);
    const { pattern, previous } = amountShape(amounts);
    const latest = amounts[amounts.length - 1];
    const headline = pattern === "variable" ? Math.round(median(amounts)) : latest;
    const annualCost = projectYear(cadence, pattern, amounts, latest);

    const notices: NoticeRow[] = notifications
      .filter((notice) => {
        const byTxn = notice.relatedTxnId && rows.some((row) => row.txnId === notice.relatedTxnId);
        const byHold = notice.relatedTxnId && group.holds.some((row) => row.txnId === notice.relatedTxnId);
        const byBrand = entry ? notice.brand === entry.brand : false;
        return Boolean(byTxn || byHold || byBrand);
      })
      .map((notice) => ({
        noticeId: notice.noticeId,
        sentOn: notice.sentOn,
        channel: notice.channel,
        sender: notice.sender,
        eventType: notice.eventType,
        amount: notice.amount,
        text: notice.text
      }))
      .sort((a, b) => a.sentOn.localeCompare(b.sentOn));

    const usageRow = entry ? usage.find((item) => item.brand === entry.brand) : undefined;
    const lastOpened = usageRow?.lastOpened || undefined;
    const openedDaysAgo = lastOpened ? days(lastOpened, asOf) : undefined;
    const neverOpened = Boolean(usageRow) && !lastOpened && usageRow?.opensLast12Months === 0;

    const hasPriceChangeNotice = notices.some((notice) => notice.eventType === "price_change");
    const hasTrialNotice = notices.some((notice) => notice.eventType === "trial_ending");
    const mechanism: Mechanism = entry?.mechanism ?? mandate?.mechanism ?? "none";

    const signals: Signal[] = [];
    // The hike is silent because the price moved and no message said so.
    if (pattern === "step" && latest > (previous ?? latest) && !hasPriceChangeNotice) signals.push("silent_hike");
    if (hasTrialNotice) signals.push("trial_converted");
    if ((openedDaysAgo ?? 0) > ZOMBIE_DAYS || neverOpened) signals.push("zombie");
    if (cadence === "annual") signals.push("annual_next_date");
    if (pattern === "variable") signals.push("variable_amount");
    if (cadence === "irregular") signals.push("irregular_interval");
    if (entry?.cancelMode === "warn" || entry?.cancelMode === "block") signals.push("obligation");
    if (rows.length === 1 && mandate) signals.push("new");
    if (signals.length === 0) signals.push("none");

    const kind: CommitmentKind =
      mechanism === "emi_ach"
        ? "debt"
        : signals.includes("zombie")
          ? "unused"
          : signals.includes("trial_converted")
            ? "trial"
            : signals.includes("silent_hike")
              ? "silent"
              : "essential";

    const nextCharge =
      cadence === "annual"
        ? addYears(dates[dates.length - 1], 1)
        : cadence === "irregular"
          ? undefined
          : addDays(dates[dates.length - 1], Math.round(median(gaps.length ? gaps : [30])));

    const sources = new Set(notices.map((notice) => notice.channel));
    const whyRecurring = buildWhyRecurring(rows.length, cadence, pattern, gaps, Boolean(mandate));
    const issue = buildIssue(signals, { lastOpened, previous, latest, openedDaysAgo });

    commitments.push({
      id: slug(entry?.brand ?? group.narration),
      rawNarration: group.narration,
      merchant: entry?.brand ?? group.narration,
      product: entry?.product ?? "Not in the dictionary yet",
      category: entry?.category ?? "unknown",
      instrument: instrumentByMechanism[mechanism],
      mechanism,
      cadence,
      amountPattern: pattern,
      amount: headline,
      previousAmount: previous,
      annualCost,
      debitCount: rows.length,
      firstCharge: dates[0],
      lastCharge: dates[dates.length - 1],
      nextCharge,
      lastOpened,
      lastOpenedMonthsAgo: openedDaysAgo === undefined ? undefined : Math.floor(openedDaysAgo / 30),
      opensLast12Months: usageRow?.opensLast12Months,
      kind,
      bucket: bucketFor(kind, mechanism),
      signals,
      whyRecurring,
      evidence: issue ?? whyRecurring,
      evidenceRows: rows.map(toEvidence),
      notices,
      hasPriceChangeNotice,
      holds: group.holds.map(toEvidence),
      status: statusFor(signals, kind),
      canCancel: entry?.cancelMode !== "block",
      cancelMode: entry?.cancelMode ?? "normal",
      cancellationPath: entry ? `${entry.stopTheService} ${entry.stopTheMoney}` : undefined,
      source: sources.has("email") ? "SMS and email" : "SMS",
      plainDescription: entry?.oneLiner ?? "This string is not in the dictionary yet. Name it by hand.",
      issue,
      stopService: entry?.stopTheService ?? "Not in the dictionary yet.",
      stopMoney: entry?.stopTheMoney ?? "Not in the dictionary yet.",
      ifSilent: entry?.ifTheyStaySilent ?? "Not in the dictionary yet.",
      trap: entry?.trap || undefined,
      mandateRef: mandate?.mandateRef,
      mandateStatus: mandate?.status,
      spendGroup: spendGroupFor(mechanism, entry?.category ?? ""),
      dateConfidence: confidenceFor(cadence, pattern),
      priceSeries: rows.map((row) => ({ date: row.date, amount: row.debit ?? 0 })),
      inDictionary: Boolean(entry)
    });
  }

  return commitments.sort((a, b) => b.annualCost - a.annualCost);
}

function buildWhyRecurring(count: number, cadence: Cadence, pattern: AmountPattern, gaps: number[], mandate: boolean) {
  if (count < 2 && mandate) return "One debit so far, under a mandate that is still active. The mandate is what makes it recurring.";
  const centre = gaps.length ? Math.round(median(gaps)) : 0;
  const rhythm =
    cadence === "irregular"
      ? `${count} debits on uneven dates, ${Math.min(...gaps)} to ${Math.max(...gaps)} days apart`
      : `${count} debits about ${centre} days apart`;
  const money =
    pattern === "fixed"
      ? "the same amount every time"
      : pattern === "step"
        ? "one amount, then a second amount that stayed"
        : "a different amount each time";
  return `${rhythm}, ${money}. The interval holds, so the grouping keeps it.`;
}

function buildIssue(
  signals: Signal[],
  context: { lastOpened?: string; previous?: number; latest: number; openedDaysAgo?: number }
) {
  if (signals.includes("silent_hike")) {
    return `₹${context.previous} became ₹${context.latest}. Debit messages exist. A price-change message does not.`;
  }
  if (signals.includes("trial_converted")) return "A trial-ending notice, then the paid price. The ₹1 hold is not the price.";
  if (signals.includes("zombie")) {
    return context.lastOpened
      ? `Last opened ${context.lastOpened}, about ${Math.floor((context.openedDaysAgo ?? 0) / 30)} months ago. The charge did not stop.`
      : "Never opened in the last twelve months. A pack she did not go looking for.";
  }
  return undefined;
}

function statusFor(signals: Signal[], kind: CommitmentKind) {
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

export const spendGroupLabels: Record<SpendGroup, string> = {
  subscriptions: "Subscriptions and apps",
  utilities: "Utilities and maintenance",
  insurance: "Insurance",
  debt: "Loan"
};

export const bucketLabels: Record<Bucket, string> = {
  unused: "Unused",
  review: "Review",
  used: "Still used",
  bills: "Bills",
  debt: "Debt"
};

export const bucketCopy: Record<Bucket, string> = {
  unused: "Still debiting for things she does not use.",
  review: "A trial that became a paid plan. Worth a decision.",
  used: "Services she still opens.",
  bills: "A bill or a premium. The autopay can stop; the amount due does not.",
  debt: "A loan repayment. This prototype has no cancel button for it."
};
