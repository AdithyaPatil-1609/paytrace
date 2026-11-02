import type { Dataset } from "@/lib/types";

export function alternateDataset(base: Dataset): Dataset {
  return {
    ...base,
    statement: [99, 99, 129, 129].map((debit, index) => ({
      txnId: `ALT-${index}`, persona: "arun", date: `2026-0${index + 6}-10`,
      accountId: "SAV-ARUN-1001", accountType: "savings", narration: `UPI/CLOUDNOTE/REF${index}`,
      debit, reference: `ALTREF${index}`, channel: "UPI", txnKind: "debit"
    })),
    notifications: [], usage: [], mandates: [],
    dictionary: [{ ...base.dictionary[0], pattern: "CLOUDNOTE", brand: "CloudNote", product: "CloudNote Plus",
      category: "software", oneLiner: "Synthetic note-taking plan for the second demo customer.",
      mechanism: "upi_autopay", cancelMode: "normal", stopTheService: "Open CloudNote settings and cancel Plus.",
      stopTheMoney: "Open your payment app and revoke the CloudNote mandate.",
      trap: "A pause may keep automatic renewal enabled.", ifTheyStaySilent: "Keep confirmation and contact the payment provider if another debit appears." }]
  };
}
