/**
 * The public address and the words used in search results and link previews
 * (ArgosX baseline findings: Open Graph tags, canonical link, sitemap).
 */
function publicUrl() {
  try {
    const url = new URL(process.env.PAYTRACE_APP_URL ?? "");
    if (url.protocol === "https:") return url.origin;
  } catch { /* fall through to the real domain */ }
  return "https://paytrace.co.in";
}

export const SITE = {
  url: publicUrl(),
  name: "Paytrace",
  title: "Paytrace | See every auto debit clearly",
  description: "Find every recurring payment: UPI AutoPay, card mandates, eNACH and subscriptions. See price changes, unused services and upcoming debits, with the evidence and the right way to stop each one."
} as const;
