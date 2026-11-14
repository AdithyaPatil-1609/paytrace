import { ScreenHeader } from "@/components/chrome/screen-header";
import { formatINR } from "@/lib/presentation/format";
import {
  annualPriceIncrease,
  issueDescription,
  issueGroups
} from "@/lib/presentation/issue-cards";
import type { Commitment } from "@/lib/payments/types";
import { challengeChoices } from "@/lib/scenarios/challenge-ui";

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
  const paymentCount = new Set(groups.flatMap((group) => group.rows.map((item) => item.id))).size;
  const emptyGroups = groups.filter((group) => group.rows.length === 0);
  return (
    <>
      <ScreenHeader
        number="2"
        eyebrow="PAYMENTS WORTH A LOOK"
        title="Issues"
        copy={`${findings} ${findings === 1 ? "finding" : "findings"} across ${paymentCount} ${paymentCount === 1 ? "payment" : "payments"} worth reviewing.`}
        help="One payment may appear in more than one section. These findings use the supplied payment history, messages and usage records; review the evidence before deciding what to change. Categories with no findings are collapsed below."
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
            group.id === "price"
              ? group.rows.reduce((sum, item) => sum + (annualPriceIncrease(item) ?? 0), 0)
              : group.rows.reduce((sum, item) => sum + item.annualCost, 0);
          const showTotal =
            group.id === "unused" ||
            (group.id === "price" &&
              group.rows.every((item) => annualPriceIncrease(item) !== undefined));
          return (
            <section
              className={`issue-category issue-category-${group.id}`}
              key={group.id}
              aria-labelledby={`issue-category-${group.id}`}
            >
              <header className="issue-category-header">
                <h2 id={`issue-category-${group.id}`}>
                  {group.title} <span>({group.rows.length})</span>
                </h2>
                {showTotal && (
                  <p>
                    {formatINR(yearly)} / year{" "}
                    <small>{group.id === "price" ? "estimated extra" : "estimated cost"}</small>
                  </p>
                )}
              </header>
              <p className="issue-category-description">{group.description}</p>
              {group.rows.length === 0 ? (
                <p className="issue-category-empty">None found in the available records.</p>
              ) : (
                <div className="issue-card-grid">
                  {group.rows.map((item) => (
                    <article className="issue-card" data-row={item.id} key={item.id}>
                      <header className="issue-card-header">
                        <div>
                          <h3>{item.product || item.merchant}</h3>
                          <p className="issue-card-descriptor">{item.rawNarration}</p>
                        </div>
                        <span className={`issue-card-badge badge-${group.id}`}>{group.badge}</span>
                      </header>
                      <p className="issue-card-explanation">{issueDescription(item, group.id)}</p>
                      <div className="issue-card-actions">
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
                        </button>
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
          <summary>Other categories · no findings ({emptyGroups.length})</summary>
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
