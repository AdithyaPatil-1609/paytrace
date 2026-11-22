/** Only fixed, non-sensitive codes cross the API boundary or enter logs. */
export const accountErrors = {
  "oauth-expired": "Authorization expired or was interrupted. Open Connect Gmail again and finish consent in the same browser tab.",
  "wrong-account": "Please connect the same Google account you signed in with.",
  "permission-required": "Google did not grant Gmail read access or offline access. Reconnect and allow Gmail read permission.",
  "identity-unverified": "Google identity could not be verified. Start authorization again and check your internet connection.",
  "oauth-config": "Google OAuth configuration was rejected. Check the Web client ID, secret and callback URL in .env.local and Google Cloud.",
  "oauth-network": "PayTrace could not complete the connection to Google. Please start sign-in again in a moment.",
  "google-denied": "Google declined authorization. Check that Gmail access is allowed and your account is a test user if the app is in Testing mode.",
  "authorization-error": "Authorization was not completed. Please retry with the correct account and permissions.",
  "domain-config": "Gmail sender domains are invalid. Set GMAIL_ALLOWED_DOMAINS=.com,.in in .env.local and restart Paytrace.",
  "gmail-reconnect": "Gmail permission is missing, expired or revoked. Reconnect Gmail from your account menu.",
  "gmail-api-disabled": "Gmail API is disabled for this Google Cloud project. Enable it in Google Cloud and retry.",
  "gmail-rate-limit": "Gmail is temporarily limiting requests. Wait before retrying; use a shorter history rescan if possible.",
  "gmail-daily-quota": "The Google Cloud project's daily Gmail API quota has been reached. Check Gmail API quotas and wait for the quota to reset before rescanning.",
  "gmail-domain-policy": "This Google account's organization blocks Gmail API access. Contact the Google Workspace administrator.",
  "gmail-forbidden": "Google denied Gmail access. Check the Gmail API project's status, quotas and OAuth permissions before retrying.",
  "gmail-query": "Gmail rejected the search query. Remove any custom GMAIL_ACCOUNT_QUERY override and restart Paytrace.",
  "gmail-unavailable": "Gmail is temporarily unavailable. Check your connection and retry.",
  "neo4j-unavailable": "Paytrace could not read or save data in Neo4j. Check that Neo4j is running and its configured credentials are correct.",
  "origin-mismatch": "Open Paytrace at the exact PAYTRACE_APP_URL configured in .env.local (including port), then retry.",
  "gmail-disconnected": "Connect Gmail from your account menu before syncing.",
  "sync-unavailable": "Sync could not finish. Retry from your account menu.",
} as const;
export type AccountErrorCode = keyof typeof accountErrors;
export class AccountError extends Error {
  constructor(public readonly code: AccountErrorCode) { super(accountErrors[code]); }
}
export function isAccountErrorCode(value: unknown): value is AccountErrorCode {
  return typeof value === "string" && Object.hasOwn(accountErrors,value);
}
export function accountErrorMessage(value: unknown) {
  return isAccountErrorCode(value)?accountErrors[value]:undefined;
}
