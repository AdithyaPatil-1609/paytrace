// A dot-prefixed rule matches a complete domain suffix, not a substring.
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const suffixPattern = /^\.[a-z]{2,63}$/i;

export const defaultPaymentQuery = '{payment payments receipt receipts transaction transactions mandate autopay subscription invoice debit debited charged paid renewal "order placed" "order number" "amount paid" "your new plan" "free trial"}';

export function parseAllowedDomains(value: string | undefined): string[] {
  const rules = [...new Set((value ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean))];
  if (!rules.length || rules.some(rule => !domainPattern.test(rule) && !suffixPattern.test(rule))) {
    throw new Error("Configure GMAIL_ALLOWED_DOMAINS with exact domains or suffixes, e.g. .com,.in");
  }
  return rules;
}

export function isAllowedSender(from: string, rules: readonly string[]): boolean {
  const address = from.match(/(?:<|^)([\w.+-]+@[\w.-]+)>?\s*$/)?.[1];
  const domain = address?.split("@")[1]?.toLowerCase();
  if (!domain || !domainPattern.test(domain)) return false;
  return rules.some(rule => {
    const normalized = rule.toLowerCase();
    return suffixPattern.test(normalized) ? domain.endsWith(normalized) : domain === normalized;
  });
}

export function gmailPaymentQuery(dateFilter: string, rules: readonly string[], customQuery?: string): string {
  // Gmail's documented sender search is not a domain-suffix wildcard. For broad
  // rules, search financial text first and check the actual From header locally.
  const senderFilter = rules.some(rule => rule.startsWith(".")) ? "" : `{${rules.map(rule => `from:${rule}`).join(" ")}}`;
  return [dateFilter, senderFilter, customQuery?.trim() || defaultPaymentQuery].filter(Boolean).join(" ");
}
