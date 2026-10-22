import type { Dataset, MandateRow, NotificationRow, StatementRow } from "@/lib/types";

/**
 * Simulate new autopay. The button does not append a finished commitment: it
 * appends the rows a real new mandate would leave behind — one statement line,
 * one mandate, and the two SMS — and detection runs again over the larger
 * fixture. Headspace therefore earns its place on the screens the same way
 * every other row does.
 */
export const simulatedStatement: StatementRow = {
  txnId: "TXN-SIM-0001",
  persona: "priya",
  date: "2026-10-22",
  accountId: "SAV-PRIYA-9912",
  accountType: "savings",
  narration: "UPI/HEADSPACE/7712003344",
  debit: 299,
  reference: "ARCSIM000001",
  channel: "UPI",
  txnKind: "debit_purchase"
};

export const simulatedMandate: MandateRow = {
  mandateId: "MDT-SIM-01",
  createdOn: "2026-10-22",
  mechanism: "upi_autopay",
  narration: "UPI/HEADSPACE/7712003344",
  brand: "Headspace Plus",
  maxAmount: 299,
  frequency: "monthly",
  mandateRef: "UMN-sim-headspace-01",
  accountId: "SAV-PRIYA-9912",
  status: "active"
};

export const simulatedNotices: NotificationRow[] = [
  {
    noticeId: "NTC-SIM-01",
    sentOn: "2026-10-22",
    channel: "sms",
    sender: "ARCLIGHT",
    eventType: "mandate_created",
    brand: "Headspace Plus",
    amount: 299,
    text: "UPI Autopay mandate created for Rs 299.00 towards HEADSPACE. UMN sim-headspace-01. Status Active. -ARCLIGHT BANK"
  },
  {
    noticeId: "NTC-SIM-02",
    sentOn: "2026-10-22",
    channel: "sms",
    sender: "ARCLIGHT",
    eventType: "debit_sms",
    brand: "Headspace Plus",
    relatedTxnId: "TXN-SIM-0001",
    amount: 299,
    text: "Rs 299.00 debited from A/c XX9912 on 22-10-26 for UPI/HEADSPACE/7712003344. Ref ARCSIM000001. -ARCLIGHT BANK"
  }
];

export function withSimulatedAutopay(dataset: Dataset): Dataset {
  // A second click must not add a second copy.
  if (dataset.statement.some((row) => row.txnId === simulatedStatement.txnId)) return dataset;
  return {
    ...dataset,
    statement: [...dataset.statement, simulatedStatement],
    mandates: [...dataset.mandates, simulatedMandate],
    notifications: [...dataset.notifications, ...simulatedNotices]
  };
}
