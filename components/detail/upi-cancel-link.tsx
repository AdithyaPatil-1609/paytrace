import type { Commitment } from "@/lib/payments/types";

/** Don't treat an ordinary UPI transfer or a merchant name as a mandate. */
export function UpiCancelLink({ item }: { item: Pick<Commitment, "mechanism" | "mandateStatus" | "cancelMode" | "canCancel"> }) {
  if (item.mechanism !== "upi_autopay" || item.mandateStatus?.trim().toLowerCase() !== "active" || !item.canCancel || item.cancelMode === "block") return null;
  return <>
    <p>You’ll leave PayTrace for NPCI UPI Help. Select your AutoPay mandate and choose Revoke, then confirm in the UPI app where you set it up. If it isn’t listed, open that app’s AutoPay section directly.</p>
    <a className="secondary-button" href="https://www.upihelp.npci.org.in/" target="_blank" rel="noopener noreferrer">Cancel UPI mandate via NPCI (new tab)</a>
    <small>Opening the link does not cancel anything. Revoking a mandate does not cancel the service or refund a past payment.</small>
  </>;
}
