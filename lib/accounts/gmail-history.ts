export type GmailHistoryDays = 90 | 365 | 730;

export function gmailHistoryDays(value: string | null): GmailHistoryDays {
  return value === "730" ? 730 : value === "90" ? 90 : 365;
}

export function gmailDateFilter(history: boolean, days: GmailHistoryDays, lastSync?: string | null) {
  if (history) return `newer_than:${days}d`;
  if (!lastSync) return "newer_than:90d";
  return `after:${Math.floor((Date.parse(lastSync) - 2 * 86400000) / 1000)}`;
}
