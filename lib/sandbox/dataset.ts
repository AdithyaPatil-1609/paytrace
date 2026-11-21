/**
 * Turns a sandbox into what the five screens show: the synthetic demo
 * person's data, plus every payment event the visitor's messages produced,
 * as the same statement lines, notices and mandates a real bank would leave.
 * Detection then runs over the larger dataset, exactly as for the demo.
 * Also works out the four warnings for each new event.
 */
import { loadFixtures } from "@/data/fixtures";
import { detectCommitments, matchDictionary } from "@/lib/payments/engine";
import type { Dataset, DictionaryEntry, MandateRow, NotificationRow, StatementRow } from "@/lib/payments/types";
import type { Sandbox, SandboxEvent } from "./store";

let base: Dataset | undefined;
function baseDataset() {
  return (base ??= loadFixtures());
}

const letters = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The known merchant a message names, e.g. "GOOGLE*YOUTUBEPREM" or "YouTube Premium" → YouTube. */
export function knownMerchant(merchant: string, dictionary: DictionaryEntry[]) {
  const name = letters(merchant);
  let best: DictionaryEntry | undefined;
  let bestLength = 0;
  for (const entry of dictionary) {
    if (entry.cancelMode === "exclude") continue;
    for (const candidate of [letters(entry.pattern), letters(entry.brand)]) {
      if (candidate.length >= 4 && name.includes(candidate) && candidate.length > bestLength) { best = entry; bestLength = candidate.length; }
    }
  }
  return best;
}

export type SandboxAlert = { n: number; kind: "price_rise" | "unused" | "upcoming" | "after_cancel" | "trial" | "price_notice"; title: string; detail: string };

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const rupees = (paise: number | null) => (paise == null ? "an unknown amount" : `₹${(paise / 100).toLocaleString("en-IN")}`);

export type SandboxView = {
  dataset: Dataset;
  asOf: string;
  alerts: SandboxAlert[];
  counts: { sms: number; email: number; accepted: number; refused: number };
};

export function sandboxView(box: Sandbox | null): SandboxView {
  const start = baseDataset();
  const dictionary = start.dictionary;
  const statement: StatementRow[] = [...start.statement];
  const notifications: NotificationRow[] = [...start.notifications];
  const mandates: MandateRow[] = [...start.mandates];
  const alerts: SandboxAlert[] = [];
  const events = box?.events ?? [];
  let asOf = start.asOf;

  /** The statement line pattern and account the demo person already uses for a merchant. */
  function homeFor(entry: DictionaryEntry | undefined) {
    if (!entry) return null;
    const rows = statement.filter(row => row.debit && matchDictionary(row.narration, dictionary)?.pattern === entry.pattern);
    return rows.sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
  }

  const cancelled = new Map<string, string>();
  for (const item of events) {
    const { event, n } = item;
    if (item.receivedOn > asOf) asOf = item.receivedOn;
    const entry = knownMerchant(event.merchant, dictionary);
    const brand = entry?.brand ?? event.merchant;
    const home = homeFor(entry);
    const accountId = home?.accountId ?? (event.accountHint ? `SBX-${event.accountHint}` : "SBX-ACCOUNT");
    const narration = home?.narration ?? event.merchant;
    const txnId = `SBX-${n}`;
    const notice: NotificationRow = {
      noticeId: `SBX-NTC-${n}`, sentOn: item.receivedOn, channel: item.channel, sender: item.sender,
      eventType: event.kind === "debit_posted" ? "debit_sms" : event.kind, brand,
      ...(event.amountPaise == null ? {} : { amount: event.amountPaise / 100 }),
      text: item.text.slice(0, 400)
    };

    if (event.kind === "debit_posted" && event.amountPaise != null) {
      const previous = statement.filter(row => row.debit && row.accountId === accountId && matchDictionary(row.narration, dictionary)?.pattern === (entry?.pattern ?? "") && row.date <= event.date)
        .sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      statement.push({ txnId, persona: "priya", date: event.date, accountId, accountType: home?.accountType ?? "unknown", narration, debit: event.amountPaise / 100, reference: event.reference ?? txnId, channel: home?.channel ?? "UPI", txnKind: "debit_purchase" });
      notifications.push({ ...notice, relatedTxnId: txnId });
      const amount = event.amountPaise / 100;
      if (previous?.debit && amount > previous.debit) {
        const told = notifications.some(row => row.brand === brand && row.eventType === "price_change");
        alerts.push({ n, kind: "price_rise", title: `Price rise: ${brand}`, detail: `${brand} went from ₹${previous.debit.toLocaleString("en-IN")} to ₹${amount.toLocaleString("en-IN")}${told ? ", and a price notice was received." : ", with no price notice. A silent hike."}` });
      }
      const cancelledOn = cancelled.get(brand);
      if (cancelledOn && cancelledOn <= event.date) {
        alerts.push({ n, kind: "after_cancel", title: `Charged after cancelling: ${brand}`, detail: `${rupees(event.amountPaise)} was taken on ${event.date}, after the autopay was cancelled on ${cancelledOn}. Raise a dispute with the bank; the evidence is in the graph.` });
      }
      const usage = start.usage.find(row => row.brand === brand);
      if (usage && (!usage.lastOpened || usage.lastOpened < addDays(event.date, -90))) {
        alerts.push({ n, kind: "unused", title: `Unused: ${brand}`, detail: `Charged ${rupees(event.amountPaise)}, but last opened ${usage.lastOpened ?? "never"} (${usage.opensLast12Months} opens in a year).` });
      }
    } else if (event.kind === "mandate_created") {
      mandates.push({ mandateId: `SBX-MDT-${n}`, createdOn: event.date, mechanism: entry?.mechanism ?? "upi_autopay", narration, brand, maxAmount: (event.amountPaise ?? 0) / 100, frequency: "monthly", mandateRef: event.reference ?? "", accountId, status: "active" });
      notifications.push(notice);
    } else if (event.kind === "mandate_cancelled") {
      cancelled.set(brand, event.date);
      notifications.push(notice);
    } else if (event.kind === "debit_scheduled") {
      notifications.push({ ...notice, renewalDate: event.date });
      alerts.push({ n, kind: "upcoming", title: `Upcoming debit: ${brand}`, detail: `${rupees(event.amountPaise)} will be taken on ${event.date}. Stop it before then if you do not want it.` });
    } else if (event.kind === "price_change") {
      notifications.push(notice);
      alerts.push({ n, kind: "price_notice", title: `Price change notice: ${brand}`, detail: `The new price is ${rupees(event.amountPaise)}. The next charge will be checked against it.` });
    } else if (event.kind === "trial_ending") {
      notifications.push(notice);
      alerts.push({ n, kind: "trial", title: `Free trial ending: ${brand}`, detail: `The trial ends on ${event.date}; a paid plan starts after that unless it is cancelled.` });
    } else {
      notifications.push(notice);
    }
  }

  const dataset: Dataset = { ...start, asOf, statement, notifications, mandates };
  const log = box?.log ?? [];
  return {
    dataset,
    asOf,
    alerts: alerts.reverse(),
    counts: {
      sms: log.filter(entry => entry.channel === "sms").length,
      email: log.filter(entry => entry.channel === "email").length,
      accepted: log.filter(entry => entry.accepted).length,
      refused: log.filter(entry => !entry.accepted).length
    }
  };
}

/** The commitments the screens will show, for tests and the page. */
export function sandboxCommitments(box: Sandbox | null) {
  return detectCommitments(sandboxView(box).dataset);
}

export type { SandboxEvent };
