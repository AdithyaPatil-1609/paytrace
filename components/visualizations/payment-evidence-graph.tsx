"use client";

import { useState } from "react";
import { PaymentDiagram } from "./evidence/diagram";
import { formatINR } from "@/lib/presentation/format";
import type { Commitment, DictionaryEntry } from "@/lib/payments/types";

export function PaymentEvidenceExplorer({
  items,
  dictionary,
  live,
  onOpen
}: {
  items: Commitment[];
  dictionary: DictionaryEntry[];
  live: boolean;
  onOpen: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const selected = items.find((item) => item.id === selectedId) ?? items[0];
  const visible = items.filter((item) =>
    `${item.merchant} ${item.product} ${item.rawNarration}`
      .toLowerCase()
      .includes(search.toLowerCase().trim())
  );
  if (!selected)
    return (
      <p className="evidence-explorer-empty">No recurring payments are available to explore.</p>
    );
  return (
    <div className="payment-evidence-explorer">
      <aside className="evidence-picker" aria-label="Pick a payment">
        <label htmlFor="evidence-payment-search">PICK A PAYMENT</label>
        <input
          id="evidence-payment-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a service or bank description"
        />
        <div className="evidence-picker-list">
          {visible.map((item) => (
            <button
              key={item.id}
              className={selected.id === item.id ? "selected" : ""}
              aria-pressed={selected.id === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              <strong>{item.merchant}</strong>
              <span>
                {formatINR(item.amount)} · {item.evidenceRows.length} debits · {item.notices.length}{" "}
                messages
              </span>
              {items.filter((entry) => entry.merchant === item.merchant).length > 1 && (
                <small>
                  {item.evidenceRows[0]?.account} · {item.rawNarration}
                </small>
              )}
            </button>
          ))}
        </div>
        {visible.length === 0 && (
          <p className="evidence-picker-empty" role="status">
            No payments match your search.
          </p>
        )}
      </aside>
      <PaymentDiagram
        key={selected.id}
        item={selected}
        dictionary={dictionary}
        live={live}
        onOpen={() => onOpen(selected.id)}
      />
    </div>
  );
}
