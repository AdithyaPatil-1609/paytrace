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

export function SubscriptionWatchlist({registrations,asOf}: {registrations:NotificationRow[];asOf:string}) {
  if (!registrations.length) return null;
  return <details className="personal-activity" open>
    <summary>Subscription watchlist <small>{registrations.length} zero-cost registrations</small></summary>
    <p>Detected from subscription confirmations. These are not completed debits or guaranteed future charges. Review renewal terms with the provider.</p>
    <div className="account-table">
      {registrations.map(item=><div key={item.noticeId}>
        <span><strong>{item.brand}</strong><small>EMAIL · Zero-cost subscription · {formatDate(item.sentOn)}</small>
          <small>{item.planPrice===undefined?"Listed plan price unknown":`Listed plan price: ${money.format(item.planPrice)}`}</small>
          <small>{renewalNotice(item.renewalDate,asOf)}</small>
        </span><strong>{money.format(0)} paid</strong>
      </div>)}
    </div>
  </details>;
}
