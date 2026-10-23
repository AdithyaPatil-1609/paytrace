"use client";

import { useState } from "react";
import { potentialSavings, yearlyTotal } from "@/lib/analysis";
import { formatDate, formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

/**
 * Forgotten commitments, ranked by what they cost over a year, with a
 * what-if selector. Selecting a row changes nothing in the data: it is a
 * projection of what a confirmed stop would be worth.
 */
export function UnusedSavings({
  items,
  onOpen,
  onGoToCancel
}: {
  items: Commitment[];
  onOpen: (id: string) => void;
  onGoToCancel: () => void;
}) {
  const { eligible } = potentialSavings(items, []);
  const [selected, setSelected] = useState<string[]>(eligible.map((item) => item.id));
  const { saved, revisedYear } = potentialSavings(items, selected);
  const year = yearlyTotal(items);
  const widest = Math.max(...eligible.map((item) => item.annualCost), 1);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  }

  if (eligible.length === 0) {
    return (
      <section className="viz-block">
        <p className="viz-empty">Nothing is flagged unused right now.</p>
      </section>
    );
  }

  return (
    <section className="viz-block">
      <figure className="leak-figure">
        <figcaption>Still charging, not being used</figcaption>
        <div className="leak-rows">
          {eligible.map((item) => {
            const on = selected.includes(item.id);
            return (
              <div className={on ? "leak-row on" : "leak-row"} key={item.id}>
                <label>
                  <input type="checkbox" checked={on} onChange={() => toggle(item.id)} />
                  <span>{item.merchant}</span>
                </label>
                <div className="leak-track">
                  <i style={{ width: `${Math.max((item.annualCost / widest) * 100, 3)}%` }} />
                </div>
                <b>{formatINR(item.annualCost)}</b>
                <button className="leak-evidence" onClick={() => onOpen(item.id)}>
                  <em>{formatINR(item.spentToDate)} already gone</em>
                  {item.lastOpened ? `since ${formatDate(item.startedOn)}, last opened ${formatDate(item.lastOpened)}` : `since ${formatDate(item.startedOn)}, never opened`}
                </button>
              </div>
            );
          })}
        </div>
      </figure>

      <div className="whatif">
        <article className="whatif-main">
          <span>If these stop</span>
          <strong>{formatINR(saved)}</strong>
          <small>
            stays in the account over a year. Potential, not saved: it is real once the money actually stops and no
            further debit posts.
          </small>
        </article>
        <article className="whatif-side">
          <span>Year after that</span>
          <strong>{formatINR(revisedYear)}</strong>
          <small>Down from {formatINR(year)}. Insurance and the loan are never offered here.</small>
        </article>
        <button className="primary-button" onClick={onGoToCancel}>
          View cancellation steps
        </button>
      </div>
    </section>
  );
}
