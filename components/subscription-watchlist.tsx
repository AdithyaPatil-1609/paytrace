import type { NotificationRow } from "@/lib/payments/types";
import { formatDate } from "@/lib/presentation/format";

const money = new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2});

export function renewalNotice(renewalDate: string | undefined, asOf: string) {
  if (!renewalDate) return "Next renewal not confirmed · check your provider";
  const days = Math.round((Date.parse(renewalDate)-Date.parse(asOf))/86_400_000);
  if (days < 0) return `Reported renewal ${formatDate(renewalDate)} has passed · verify current status`;
  if (days <= 30) return `Upcoming renewal · ${formatDate(renewalDate)}${days===0?" (today)":` (in ${days} days)`} · charge not confirmed`;
  return `Reported renewal · ${formatDate(renewalDate)} · charge not confirmed`;
}

export function SubscriptionWatchlist({registrations,renewals=[],candidates=[],asOf,showEmpty=false}: {registrations:NotificationRow[];renewals?:NotificationRow[];candidates?:NotificationRow[];asOf:string;showEmpty?:boolean}) {
  if (!registrations.length && !renewals.length && !candidates.length && !showEmpty) return null;
  const periods={weekly:52,monthly:12,quarterly:4,annual:1};
  return <details className="personal-activity" open>
    <summary>Subscription watchlist <small>{renewals.length} renewal notices · {registrations.length} zero-cost registrations · {candidates.length} to verify</small></summary>
    <p>Detected from subscription confirmations and renewal notices. These are not completed debits or guaranteed future charges. Review renewal terms with the provider.</p>
    {!registrations.length&&!renewals.length&&!candidates.length&&<p>No subscription notices have been recognized yet. Use Rescan last 12 months in your account menu to check older confirmations.</p>}
    <div className="account-table">
      {renewals.map(item=><div key={item.noticeId}>
        <span><strong>{item.brand}</strong><small>EMAIL · Automatic renewal notice · {formatDate(item.sentOn)}</small>
          <small>{item.renewalFrequency??"Frequency unknown"} · {renewalNotice(item.renewalDate,asOf)}</small>
          {item.amount!==undefined&&item.renewalFrequency&&<small>Projected annual cost if renewed: {money.format(item.amount*periods[item.renewalFrequency])}</small>}
        </span><strong>{item.amount===undefined?"Amount unknown":money.format(item.amount)} scheduled</strong>
      </div>)}
      {registrations.map(item=><div key={item.noticeId}>
        <span><strong>{item.brand}</strong><small>EMAIL · Zero-cost subscription · {formatDate(item.sentOn)}</small>
          <small>{item.planPrice===undefined?"Listed plan price unknown":`Listed plan price: ${money.format(item.planPrice)}`}</small>
          <small>{renewalNotice(item.renewalDate,asOf)}</small>
        </span><strong>{money.format(0)} paid</strong>
      </div>)}
      {candidates.map(item=><div key={item.noticeId}>
        <span><strong>{item.brand}</strong><small>EMAIL · Subscription evidence · {formatDate(item.sentOn)}</small>
          <small>{item.renewalFrequency??"Frequency unknown"} · {renewalNotice(item.renewalDate,asOf)}</small>
          <small>Verify current membership and billing with the provider.</small>
        </span><strong>{item.planPrice===undefined?"Price unknown":`${money.format(item.planPrice)} reported`} · Not confirmed paid</strong>
      </div>)}
    </div>
  </details>;
}
