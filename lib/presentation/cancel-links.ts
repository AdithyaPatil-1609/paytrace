/**
 * Direct links for cancelling: the service's own cancel page, then the place
 * the money is stopped. A card's e-mandate page is shown only when PayTrace
 * knows the bank (from the bank's SMS sender ID or the statement); UPI AutoPay
 * always gets NPCI's UPI Help, which lists autopays from every UPI app.
 * Only official pages. PayTrace never cancels anything itself.
 */
import type { Commitment, Mechanism } from "@/lib/payments/types";

export type CancelLink = { label: string; href: string; note?: string };

const SERVICE: Record<string, CancelLink[]> = {
  Netflix: [{ label: "Netflix: cancel membership", href: "https://www.netflix.com/cancelplan" }],
  Spotify: [{ label: "Spotify: manage your plan", href: "https://www.spotify.com/account/subscription/" }],
  YouTube: [{ label: "YouTube: Purchases and memberships", href: "https://www.youtube.com/paid_memberships" }],
  "Google One": [{ label: "Google Play: subscriptions", href: "https://play.google.com/store/account/subscriptions" }],
  FitApp: [{ label: "Google Play: subscriptions", href: "https://play.google.com/store/account/subscriptions" }],
  "Amazon Prime": [{ label: "Amazon: Prime membership", href: "https://www.amazon.in/gp/primecentral" }]
};

/** Banks recognised from SMS sender IDs (AX-HDFCBK-S) or statement text, and their card e-mandate pages. */
type Bank = { name: string; match: RegExp; cards: CancelLink[]; phone?: string; email?: string };
const BANKS: Bank[] = [
  { name: "SBI", match: /\b(?:[A-Z]{2}-)?(?:SBIINB|SBIBNK|SBMSMS|ATMSBI|SBICRD|SBIPSG)\b|\bSBI CARD\b|\bSTATE BANK\b/, cards: [
    { label: "SBI debit card: SI Hub", href: "https://www.sihub.in/managesi/sbi" },
    { label: "SBI credit card: manage e-mandates", href: "https://www.sbicard.com/emandates" }], phone: "1800 1234 (SBI) · 1860 180 1290 (SBI Card)", email: "customercare@sbi.co.in" },
  { name: "Axis Bank", match: /\b(?:[A-Z]{2}-)?AXISBK\b|\bAXIS BANK\b/, cards: [{ label: "Axis Bank cards: SI Hub", href: "https://www.sihub.in/managesi/axisbank" }], phone: "1860 419 5555" },
  { name: "Canara Bank", match: /\b(?:[A-Z]{2}-)?CANBNK\b|\bCANARA BANK\b/, cards: [{ label: "Canara Bank cards: SI Hub", href: "https://www.sihub.in/managesi/canara" }], phone: "1800 1030" },
  { name: "IDFC FIRST Bank", match: /\b(?:[A-Z]{2}-)?IDFCFB\b|\bIDFC FIRST\b/, cards: [{ label: "IDFC FIRST cards: SI Hub", href: "https://www.sihub.in/managesi/idfcfirstbank" }], phone: "1800 10 888" },
  { name: "RBL Bank", match: /\b(?:[A-Z]{2}-)?RBLBNK\b|\bRBL BANK\b/, cards: [{ label: "RBL credit cards: SI Hub", href: "https://www.sihub.in/managesi/rblcredit" }] },
  { name: "HDFC Bank", match: /\b(?:[A-Z]{2}-)?HDFCBK\b|\bHDFC BANK\b/, cards: [], phone: "1800 202 6161" },
  { name: "ICICI Bank", match: /\b(?:[A-Z]{2}-)?ICICIB\b|\bICICI BANK\b/, cards: [], phone: "1800 1080" },
  { name: "Kotak Mahindra Bank", match: /\b(?:[A-Z]{2}-)?KOTAKB\b|\bKOTAK\b/, cards: [], phone: "1860 266 2666" }
];

const UPI_HELP: CancelLink = {
  label: "NPCI UPI Help: see and revoke your UPI autopays",
  href: "https://upihelp.npci.org.in",
  note: "Log in with your mobile number to see autopays from every UPI app. If its revoke button does not work, revoke in the UPI app you approved it with."
};

/** The bank behind a payment, if any message or statement line names it. */
export function bankOf(item: Pick<Commitment, "rawNarration"> & { notices?: { sender: string }[]; evidenceRows?: { narration: string; account?: string }[] }) {
  const text = [item.rawNarration, ...(item.notices ?? []).map(n => n.sender), ...(item.evidenceRows ?? []).flatMap(r => [r.narration, r.account ?? ""])].join(" ").toUpperCase();
  return BANKS.find(bank => bank.match.test(text)) ?? null;
}

export function cancelLinks(item: Pick<Commitment, "merchant" | "mechanism" | "rawNarration"> & { notices?: { sender: string }[]; evidenceRows?: { narration: string; account?: string }[] }): { service: CancelLink[]; money: CancelLink[] } {
  const service = SERVICE[item.merchant] ?? [];
  const mechanism: Mechanism = item.mechanism;
  let money: CancelLink[] = [];
  if (mechanism === "upi_autopay") money = [UPI_HELP];
  else if (mechanism === "card_recurring") money = bankOf(item)?.cards ?? [];
  return { service, money: money.filter(link => !service.some(s => s.href === link.href)) };
}

