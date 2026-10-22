import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv";
import type {
  Dataset,
  DictionaryEntry,
  MandateRow,
  Mechanism,
  NotificationRow,
  StatementRow,
  UsageRow,
  CancelMode
} from "./types";

/** The fixture's as-of date. Every "last opened" and "next charge" is read against it. */
export const AS_OF = "2026-10-22";

const rawDirectory = path.join(process.cwd(), "data", "raw");

function read(file: string) {
  return parseCsv(readFileSync(path.join(rawDirectory, file), "utf8"));
}

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function readStatement(file = "statement.csv"): StatementRow[] {
  return read(file).map((row) => ({
    txnId: row.txn_id,
    persona: row.persona,
    date: row.date,
    accountId: row.account_id,
    accountType: row.account_type,
    narration: row.narration,
    debit: toNumber(row.debit_inr),
    credit: toNumber(row.credit_inr),
    reference: row.reference,
    channel: row.channel,
    txnKind: row.txn_kind
  }));
}

export function readNotifications(): NotificationRow[] {
  return read("notifications.csv").map((row) => ({
    noticeId: row.notice_id,
    sentOn: row.sent_on,
    channel: row.channel === "email" ? "email" : "sms",
    sender: row.sender,
    eventType: row.event_type,
    brand: row.merchant_brand,
    relatedTxnId: row.related_txn_id || undefined,
    amount: toNumber(row.amount_inr),
    text: row.raw_text
  }));
}

export function readUsage(): UsageRow[] {
  return read("usage.csv").map((row) => ({
    brand: row.brand,
    lastOpened: row.last_opened || undefined,
    opensLast12Months: toNumber(row.opens_last_12_months) ?? 0
  }));
}

export function readMandates(): MandateRow[] {
  return read("mandates.csv").map((row) => ({
    mandateId: row.mandate_id,
    createdOn: row.created_on,
    mechanism: row.mechanism as Mechanism,
    narration: row.narration,
    brand: row.brand,
    maxAmount: toNumber(row.max_amount_inr) ?? 0,
    frequency: row.frequency,
    mandateRef: row.mandate_ref,
    accountId: row.account_id,
    status: row.status_as_of_2026_10_22
  }));
}

export function readDictionary(): DictionaryEntry[] {
  return read("merchant-dictionary.csv").map((row) => ({
    pattern: row.pattern,
    brand: row.brand,
    product: row.product,
    category: row.category,
    oneLiner: row.one_liner,
    mechanism: row.mechanism as Mechanism,
    cancelMode: (row.cancel_mode || "normal") as CancelMode,
    stopTheService: row.stop_the_service,
    stopTheMoney: row.stop_the_money,
    trap: row.trap,
    ifTheyStaySilent: row.if_they_stay_silent
  }));
}

/** One click loads Priya: statement, notices, mandates, usage, and the dictionary. */
export function loadFixtures(): Dataset {
  return {
    asOf: AS_OF,
    statement: readStatement(),
    notifications: readNotifications(),
    usage: readUsage(),
    mandates: readMandates(),
    dictionary: readDictionary()
  };
}

/** The six PayPal rows. They must become two commitments, and they are not Priya's year. */
export function loadParserFixtures(): Dataset {
  return {
    asOf: AS_OF,
    statement: readStatement("parser-fixtures.csv"),
    notifications: [],
    usage: [],
    mandates: [],
    dictionary: readDictionary()
  };
}
