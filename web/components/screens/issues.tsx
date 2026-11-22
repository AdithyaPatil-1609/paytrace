import { ScreenHeader } from "@/web/components/chrome/screen-header";
import { WarningIcon } from "@/web/components/chrome/warning-tag";
import { CUE_FOR_GROUP, CueChip, CueIcon, MerchantMark } from "@/web/components/chrome/visual-cues";
import { formatDate } from "@/server/presentation/format";
import { cancelDestination, UpiCancelLink } from "@/web/components/detail/upi-cancel-link";
import { formatINR } from "@/server/presentation/format";
import {
  annualPriceIncrease,
  issueDescription,
  issueGroups
} from "@/server/presentation/issue-cards";
import type { Commitment } from "@/server/payments/types";
import type { IssueCategory } from "@/server/presentation/issue-cards";
import { challengeChoices } from "@/server/scenarios/challenge-ui";

export function IssuesScreen({
  allItems,
  kept = [],
  onOpen,
  onGoToCancel,
  onChallenge
}: {
  allItems: Commitment[];
  kept?: string[];
  onOpen: (id: string) => void;
  onGoToCancel: (id: string) => void;
  onChallenge: (id: string) => void;
}) {
  const groups = issueGroups(allItems, kept);
  const findings = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const emptyGroups = groups.filter((group) => group.rows.length === 0);
  return (
    <>
      <ScreenHeader
        number="2"
        eyebrow="PAYMENTS WORTH A LOOK"
        title="Issues"
        help="These are the payments that need a look: price rises, services you don't use, debits coming up and charges after you cancelled. One payment can show up in more than one list. Tap any of them to see the proof."
      />
      {findings === 0 && (
        <p className="issue-empty" role="status">
          Nothing needs review in the available records. Payments you chose to keep are not flagged
          again.
        </p>
      )}
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => {
          const yearly =
            group.id === "price" || group.id === "announced"
              ? group.rows.reduce((sum, item) => sum + (annualPriceIncrease(item) ?? 0), 0)
              : group.rows.reduce((sum, item) => sum + item.annualCost, 0);
          const showTotal =
            group.id === "unused" ||
            ((group.id === "price" || group.id === "announced") &&
              group.rows.every((item) => annualPriceIncrease(item) !== undefined));
          return (
            <section
              className={`issue-category issue-category-${group.id}`}
              key={group.id}
              aria-labelledby={`issue-category-${group.id}`}
            >
              <header className="issue-category-header">
                <h2 id={`issue-category-${group.id}`} title={group.description}>
                  <CueIcon kind={CUE_FOR_GROUP[group.id]} size={22} /> {group.title} <span>({group.rows.length})</span>
                </h2>
                {showTotal && (
                  <p>
                    {formatINR(yearly)} / year{" "}
                    <small>{group.id === "price" || group.id === "announced" ? "estimated extra" : "estimated cost"}</small>
                  </p>
                )}
              </header>
              {group.rows.length === 0 ? (
                <p className="issue-category-empty">None found in the available records.</p>
              ) : (
                <div className="issue-card-grid">
                  {group.rows.map((item) => (
                    <article className="issue-card" data-row={item.id} key={item.id}>
                      <header className="issue-card-header">
                        <div className="issue-card-title">
                          <MerchantMark name={item.merchant} tone="issue" />
                          <h3 title={item.rawNarration}>{item.product || item.merchant}</h3>
                        </div>
                        <span className={`issue-card-badge badge-${group.id}`}>
                          <WarningIcon />
                          {group.badge}
                        </span>
                      </header>
                      <IssueVisual item={item} category={group.id} />
                      <details className="issue-why">
                        <summary>Why?</summary>
                        {issueDescription(item, group.id)}
                      </details>
                      <div className="issue-card-actions">
                        {group.id !== "unknown" && cancelDestination(item) ? <UpiCancelLink item={item} compact /> : (
                        <button
                          className="issue-card-link"
                          onClick={() =>
                            item.cancelMode === "block" || group.id === "unknown"
                              ? onOpen(item.id)
                              : onGoToCancel(item.id)
                          }
                        >
                          {item.cancelMode === "block"
                            ? "Review obligation"
                            : group.id === "unknown"
                              ? "Identify this payment"
                              : "How to stop it"}{" "}
                          →<span className="issues-sr-only"> {item.merchant}</span>
                        </button>)}
                        {challengeChoices(item).available && (
                          <button
                            className="issue-evidence-link"
                            onClick={() => onChallenge(item.id)}
                          >
                            Try a what-if
                            <span className="issues-sr-only"> for {item.merchant}</span>
                          </button>
                        )}
                        <button className="issue-evidence-link" onClick={() => onOpen(item.id)}>
                          View evidence<span className="issues-sr-only"> for {item.merchant}</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      {emptyGroups.length > 0 && (
        <details className="empty-issue-categories">
          <summary>Other categories ({emptyGroups.length}) · no findings</summary>
          <ul>
            {emptyGroups.map((group) => (
              <li key={group.id}>
                <strong>{group.title} (0)</strong>
                <span>No matching findings in the available records.</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** The finding as a picture: old price → new price, coins paid since last use, and so on. */
function IssueVisual({ item, category }: { item: Commitment; category: IssueCategory }) {
  if (category === "price" || category === "announced") {
    const extra = annualPriceIncrease(item);
    return (
      <div className="issue-visual">
        <span className="issue-visual-from">{formatINR(item.previousAmount ?? 0)}</span>
        <span className="issue-visual-arrow">
          <CueIcon kind="price" size={22} />
        </span>
        <span className="issue-visual-to">{formatINR(item.amount)}</span>
        {extra !== undefined && <CueChip kind="price">+{formatINR(extra)}/yr</CueChip>}
      </div>
    );
  }
  if (category === "unused") {
    const charges = item.lastOpened ? item.evidenceRows.filter((row) => row.date > item.lastOpened!) : item.evidenceRows;
    const paid = charges.reduce((sum, row) => sum + row.amount, 0);
    const since = item.lastOpened ?? item.notOpenedSince;
    return (
      <div className="issue-visual">
        {since ? (
          <CueChip kind="unused">Last used {formatDate(since)}</CueChip>
        ) : (
          <CueChip kind="unused">No use recorded</CueChip>
        )}
        <span className="issue-visual-big">{formatINR(paid)}</span>
        <span className="issue-visual-label">paid since</span>
        <span className="issue-coins" aria-label={`${charges.length} charges`}>
          {charges.slice(0, 24).map((row) => (
            <i key={row.txnId} title={`${formatDate(row.date)} · ${formatINR(row.amount)}`} />
          ))}
        </span>
      </div>
    );
  }
  if (category === "trial") {
    return (
      <div className="issue-visual">
        <CueChip kind="trial" tone="fixed">Free trial</CueChip>
        <span className="issue-visual-arrow">→</span>
        <span className="issue-visual-to">{formatINR(item.amount)}</span>
      </div>
    );
  }
  if (category === "new") {
    return (
      <div className="issue-visual">
        <CueChip kind="new">Started {formatDate(item.startedOn)}</CueChip>
        <span className="issue-visual-big">{formatINR(item.amount)}</span>
      </div>
    );
  }
  return (
    <div className="issue-visual">
      <CueChip kind="unknown">Who is this?</CueChip>
      <code>{item.rawNarration}</code>
    </div>
  );
}
