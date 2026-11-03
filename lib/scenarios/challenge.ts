import { detectCommitments } from "@/lib/payments/engine";
import { RULES } from "@/lib/payments/rules";
import type { Commitment, Dataset } from "@/lib/payments/types";

export const challengeActions = [
  "matching_notice",
  "old_notice",
  "recent_usage",
  "descriptor_change",
  "merchant_correction"
] as const;
export type ChallengeAction = (typeof challengeActions)[number];
export type ChallengeRequest = {
  commitmentId: string;
  action: ChallengeAction;
  merchantName?: string;
};
export type ChallengeResult = {
  before: Commitment;
  after: Commitment[];
  changes: string[];
  engine: "neo4j" | "offline";
};
export class ChallengeInputError extends Error {}

export function prepareChallenge(
  dataset: Dataset,
  item: Commitment,
  action: ChallengeAction,
  merchantName?: string
) {
  const ids = new Set(item.evidenceRows.map((row) => row.txnId));
  const patch: Pick<Dataset, "statement" | "notifications" | "usage" | "dictionary" | "mandates"> =
    { statement: [], notifications: [], usage: [], dictionary: [], mandates: [] };
  const changes: string[] = [];
  if (action === "matching_notice" || action === "old_notice") {
    const change = item.priceSeries.find((point) => point.amount !== item.priceSeries[0]?.amount);
    if (!change || item.previousAmount === undefined || item.amount <= item.previousAmount)
      throw new ChallengeInputError("Choose a payment with a recorded price increase.");
    const transaction = item.evidenceRows.find(
      (row) => row.date === change.date && row.amount === change.amount
    )!;
    if (!transaction)
      throw new ChallengeInputError("No matching debit supports this price change.");
    const old = action === "old_notice";
    const sentOn = new Date(
      Date.parse(change.date) - (old ? RULES.noticeWindowDays + 90 : 1) * 86400000
    )
      .toISOString()
      .slice(0, 10);
    const amount = old ? item.previousAmount : item.amount;
    patch.notifications = [
      {
        noticeId: `PT-CHALLENGE-${action}-${transaction.txnId}`,
        sentOn,
        channel: "email",
        sender: "synthetic@paytrace.demo",
        eventType: "price_change",
        brand: item.merchant,
        relatedTxnId: transaction.txnId,
        amount,
        text: `Synthetic test notice: the plan price is Rs ${amount}.`
      }
    ];
    changes.push(
      `Added a synthetic notice dated ${sentOn} for ₹${amount}, linked to debit ${transaction.txnId}.`,
      old
        ? `It is outside the ${RULES.noticeWindowDays}-day matching window and refers to the earlier price.`
        : "It matches the increased amount and arrives within the matching window."
    );
  } else if (action === "recent_usage") {
    if (!item.inDictionary)
      throw new ChallengeInputError("Identify the merchant before testing its usage.");
    patch.usage = [
      {
        brand: item.merchant,
        lastOpened: dataset.asOf,
        opensLast12Months: Math.max(1, item.opensLast12Months ?? 0)
      }
    ];
    changes.push(
      `Added a synthetic service opening on ${dataset.asOf}. This is a hypothetical usage record, not an actual app visit.`
    );
  } else if (action === "descriptor_change") {
    patch.statement = dataset.statement
      .filter((row) => ids.has(row.txnId))
      .map((row, index) => ({ ...row, narration: `${row.narration}/TEST-REF-${index + 1}` }));
    if (!patch.statement.length)
      throw new ChallengeInputError("No matching statement records are available.");
    changes.push(
      "Appended a different synthetic reference to each original bank description. Amounts, dates and accounts are unchanged."
    );
  } else if (action === "merchant_correction") {
    const name = merchantName?.trim();
    if (item.inDictionary)
      throw new ChallengeInputError("This payment already has a known merchant pattern.");
    if (!name || name.length < 2 || name.length > 60)
      throw new ChallengeInputError("Enter a synthetic merchant name between 2 and 60 characters.");
    if (dataset.dictionary.some((entry) => entry.brand.toLowerCase() === name.toLowerCase()))
      throw new ChallengeInputError(
        "Use a distinct synthetic name to avoid combining existing services."
      );
    patch.dictionary = [
      {
        pattern: item.rawNarration,
        brand: name,
        product: name,
        category: item.category,
        oneLiner: "Synthetic user-supplied merchant label; unverified.",
        mechanism: item.mechanism,
        cancelMode: item.cancelMode,
        stopTheService: item.stopService,
        stopTheMoney: item.stopMoney,
        trap: item.trap ?? "",
        ifTheyStaySilent: item.ifSilent
      }
    ];
    changes.push(
      `Added a hypothetical merchant mapping: ${item.rawNarration} → ${name}. This does not verify the merchant's identity.`
    );
  } else throw new ChallengeInputError("Unsupported challenge action.");
  return {
    patch,
    changes,
    dataset: {
      ...dataset,
      statement: dataset.statement.map(
        (row) => patch.statement.find((changed) => changed.txnId === row.txnId) ?? row
      ),
      notifications: [...dataset.notifications, ...patch.notifications],
      usage: [
        ...dataset.usage.filter(
          (row) => !patch.usage.some((changed) => changed.brand === row.brand)
        ),
        ...patch.usage
      ],
      dictionary: [...dataset.dictionary, ...patch.dictionary]
    }
  };
}

export function challengeMatches(items: Commitment[], before: Commitment) {
  const ids = new Set(before.evidenceRows.map((row) => row.txnId));
  return items.filter((item) => item.evidenceRows.some((row) => ids.has(row.txnId)));
}

export function runOfflineChallenge(
  dataset: Dataset,
  item: Commitment,
  action: ChallengeAction,
  merchantName?: string
): ChallengeResult {
  const prepared = prepareChallenge(dataset, item, action, merchantName);
  return {
    before: item,
    after: challengeMatches(detectCommitments(prepared.dataset), item),
    changes: prepared.changes,
    engine: "offline"
  };
}
