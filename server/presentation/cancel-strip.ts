/**
 * The short picture strip on each Cancel paths row: where this payment is
 * stopped, in two or three steps named for its own rail (UPI, card, Play,
 * operator, bill, mandate). The full instructions stay in cancel-links.ts.
 */
import type { Commitment } from "@/server/payments/types";
import { APPS, SERVICE, bankOf } from "@/server/presentation/cancel-links";

export type StripIcon = "app" | "bank" | "receipt";
export type StripStep = { icon: StripIcon; label: string; hint: string };

type StripItem = Pick<Commitment, "merchant" | "mechanism" | "rawNarration"> &
  Partial<Pick<Commitment, "notices" | "evidenceRows">>;

export function cancelStrip(item: StripItem): StripStep[] {
  const name = item.merchant?.trim() || "the service";
  const hasApp = APPS.has(name) || (SERVICE[name]?.length ?? 0) > 0;
  const service: StripStep = hasApp
    ? { icon: "app", label: `Cancel in ${name} app`, hint: `Cancel the plan inside ${name}, so the service ends too.` }
    : { icon: "app", label: `Ask ${name} to cancel`, hint: `Contact ${name} through its official support and get a cancellation confirmation.` };
  const bank = bankOf(item);

  switch (item.mechanism) {
    case "upi_autopay":
      return [
        service,
        { icon: "bank", label: "Revoke on UPI Help", hint: "upihelp.npci.org.in lists autopays from every UPI app. Or revoke in the UPI app you approved it with." },
        { icon: "receipt", label: "Keep the revoke SMS", hint: "Your bank texts you when a UPI mandate is revoked. Keep it in case money is taken again." }
      ];
    case "card_recurring":
      return [
        service,
        bank && bank.cards.length
          ? { icon: "bank", label: `${bank.name} e-mandate page`, hint: `Log in with your card and OTP, find ${name} and cancel the standing instruction.` }
          : bank
            ? { icon: "bank", label: `${bank.name} app → Cards`, hint: `Cards → Manage e-mandates (or Standing instructions) → ${name} → Cancel.` }
            : { icon: "bank", label: "Call your card's bank", hint: "Use the number on the back of the card and ask them to cancel this card mandate." },
        { icon: "receipt", label: bank ? `Note ${bank.name}'s ref no.` : "Note the ref no.", hint: "Write down the reference number the bank gives you." }
      ];
    case "play_store":
      return name.toLowerCase() === "icloud+"
        ? [
            { icon: "app", label: "Settings → Apple ID", hint: "Settings → your name → Subscriptions or iCloud → Manage storage → downgrade." },
            { icon: "receipt", label: "Keep Apple's email", hint: "Apple emails a confirmation when the plan changes." }
          ]
        : [
            { icon: "app", label: "Play Store → Subscriptions", hint: `Open the Google account that pays for ${name} → Payments & subscriptions → Subscriptions → Cancel.` },
            { icon: "receipt", label: "Keep Google's email", hint: "Google Play emails a confirmation when a subscription is cancelled." }
          ];
    case "vas":
      return [
        { icon: "app", label: "Operator app → Add-ons", hint: "Find the paid add-on in your mobile operator's app or ask its support to stop it." },
        { icon: "receipt", label: "Check the next bill", hint: "Make sure the add-on is gone from your next phone bill." }
      ];
    case "bbps":
      return [
        { icon: "bank", label: "Bank app → BBPS autopay", hint: "Turn off the bill autopay in the bank or UPI app where you set it up." },
        { icon: "receipt", label: "Pay the bill yourself", hint: `Turning off autopay does not end the bill. Pay ${name} by its due date.` }
      ];
    case "neft_standing":
      return [
        { icon: "app", label: `Tell ${name} first`, hint: `Agree with ${name} how you will pay from now on.` },
        { icon: "bank", label: bank ? `${bank.name} → Standing orders` : "Netbanking → Standing orders", hint: "Delete the standing order in netbanking or at the branch." },
        { icon: "receipt", label: "Keep the confirmation", hint: "Save the bank's confirmation that the standing order is deleted." }
      ];
    case "enach":
    case "emi_ach":
      return [
        { icon: "app", label: `Settle with ${name}`, hint: `Ask ${name} about dues and how to close or change the agreement first.` },
        { icon: "bank", label: bank ? `Then ${bank.name}: stop NACH` : "Then bank: stop NACH", hint: "Only after it is settled, ask the bank to cancel the NACH mandate." },
        { icon: "receipt", label: "Get a closure letter", hint: `Keep ${name}'s written closure or no-dues letter.` }
      ];
    default:
      return [
        { icon: "app", label: `Ask ${name} how it's paid`, hint: "Find out whether it is UPI, a card or a bank mandate before stopping anything." },
        { icon: "bank", label: "Then stop it there", hint: "Stop it in the UPI app, the card's bank or netbanking, depending on the answer." },
        { icon: "receipt", label: "Keep proof", hint: "Keep the confirmation or reference number." }
      ];
  }
}
