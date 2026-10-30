"use client";

import { useState } from "react";
import { potentialSavings, yearlyTotal } from "@/lib/analysis";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";

export function UnusedSavings({ items, onOpen, onGoToCancel }: {
  items: Commitment[];
  onOpen: (id: string) => void;
  onGoToCancel: () => void;
}) {
  const { eligible } = potentialSavings(items, []);
  const [selected, setSelected] = useState<string[]>(eligible.map((item) => item.id));
  const { selected: selectedItems, saved, revisedYear } = potentialSavings(items, selected);
  const year = yearlyTotal(items);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  }

  if (eligible.length === 0) {
    return <section className="simple-chart"><h2>No unused services to review</h2><p>We have not found any unused services you could stop in these records.</p></section>;
  }

  return (
    <section className="simple-chart savings-chart" aria-labelledby="savings-heading">
      <header className="simple-chart-heading">
        <p className="chart-eyebrow">POTENTIAL SAVINGS</p>
        <h2 id="savings-heading">What if you stop unused services?</h2>
        <p>Tick the services you would like to stop. This only changes the estimate.</p>
      </header>
      <div className="savings-result" role="status" aria-live="polite" aria-atomic="true">
        <span>You could save</span>
        <strong>{formatINR(saved)} <small>a year</small></strong>
        <p>{selectedItems.length} {selectedItems.length === 1 ? "service selected" : "services selected"}. Nothing has been cancelled.</p>
      </div>
      <div className="savings-comparison" aria-label="Yearly spending before and after stopping the selected services">
        <div className="comparison-row">
          <div><span>Keep all current payments</span><strong>{formatINR(year)} a year</strong></div>
          <div className="simple-bar-track" aria-hidden="true"><span className="simple-bar-fill current" style={{ width: year > 0 ? "100%" : "0%" }} /></div>
        </div>
        <div className="comparison-row">
          <div><span>Stop the selected services</span><strong>{formatINR(revisedYear)} a year</strong></div>
          <div className="simple-bar-track" aria-hidden="true"><span className="simple-bar-fill after" style={{ width: `${year > 0 ? revisedYear / year * 100 : 0}%` }} /></div>
        </div>
      </div>
      <fieldset className="savings-choices">
        <legend>Choose services to compare</legend>
        {eligible.map((item) => (
          <div className="savings-choice" key={item.id}>
            <label>
              <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
              <span>{item.merchant}<small>{formatINR(item.annualCost)} a year</small></span>
            </label>
            <button className="plain-details-button" onClick={() => onOpen(item.id)} aria-label={`See details for ${item.merchant}`}>See details</button>
          </div>
        ))}
      </fieldset>
      <p className="chart-note">This is money you may avoid spending in the future, not money already saved. Savings start only when charges stop. Loans and insurance are not included.</p>
      <button className="primary-button" disabled={selectedItems.length === 0} onClick={onGoToCancel}>See how to stop payments →</button>
    </section>
  );
}