/** Services people use through an app or website of their own: cancelling there stops the plan. */
const APPS = new Set(["Netflix", "Spotify", "YouTube", "Google One", "FitApp", "Amazon Prime", "JioHotstar", "Canva", "Headspace Plus", "Apple Music", "iCloud+", "Hinge", "Bumble", "Snapchat"]);

export type CancelOption = { title: string; steps: string[]; links: CancelLink[] };

/**
 * The ways to cancel, best first.
 *  UPI AutoPay: NPCI's portal, then the service's own app, then the UPI app.
 *  Card: the bank's e-mandate website, then the service's app, else the service's
 *  website, else the bank's phone and email (or the number on the card).
 */
export function cancelOptions(item: Pick<Commitment, "merchant" | "mechanism" | "rawNarration" | "stopService" | "stopMoney"> & { notices?: { sender: string }[]; evidenceRows?: { narration: string; account?: string }[] }): CancelOption[] {
  const service = SERVICE[item.merchant] ?? [];
  const app = APPS.has(item.merchant) || service.length > 0;
  const inService: CancelOption | null = item.stopService ? { title: app ? `Cancel in the ${item.merchant} app` : `Cancel on the ${item.merchant} website or with ${item.merchant}`, steps: [item.stopService], links: service } : null;

  if (item.mechanism === "upi_autopay") {
    return [
      { title: "Cancel the autopay on NPCI's UPI Help portal", steps: [`Open UPI Help → log in with the mobile number linked to your bank → enter the OTP → Show my autopay mandates → ${item.merchant} → Revoke`], links: [UPI_HELP] },
      ...(inService ? [inService] : []),
      ...(item.stopMoney ? [{ title: "Or revoke it in your UPI app", steps: [item.stopMoney], links: [] }] : [])
    ];
  }

  if (item.mechanism === "card_recurring") {
    const bank = bankOf(item);
    const out: CancelOption[] = [];
    if (bank && bank.cards.length) out.push({ title: `Cancel through ${bank.name}'s website`, steps: [`Open the e-mandate page → log in with your card number and the OTP → find ${item.merchant} → Cancel`], links: bank.cards });
    else if (bank) out.push({ title: `Cancel through ${bank.name}`, steps: [`${bank.name} app or netbanking → Cards → Manage e-mandates (or Standing instructions) → ${item.merchant} → Cancel`], links: [] });
    if (inService) out.push(inService);
    if (!inService || !app) {
      const contact = bank?.phone || bank?.email
        ? `Call ${bank.name} on ${bank.phone ?? "the number on the back of your card"}${bank.email ? ` or email ${bank.email}` : ""}. Ask them to cancel the card mandate for ${item.merchant} (${item.rawNarration}) and give you a reference number`
        : `Call the customer care number on the back of your card. Ask the bank to cancel the card mandate for ${item.merchant} (${item.rawNarration}) and give you a reference number`;
      out.push({ title: "Ask your bank to stop it", steps: [contact], links: [] });
    }
    return out;
  }

  // eNACH, bills, loans, Google Play and operator packs: the service, then the money, as written.
  return [{ title: "Do this", steps: [item.stopService, item.stopMoney].filter(Boolean), links: service }];
}

const RBI_CMS: CancelLink = { label: "RBI complaint portal", href: "https://cms.rbi.org.in" };

/** What to do if money is still taken after cancelling, in plain words. */
export function ifStillCharged(item: Pick<Commitment, "merchant" | "mechanism" | "rawNarration"> & { notices?: { sender: string }[]; evidenceRows?: { narration: string; account?: string }[] }): { steps: string[]; links: CancelLink[] } {
  const bank = bankOf(item);
  const call = bank?.phone ? `Call ${bank.name} on ${bank.phone}` : "Call the customer care number on the back of your card";
  if (item.mechanism === "card_recurring") return {
    steps: [
      `${call}. Say: "Please stop all payments to ${item.rawNarration} on my card, and dispute the charge taken after I cancelled." Note the complaint number they give you.`,
      `Email ${item.merchant} your cancellation screenshot and ask for a refund.`,
      "If the bank has not fixed it in 30 days, complain to the RBI. It is free and online."
    ],
    links: [RBI_CMS]
  };
  if (item.mechanism === "upi_autopay") return {
    steps: [
      "Open the UPI app the money left from → Help or History → that payment → Raise a complaint. Note the complaint number.",
      `Email ${item.merchant} your cancellation screenshot and ask for a refund.`,
      "If it is not fixed in 30 days, complain to the RBI. It is free and online."
    ],
    links: [UPI_HELP, RBI_CMS]
  };
  return {
    steps: [
      `Call ${item.merchant} and your bank. Tell them you cancelled, give the date, and ask for the money back. Note the complaint number.`,
      "If it is not fixed in 30 days, complain to the RBI. It is free and online."
    ],
    links: [RBI_CMS]
  };
}
