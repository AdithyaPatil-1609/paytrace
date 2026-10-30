import { formatDate, formatINR } from "@/lib/format";
import type { Cadence, Commitment } from "@/lib/types";
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

const frequency: Record<Cadence, string> = {
  weekly: "every week",
  monthly: "every month",
  quarterly: "every three months",
  annual: "once a year",
  irregular: "each time · dates vary"
};

/** Show the essentials first; keep the original records available on request. */
export function DetailPanel({ item, asOf, onClose }: {
  item: Commitment;
  asOf: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab" && dialog) {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button, summary, a[href], input, select, textarea, [tabindex="0"]'))
          .filter((element) => !element.hasAttribute("disabled") && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  let finding: string | undefined;
  if (item.signals.includes("silent_hike")) {
    finding = `The price rose${item.previousAmount !== undefined ? ` from ${formatINR(item.previousAmount)} to ${formatINR(item.amount)}` : ""}. No price-change notice was found in the messages.`;
  } else if (item.signals.includes("zombie")) {
    finding = item.lastOpened
      ? `No use recorded since ${formatDate(item.lastOpened)}, but payments are continuing.`
      : "No use recorded, but payments are continuing.";
  } else if (item.signals.includes("trial_converted")) {
    finding = "A free trial was followed by paid charges. Check whether you still want this service.";
  }
  const nextDate = item.dateConfidence !== "unknown" && item.nextCharge ? formatDate(item.nextCharge) : "No set date";
  const autopay = item.mandateStatus === "active" ? "On" : item.mandateStatus === "revoked" ? "Off" : item.mandateStatus ?? "Not recorded";

  return (
    <div className="detail-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef} onClick={onClose}>
      <aside className="detail-panel simple-detail" onClick={(event) => event.stopPropagation()}>
        <header>
          <div><p>Payment details</p><h2 id={titleId}>{item.merchant}</h2></div>
          <Button variant="outline" onClick={onClose} aria-label="Close">Close <span aria-hidden="true">×</span></Button>
        </header>

        <section className="payment-at-a-glance" aria-label="Payment summary">
          <p>{item.amountPattern === "variable" ? "Typical payment" : "Payment amount"}</p>
          <strong>{item.amountPattern === "variable" && "About "}{formatINR(item.amount)}</strong>
          <span>{frequency[item.cadence]}</span>
          <dl>
            <div><dt>Next expected payment</dt><dd>{nextDate}</dd></div>
            <div><dt>Estimated cost over 12 months</dt><dd>{formatINR(item.annualCost)}</dd></div>
          </dl>
          <p className="summary-footnote">Future dates and costs are estimates based on the available records.</p>
        </section>

        {item.cancelMode === "block" ? (
          <section className="payment-explanation" aria-label="About this loan payment">
            <h3>This is a loan payment</h3>
            <p>Stopping the automatic payment does not cancel the loan. Contact your lender before making changes.</p>
          </section>
        ) : item.cancelMode === "warn" ? (
          <section className="payment-explanation">
            <h3>Check before stopping this payment</h3>
            <p>Contact the provider first. Stopping automatic payments could affect your cover or service.</p>
          </section>
        ) : item.cancelMode === "explain" ? (
          <section className="payment-explanation">
            <h3>The bill still needs to be paid</h3>
            <p>If you stop automatic payments, you will need another way to pay this bill.</p>
          </section>
        ) : null}

        {finding && <section className="payment-explanation attention"><h3>Worth a look</h3><p>{finding}</p></section>}

        <details className="payment-disclosure">
          <summary>Past payments ({item.evidenceRows.length})</summary>
          <div className="payment-disclosure-body">
            <p>{formatINR(item.spentToDate)} paid in the available records. Most recent payments are shown first.</p>
            <ul className="simple-payment-history">
              {[...item.evidenceRows].reverse().map((row) => (
                <li key={row.txnId}>
                  <div><span>{formatDate(row.date)}</span><strong>{formatINR(row.amount)}</strong></div>
                  <small>{row.narration}</small>
                  {row.reference && <small>Reference: {row.reference}</small>}
                </li>
              ))}
            </ul>
            {item.evidenceRows.length === 0 && <p>No past payments were found.</p>}
          </div>
        </details>

        <details className="payment-disclosure">
          <summary>Messages from this service ({item.notices.length})</summary>
          <div className="payment-disclosure-body">
            <ul className="simple-message-list">
              {[...item.notices].reverse().map((notice) => (
                <li key={notice.noticeId}>
                  <p className="message-heading">{formatDate(notice.sentOn)} · {notice.channel === "sms" ? "SMS" : "Email"} from {notice.sender}</p>
                  <p>{notice.text}</p>
                </li>
              ))}
            </ul>
            {item.notices.length === 0 && <p>No related messages were found in the available records.</p>}
          </div>
        </details>

        <details className="payment-disclosure">
          <summary>More payment details</summary>
          <div className="payment-disclosure-body">
            <dl className="plain-payment-facts">
              <div><dt>First payment in these records</dt><dd>{formatDate(item.firstCharge)}</dd></div>
              <div><dt>Payment method</dt><dd>{item.instrument}</dd></div>
              {item.mandateRef && <>
                <div><dt>Automatic payments</dt><dd>{autopay}</dd></div>
                <div><dt>Automatic payments set up</dt><dd>{formatDate(item.startedOn)}</dd></div>
                <div><dt>Autopay reference</dt><dd>{item.mandateRef}</dd></div>
              </>}
              <div><dt>Name on the bank statement</dt><dd>{item.rawNarration}</dd></div>
              {item.spendGroup === "subscriptions" && (item.lastOpened || item.opensLast12Months !== undefined) && <>
                <div><dt>Last recorded use</dt><dd>{item.lastOpened ? formatDate(item.lastOpened) : "No use recorded"}</dd></div>
                {item.opensLast12Months !== undefined && <div><dt>Times used in 12 months</dt><dd>{item.opensLast12Months}</dd></div>}
              </>}
              <div><dt>Records checked up to</dt><dd>{formatDate(asOf)}</dd></div>
            </dl>
            {item.holds.map((hold) => <p key={hold.txnId}>The {formatINR(hold.amount)} card check on {formatDate(hold.date)} is not included in the subscription price.</p>)}
          </div>
        </details>
      </aside>
    </div>
  );
}
