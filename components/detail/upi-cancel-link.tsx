import type { Commitment } from "@/lib/payments/types";

/** Don't treat an ordinary UPI transfer or a merchant name as a mandate. */
type RouteItem = Pick<Commitment, "mechanism" | "mandateStatus" | "cancelMode" | "canCancel"> & Partial<Pick<Commitment, "merchant">>;
export function cancelDestination(item: RouteItem) {
  if (!item.canCancel || item.cancelMode === "block") return null;
  if (item.mechanism === "upi_autopay" && item.mandateStatus?.trim().toLowerCase() === "active")
    return { url: "https://www.upihelp.npci.org.in/", label: "Cancel UPI mandate via NPCI", steps: "You’ll leave PayTrace for NPCI UPI Help. Select your AutoPay mandate, choose Revoke and confirm in your UPI app. This does not cancel the underlying service." };
  if (item.mechanism === "play_store" && item.merchant?.trim().toLowerCase() === "icloud+")
    return { url: "https://support.apple.com/108318", label: "Open Apple’s iCloud+ cancellation guide", steps: "This is an Apple storage plan, not a confirmed UPI mandate. You’ll leave PayTrace for Apple’s instructions and complete the downgrade or cancellation in your device settings." };
  return null;
}
export function UpiCancelLink({ item }: { item: RouteItem }) {
  const destination = cancelDestination(item);
  if (!destination) return null;
  return <>
    <p>{destination.steps}</p>
    <a className="danger-button" href={destination.url} rel="noreferrer">{destination.label} →</a>
    <small>Opening the link does not cancel anything.</small>
  </>;
}
