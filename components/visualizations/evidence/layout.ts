import { matchDictionary } from "@/lib/payments/engine";
import { formatDate, formatINR } from "@/lib/presentation/format";
import type { Commitment, DictionaryEntry } from "@/lib/payments/types";

export type EvidenceNode = {
  id: string;
  kind: "debit" | "message" | "mandate" | "pattern";
  label: string;
  caption: string;
  detail: string;
  x: number;
  y: number;
  relationship: string;
};

export function layoutEvidence(item: Commitment, dictionary: DictionaryEntry[]) {
  const pattern = item.inDictionary ? matchDictionary(item.rawNarration, dictionary) : undefined;
  const debits =
    item.evidenceRows.length > 7
      ? [...item.evidenceRows.slice(0, 3), ...item.evidenceRows.slice(-4)]
      : item.evidenceRows;
  const messages =
    item.notices.length > 5
      ? [...item.notices.slice(0, 2), ...item.notices.slice(-3)]
      : item.notices;
  const nodes: EvidenceNode[] = [
    ...debits.map((row, index): EvidenceNode => {
      const angle =
        ((debits.length === 1 ? 180 : 120 + (index * 120) / (debits.length - 1)) * Math.PI) / 180;
      return {
        id: row.txnId,
        kind: "debit",
        label: formatINR(row.amount),
        caption: row.date,
        detail: `${formatDate(row.date)} · ${row.narration} · ${row.account} · Reference: ${row.reference || "not supplied"}`,
        x: 450 + 300 * Math.cos(angle),
        y: 350 + 300 * Math.sin(angle),
        relationship: "charged"
      };
    }),
    ...messages.map((row, index): EvidenceNode => {
      const angle =
        ((messages.length === 1 ? -35 : -80 + (index * 90) / (messages.length - 1)) * Math.PI) /
        180;
      return {
        id: row.noticeId,
        kind: "message",
        label: row.channel.toUpperCase(),
        caption: row.sentOn,
        detail: `${row.sender} · ${row.eventType} · ${row.text}`,
        x: 450 + 300 * Math.cos(angle),
        y: 350 + 300 * Math.sin(angle),
        relationship: "message"
      };
    }),
    ...(item.mandateRef
      ? [
          {
            id: item.mandateRef,
            kind: "mandate" as const,
            label: "Mandate",
            caption: item.mandateStatus ?? "unknown",
            detail: `${item.instrument} · ${item.mandateStatus ?? "status unknown"} · ${item.mandateRef}`,
            x: 740,
            y: 535,
            relationship: "mandate"
          }
        ]
      : []),
    ...(pattern
      ? [
          {
            id: pattern.pattern,
            kind: "pattern" as const,
            label: "Pattern",
            caption: item.category,
            detail: `${pattern.pattern} → ${pattern.brand}. ${pattern.oneLiner}`,
            x: 450,
            y: 670,
            relationship: "matches"
          }
        ]
      : [])
  ];
  const words = item.merchant.split(" ");
  const split = Math.ceil(words.length / 2);
  const name =
    item.merchant.length > 17
      ? [words.slice(0, split).join(" "), words.slice(split).join(" ")].filter(Boolean)
      : [item.merchant];
  return { nodes, name, debits, messages, pattern };
}
