import type { NotificationRow } from "@/lib/payments/types";
import { formatDate } from "@/lib/presentation/format";
import { isLateDebitNotice, LATE_NOTICE_MESSAGE } from "@/lib/payments/notice-timing";

const money = new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2});
const periods = {weekly:52,monthly:12,quarterly:4,annual:1};
const nameKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
/** A bare sender domain ("EMAIL.APPLE.COM") names nobody; it is not shown as a merchant. */
const isDomain = (name: string) => /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(name.trim());

export function renewalNotice(renewalDate: string | undefined, asOf: string) {
  if (!renewalDate) return "Next renewal not confirmed · check your provider";
  const days = Math.round((Date.parse(renewalDate)-Date.parse(asOf))/86_400_000);
  if (days < 0) return `Reported renewal ${formatDate(renewalDate)} has passed · verify current status`;
  if (days <= 30) return `Upcoming renewal · ${formatDate(renewalDate)}${days===0?" (today)":` (in ${days} days)`} · charge not confirmed`;
  return `Reported renewal · ${formatDate(renewalDate)} · charge not confirmed`;
}

type Kind = "renewal" | "scheduled" | "registration" | "candidate";
const rank: Record<Kind, number> = {renewal:0,scheduled:1,registration:2,candidate:3};

/** What we know about one merchant, from its most telling notice. */
function describe(kind: Kind, item: NotificationRow, asOf: string) {
  if (kind === "scheduled") return {
    lines: [`${item.renewalFrequency??"Frequency unknown"} · ${item.renewalDate?`Reported debit date: ${formatDate(item.renewalDate)}${item.renewalDate<asOf?" (passed; verify status)":""}`:"Debit date unknown"}`, ...(isLateDebitNotice(item)?[LATE_NOTICE_MESSAGE]:[])],
    amount: `${item.amount===undefined?"Amount unknown":money.format(item.amount)} scheduled · Not confirmed paid`
  };
  if (kind === "renewal") return {
    lines: [`${item.renewalFrequency??"Frequency unknown"} · ${renewalNotice(item.renewalDate,asOf)}`, ...(isLateDebitNotice(item)?[LATE_NOTICE_MESSAGE]:[]), ...(item.amount!==undefined&&item.renewalFrequency?[`Projected annual cost if renewed: ${money.format(item.amount*periods[item.renewalFrequency])}`]:[])],
    amount: `${item.amount===undefined?"Amount unknown":money.format(item.amount)} scheduled`
  };
  if (kind === "registration") return {
    lines: [item.planPrice===undefined?"Listed plan price unknown":`Listed plan price: ${money.format(item.planPrice)}`, renewalNotice(item.renewalDate,asOf)],
    amount: `${money.format(0)} paid`
  };
  return {
    lines: [`${item.renewalFrequency??"Frequency unknown"} · ${renewalNotice(item.renewalDate,asOf)}`],
    amount: `${item.planPrice===undefined?"Price unknown":`${money.format(item.planPrice)} reported`} · Not confirmed paid`
  };
}

/**
 * Subscriptions seen in Gmail that are not yet repeating payments on the
 * table: one row per merchant, never one row per email. Merchants already on
 * the table (exclude) are left out so nothing is shown twice.
 */
export function SubscriptionWatchlist({registrations,renewals=[],candidates=[],scheduled=[],asOf,showEmpty=false,exclude=[]}: {registrations:NotificationRow[];renewals?:NotificationRow[];candidates?:NotificationRow[];scheduled?:NotificationRow[];asOf:string;showEmpty?:boolean;exclude?:string[]}) {
  const skip = new Set(exclude.map(nameKey));
  const merchants = new Map<string, {kind: Kind; item: NotificationRow; count: number; latest: string}>();
  const tagged: [Kind, NotificationRow[]][] = [["renewal",renewals],["scheduled",scheduled],["registration",registrations],["candidate",candidates]];
  for (const [kind, rows] of tagged) for (const item of rows) {
    const key = nameKey(item.brand);
    if (!key || skip.has(key) || isDomain(item.brand)) continue;
    const seen = merchants.get(key);
    if (!seen) { merchants.set(key, {kind, item, count: 1, latest: item.sentOn}); continue; }
    seen.count++;
    if (item.sentOn > seen.latest) seen.latest = item.sentOn;
    const better = rank[kind] < rank[seen.kind] || (rank[kind] === rank[seen.kind] && item.sentOn > seen.item.sentOn);
    if (better) { seen.kind = kind; seen.item = item; }
  }
  const rows = [...merchants.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  if (!rows.length && !showEmpty) return null;
  return <details className="personal-activity watchlist">
    <summary>Subscription watchlist <small>{rows.length} {rows.length===1?"merchant":"merchants"} seen in Gmail, not yet repeating payments</small></summary>
    <p>From renewal notices, confirmations and scheduled debit emails. A merchant moves into the table once two charges or notices show it repeating. Nothing here is a confirmed charge.</p>
    {!rows.length&&<p>No other subscription notices have been recognized. For older emails, choose Rescan last 2 years under Sync Gmail at the top.</p>}
    <div className="account-table">
      {rows.map(({kind,item,count,latest})=>{
        const view = describe(kind,item,asOf);
        return <div key={nameKey(item.brand)}>
          <span><strong>{item.brand}</strong><small>{count} {count===1?"email":"emails"} · latest {formatDate(latest)}</small>
            {view.lines.map(line=><small key={line}>{line}</small>)}
          </span><strong>{view.amount}</strong>
        </div>;
      })}
    </div>
  </details>;
}
