"use client";
/**
 * Groups that repeat on the statement but are everyday spending (the same
 * supermarket every month), as judged by the local model within the rules in
 * lib/payments/recurring-check.ts. Listed, never dropped, and the person can
 * put any of them back on the recurring list.
 */
import { useState } from "react";
import { formatDate, formatINR } from "@/lib/presentation/format";

export type EverydayRow = { id: string; merchant: string; rawNarration: string; kind: string; debitCount: number; amount: number; amountPattern: string; lastCharge: string; spentToDate: number };

const KIND: Record<string, string> = { groceries: "Groceries", food: "Food and drink", fuel: "Fuel", transport: "Travel", shopping: "Shopping", pharmacy: "Pharmacy", transfer: "Transfers" };

export function EverydaySpending({ rows, onChange }: { rows: EverydayRow[]; onChange: () => void }) {
  const [state, setState] = useState<Record<string, string>>({});
  if (!rows.length) return null;
  async function keep(id: string) {
    setState((s) => ({ ...s, [id]: "Saving…" }));
    const response = await fetch("/api/account/recurring-check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commitmentId: id }) }).catch(() => null);
    setState((s) => ({ ...s, [id]: response?.ok ? "Moved back" : "Could not save; retry" }));
    if (response?.ok) onChange();
  }
  return <details className="personal-activity watchlist">
    <summary>Everyday spending, not counted as recurring <small>{rows.length} {rows.length === 1 ? "place" : "places"} you pay often</small></summary>
    <p>These repeat on your statement, but they look like shops and services you choose each time, not payments you signed up for. A local AI model checked each one; anything with an autopay, a renewal notice or a known plan always stays recurring. If one is a real subscription, put it back.</p>
    <div className="account-table">
      {rows.map((row) => <div key={row.id}>
        <span>
          <strong>{row.merchant}</strong>
          <small>{KIND[row.kind] ?? "Everyday spending"} · {row.debitCount} payments · latest {formatDate(row.lastCharge)}</small>
          <small><button type="button" className="link-button" disabled={Boolean(state[row.id])} onClick={() => void keep(row.id)}>It is recurring</button>{state[row.id] && <em role="status"> {state[row.id]}</em>}</small>
        </span>
        <strong>{formatINR(row.spentToDate)} so far</strong>
      </div>)}
    </div>
  </details>;
}
