import type { Dataset, DictionaryEntry, MandateRow, NotificationRow, StatementRow } from "@/lib/types";

export const simulationMerchant = "Lumen Notes";

export const simulatedStatements: StatementRow[] = [99, 99, 129, 129].map((debit, index) => ({
  txnId: `TXN-SIM-${index + 1}`,
  persona: "priya",
  date: `2026-0${index + 6}-10`,
  accountId: "SAV-PRIYA-9912",
  accountType: "savings",
  narration: ["UPI/LUMEN/NOTES/REF601", "UPI/LUMEN/NOTES/REF702", "AUTOPAY/LUMEN/NOTES/REF803", "AUTOPAY/LUMEN/NOTES/REF904"][index],
  debit,
  reference: `ARCSIM00000${index + 1}`,
  channel: "UPI",
  txnKind: "debit_purchase"
}));

export const simulatedPattern: DictionaryEntry = {
  pattern: "LUMEN/NOTES", brand: simulationMerchant, product: "Lumen Notes Plus", category: "software",
  oneLiner: "A synthetic note-taking subscription with changing bank descriptors.",
  mechanism: "upi_autopay", cancelMode: "normal",
  stopTheService: "Open the synthetic Lumen Notes account, then Settings, Plan, Cancel renewal.",
  stopTheMoney: "In your payment app, review the Lumen Notes automatic payment and revoke its permission.",
  trap: "Pausing the service may leave automatic renewal enabled.",
  ifTheyStaySilent: "Keep your cancellation confirmation and contact the payment provider if another debit appears."
};

export const simulatedMandate: MandateRow = {
  mandateId: "MDT-SIM-01", createdOn: "2026-01-01", mechanism: "upi_autopay",
  narration: simulatedStatements[0].narration, brand: simulationMerchant, maxAmount: 199,
  frequency: "monthly", mandateRef: "UMN-sim-lumen-01", accountId: "SAV-PRIYA-9912", status: "active"
};

export const simulatedNotices: NotificationRow[] = [
  { noticeId: "NTC-SIM-OLD", sentOn: "2026-01-15", channel: "email", sender: "lumen@demo.test",
    eventType: "price_change", brand: simulationMerchant, amount: 99,
    text: "Your Lumen Notes plan will cost Rs 99 monthly from February 2026. You can manage renewal in your account settings." },
  ...simulatedStatements.map((row, index): NotificationRow => ({
    noticeId: `NTC-SIM-DEBIT-${index + 1}`, sentOn: row.date, channel: "sms", sender: "ARCLIGHT",
    eventType: "debit_sms", brand: simulationMerchant, relatedTxnId: row.txnId, amount: row.debit,
    text: `Rs ${row.debit} debited for ${row.narration}. Reference ${row.reference}. Synthetic record.`
  }))
];

export function withSimulatedAutopay(dataset: Dataset): Dataset {
  return {
    ...dataset,
    statement: [...dataset.statement.filter((row) => !simulatedStatements.some((sample) => sample.txnId === row.txnId)), ...simulatedStatements],
    mandates: [...dataset.mandates.filter((row) => row.mandateId !== simulatedMandate.mandateId), simulatedMandate],
    notifications: [...dataset.notifications.filter((row) => !simulatedNotices.some((sample) => sample.noticeId === row.noticeId)), ...simulatedNotices],
    dictionary: [...dataset.dictionary.filter((row) => row.pattern !== simulatedPattern.pattern), simulatedPattern]
  };
}
