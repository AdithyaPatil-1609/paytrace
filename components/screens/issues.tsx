import { ScreenHeader } from "@/components/chrome/screen-header";
import { formatDate, formatINR } from "@/lib/format";
import { annualPriceIncrease, issueDescription, issueGroups, type IssueCategory } from "@/lib/issue-cards";
import type { Commitment } from "@/lib/types";

export function IssuesScreen({ allItems, kept = [], onOpen, onGoToCancel }: {
  allItems: Commitment[];
  kept?: string[];
  onOpen: (id: string) => void;
  onGoToCancel: (id: string) => void;
}) {
  const groups = issueGroups(allItems, kept);
  const findings = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const paymentCount = new Set(groups.flatMap((group) => group.rows.map((item) => item.id))).size;
  return <>
    <ScreenHeader number="2" eyebrow="PAYMENTS WORTH A LOOK" title="Issues" copy={`${findings} ${findings === 1 ? "finding" : "findings"} across ${paymentCount} ${paymentCount === 1 ? "payment" : "payments"}. These are changes that are easy to miss on a statement. One payment may appear in more than one section.`} />
    {findings === 0 && <p className="issue-empty" role="status">Nothing needs review in the available records. Payments you chose to keep are not flagged again.</p>}
    {groups.map((group) => {
      const yearly = group.id === "price" ? group.rows.reduce((sum, item) => sum + (annualPriceIncrease(item) ?? 0), 0) : group.rows.reduce((sum, item) => sum + item.annualCost, 0);
      const showTotal = group.id === "unused" || (group.id === "price" && group.rows.every((item) => annualPriceIncrease(item) !== undefined));
      return <section className={`issue-category issue-category-${group.id}`} key={group.id} aria-labelledby={`issue-category-${group.id}`}>
        <header className="issue-category-header"><h2 id={`issue-category-${group.id}`}>{group.title} <span>({group.rows.length})</span></h2>{showTotal && <p>{formatINR(yearly)} / year <small>{group.id === "price" ? "estimated extra" : "estimated cost"}</small></p>}</header>
        <p className="issue-category-description">{group.description}</p>
        {group.rows.length === 0 ? <p className="issue-category-empty">None found in the available records.</p> : <div className="issue-card-grid">{group.rows.map((item) => <article className="issue-card" data-row={item.id} key={item.id}>
          <header className="issue-card-header"><div><h3>{item.product || item.merchant}</h3><p className="issue-card-descriptor">{item.rawNarration}</p></div><span className={`issue-card-badge badge-${group.id}`}>{group.badge}</span></header>
          <p className="issue-card-explanation">{issueDescription(item, group.id)}</p>
          <ChargeHistory item={item} category={group.id} />
          <div className="issue-card-actions"><button className="issue-card-link" onClick={() => item.cancelMode === "block" || group.id === "unknown" ? onOpen(item.id) : onGoToCancel(item.id)}>{item.cancelMode === "block" ? "Review obligation" : group.id === "unknown" ? "Identify this payment" : "How to stop it"} →<span className="issues-sr-only"> {item.merchant}</span></button><button className="issue-evidence-link" onClick={() => onOpen(item.id)}>View evidence<span className="issues-sr-only"> for {item.merchant}</span></button></div>
        </article>)}</div>}
      </section>;
    })}
  </>;
}

function ChargeHistory({ item, category }: { item: Commitment; category: IssueCategory }) {
  const notice = category === "trial" ? item.notices.find((entry) => entry.eventType === "trial_ending") : undefined;
  const charges = [...item.priceSeries].sort((first, second) => first.date.localeCompare(second.date));
  const points = notice && charges[0] && notice.sentOn < charges[0].date ? [{ date: notice.sentOn, amount: 0 }, ...charges] : charges;
  if (points.length === 0) return <p className="issue-category-empty">No dated charges available.</p>;
  const ceiling = Math.max(1, ...points.map((point) => point.amount));
  const changeIndex = charges.findIndex((point) => point.amount !== charges[0]?.amount);
  const slot = 720 / points.length;
  return <figure className="issue-history">
    <svg viewBox="0 0 720 92" role="img" aria-label={`${item.merchant}: ${charges.length} recorded charges, ${formatINR(charges[0]?.amount ?? 0)} to ${formatINR(charges.at(-1)?.amount ?? 0)}. Each bar is one charge; spacing does not represent elapsed time.`} preserveAspectRatio="none">
      {points.map((point, index) => {
        const height = Math.max(2, point.amount / ceiling * 86);
        const changed = category === "price" && point === charges[changeIndex];
        return <rect key={`${point.date}-${index}`} x={index * slot} y={90 - height} width={Math.max(1, slot - Math.min(5, slot * .1))} height={height} className={changed ? "charge-increased" : point.amount === 0 ? "charge-notice" : "charge-recorded"}><title>{point.amount === 0 ? "Trial-ending notice" : "Recorded charge"} · {formatDate(point.date)} · {formatINR(point.amount)}</title></rect>;
      })}
    </svg>
    <figcaption><span>{formatDate(points[0].date)}</span><span>{formatDate(points.at(-1)!.date)}</span></figcaption>
    <details className="issue-charge-details"><summary>View dated charges</summary><p>Each bar is one recorded charge. Bar spacing does not represent elapsed time.{notice ? " An orange baseline marks the trial-ending notice, not a payment or a confirmed trial start date." : ""}</p><ul>{charges.map((point, index) => <li key={`${point.date}-${index}`}>{formatDate(point.date)} · {formatINR(point.amount)}</li>)}</ul></details>
  </figure>;
}
