/**
 * The "Cancel" hand-off. UPI AutoPay goes straight to NPCI's UPI Help, which lists
 * autopays from every UPI app. So does a payment whose rail is not confirmed (found
 * only in Gmail notices): most Indian subscriptions run on UPI AutoPay, and if it is
 * not listed there the steps below cover the card. Never for loans or other rails.
 */
import type { Commitment, Mechanism } from "@/server/payments/types";

type RouteItem = Pick<Commitment, "mechanism" | "mandateStatus" | "cancelMode" | "canCancel">
  & Partial<Pick<Commitment, "merchant" | "rawNarration" | "mandateRef" | "basis">>;

const NPCI = "https://www.upihelp.npci.org.in/";
/** Rails that never run as a UPI mandate: the money is stopped elsewhere. */
const NOT_UPI: Mechanism[] = ["play_store", "enach", "bbps", "neft_standing", "vas", "emi_ach"];
const STOPPED = new Set(["revoked", "cancelled", "canceled", "paused", "expired"]);
/** Bank statement lines that name a non-UPI rail (same reading as railOf in server/payments/recurring-check). */
const OTHER_RAIL = /^(?:NACH|ACH\b|BBPS|BIL\/|NEFT\b|NEFT\/|IMPS\b|IMPS\/|NETBANKING\b|(?:POS|CARD|ME DC|VPS)\b)|\*/;

/** "confirmed" for UPI AutoPay, "possible" when no bank evidence says which rail it is, else null. */
export function upiRoute(item: RouteItem): "confirmed" | "possible" | null {
  if (STOPPED.has(item.mandateStatus?.trim().toLowerCase() ?? "")) return null;
  if (item.mechanism === "upi_autopay") return "confirmed";
  if (NOT_UPI.includes(item.mechanism)) return null;
  // Card or unknown rail: only bank evidence (a card debit line, a card mandate) rules out UPI.
  if (OTHER_RAIL.test((item.rawNarration ?? "").toUpperCase())) return null;
  if (item.mechanism === "card_recurring" && item.mandateRef) return null;
  return "possible";
}

export function cancelDestination(item: RouteItem) {
  if (!item.canCancel || item.cancelMode === "block") return null;
  if (item.mechanism === "play_store" && item.merchant?.trim().toLowerCase() === "icloud+")
    return { url: "https://support.apple.com/108318", label: "Open Apple’s iCloud+ cancellation guide", steps: "This is an Apple storage plan, not a confirmed UPI mandate. You’ll leave PayTrace for Apple’s instructions and complete the downgrade or cancellation in your device settings." };
  const route = upiRoute(item);
  const name = item.merchant?.trim() || "this payment";
  if (route === "confirmed")
    return { url: NPCI, label: "Cancel UPI mandate via NPCI", steps: `You’ll leave PayTrace for NPCI UPI Help. Log in with the mobile number linked to your bank, open your AutoPay mandates, choose ${name} → Revoke and confirm in your UPI app. This stops the money, not the ${name} plan itself.` };
  if (route === "possible")
    return { url: NPCI, label: "Cancel via NPCI UPI Help", steps: `You’ll leave PayTrace for NPCI UPI Help, which lists UPI AutoPay mandates from every UPI app. If ${name} is there, choose Revoke. If it is not listed, it is charged to a card: use the cancellation steps instead.` };
  return null;
}

/** `compact` shows only the button; the steps move to its tooltip. */
export function UpiCancelLink({ item, compact = false }: { item: RouteItem; compact?: boolean }) {
  const destination = cancelDestination(item);
  if (!destination) return null;
  if (compact)
    return (
      <a className="danger-button" href={destination.url} target="_blank" rel="noopener noreferrer" title={destination.steps}>
        {destination.label} ↗
      </a>
    );
  return <>
    <p>{destination.steps}</p>
    <a className="danger-button" href={destination.url} target="_blank" rel="noopener noreferrer">{destination.label} →</a>
    <small>Opens in a new tab. Opening the link does not cancel anything.</small>
  </>;
}
