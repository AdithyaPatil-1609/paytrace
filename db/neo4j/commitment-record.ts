import {
  commitmentId,
  describeIssue,
  describeRecurring,
  instrumentByMechanism,
  statusFor
} from "@/lib/payments/rules";
import type {
  AmountPattern,
  Bucket,
  Cadence,
  CancelMode,
  Commitment,
  CommitmentKind,
  DateConfidence,
  EvidenceRow,
  Mechanism,
  NoticeRow,
  Signal,
  SpendGroup
} from "@/lib/payments/types";

function num(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const candidate = value as { toNumber?: () => number };
  if (typeof candidate.toNumber === "function") return candidate.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function asBool(value: unknown) {
  return value === true;
}

function asStrings(value: unknown): Signal[] {
  if (!Array.isArray(value)) return ["none"];
  return value.map((item) => String(item) as Signal);
}

function rowsOf(value: unknown, account: string): EvidenceRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as Record<string, unknown>;
    return {
      txnId: text(item.txnId),
      date: text(item.date),
      narration: text(item.narration),
      amount: num(item.amount) ?? 0,
      reference: text(item.reference),
      channel: text(item.channel),
      account
    };
  });
}

function noticesOf(value: unknown): NoticeRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const item = row as Record<string, unknown>;
      return {
        noticeId: text(item.noticeId),
        sentOn: text(item.sentOn),
        channel: text(item.channel) === "email" ? "email" : "sms",
        sender: text(item.sender),
        eventType: text(item.eventType),
        amount: num(item.amount),
        text: text(item.text)
      } satisfies NoticeRow;
    })
    .sort((a, b) => a.sentOn.localeCompare(b.sentOn));
}

function mechanismOf(value: string): Mechanism {
  const known: Mechanism[] = [
    "upi_autopay",
    "card_recurring",
    "play_store",
    "enach",
    "bbps",
    "neft_standing",
    "vas",
    "emi_ach",
    "none"
  ];
  return known.includes(value as Mechanism) ? (value as Mechanism) : "none";
}

/** Neo4j Record and the test double both expose get(). */
export type AnalysisRecord = { get: (key: string) => unknown };

/** Maps one ANALYSIS row into the commitment the screens render. */
export function commitmentFromAnalysisRecord(record: AnalysisRecord): Commitment {
  const merchant = text(record.get("merchant"));
  const signals = asStrings(record.get("signals"));
  const kind = text(record.get("kind")) as CommitmentKind;
  const cadence = text(record.get("cadence")) as Cadence;
  const amountPattern = text(record.get("amountPattern")) as AmountPattern;
  const mechanism = mechanismOf(text(record.get("mechanism")));
  const account = text(record.get("accountId"));
  const previous = num(record.get("previousAmount"));
  const openedDays = num(record.get("openedDays"));
  const lastOpened = record.get("lastOpened") ? text(record.get("lastOpened")) : undefined;
  const debitCount = num(record.get("debitCount")) ?? 0;
  const evidence = rowsOf(record.get("evidence"), account);
  const issueText = describeIssue(signals, {
    lastOpened,
    previous,
    latest: evidence.at(-1)?.amount ?? num(record.get("amount")) ?? 0,
    openedDaysAgo: openedDays
  });
  const why = describeRecurring({
    count: debitCount,
    cadence,
    pattern: amountPattern,
    gapCentre: num(record.get("gapCentre")) ?? 0,
    gapMin: num(record.get("gapMin")),
    gapMax: num(record.get("gapMax")),
    mandate: asBool(record.get("hasMandate"))
  });
  const cancelMode = (text(record.get("cancelMode")) || "normal") as CancelMode;
  const notices = noticesOf(record.get("noticeRows"));

  return {
    id: commitmentId(
      merchant,
      text(record.get("pattern")),
      account,
      (num(record.get("brandPatterns")) ?? 0) > 1
    ),
    rawNarration: text(record.get("rawNarration")),
    merchant,
    product: text(record.get("product")),
    category: text(record.get("category")),
    instrument: instrumentByMechanism[mechanism],
    mechanism,
    cadence,
    amountPattern,
    amount:
      amountPattern === "variable"
        ? Math.round(num(record.get("amount")) ?? 0)
        : (num(record.get("amount")) ?? 0),
    previousAmount: previous,
    annualCost: num(record.get("annualCost")) ?? 0,
    debitCount,
    firstCharge: text(record.get("firstCharge")),
    startedOn: text(record.get("startedOn")),
    spentToDate: num(record.get("spentToDate")) ?? 0,
    lastCharge: text(record.get("lastCharge")),
    nextCharge: record.get("nextCharge") ? text(record.get("nextCharge")) : undefined,
    lastOpened,
    lastOpenedMonthsAgo: openedDays === undefined ? undefined : Math.floor(openedDays / 30),
    opensLast12Months: num(record.get("opensLast12Months")),
    kind,
    bucket: text(record.get("bucket")) as Bucket,
    signals,
    whyRecurring: why,
    evidence: issueText ?? why,
    evidenceRows: evidence,
    notices,
    hasPriceChangeNotice: asBool(record.get("hasPriceChangeNotice")),
    holds: rowsOf(record.get("holdRows"), account),
    status: statusFor(signals, kind),
    canCancel: cancelMode !== "block",
    cancelMode,
    cancellationPath: record.get("inDictionary")
      ? `${text(record.get("stopService"))} ${text(record.get("stopMoney"))}`
      : undefined,
    source: notices.some((notice) => notice.channel === "email") ? "SMS and email" : "SMS",
    plainDescription: text(record.get("plainDescription")),
    issue: issueText,
    stopService: text(record.get("stopService")),
    stopMoney: text(record.get("stopMoney")),
    ifSilent: text(record.get("ifSilent")),
    trap: text(record.get("trap")) || undefined,
    mandateRef: text(record.get("mandateRef")) || undefined,
    mandateStatus: text(record.get("mandateStatus")) || undefined,
    spendGroup: text(record.get("spendGroup")) as SpendGroup,
    dateConfidence: text(record.get("dateConfidence")) as DateConfidence,
    priceSeries: evidence.map((row) => ({ date: row.date, amount: row.amount })),
    inDictionary: asBool(record.get("inDictionary"))
  };
}
