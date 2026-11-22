/**
 * The short messages shown after sign-in, Gmail linking or an error.
 * Shared by the sign-in page and the account page, so both show the same words.
 */
import { accountErrors, isAccountErrorCode } from "./errors";

const messages: Record<string, string> = {"signed-in":"You're signed in. Gmail linking is optional.",linked:"Gmail permission granted. Your first sync is starting.",declined:"Permission was not granted. You can continue without Gmail.","wrong-account":"Please connect the same Google account you signed in with.","authorization-error":"Authorization was not completed. Please retry with the correct account and permissions.","permission-required":"Gmail read permission and offline access are required to sync.",disconnected:"Gmail disconnected. No new messages will be fetched. Previously imported payments remain.","disconnected-local":"Sync stopped locally. You can also revoke Paytrace access in your Google account settings.","session-expired":"For your security you were signed out after 30 minutes without use, or 12 hours after signing in. Please sign in again.","phones-removed":"Every paired phone was removed. They can no longer send messages.","signed-out-everywhere":"You were signed out on every device.","data-deleted":"All of your Paytrace data was deleted and Gmail access was revoked.","bad-name":"Please enter your full name (letters only, 2 to 80 characters).","gmail-consent-needed":"Please tick the consent box before connecting Gmail."};

export function noticeText(notice: string): string | undefined {
  if (isAccountErrorCode(notice)) return accountErrors[notice];
  return Object.hasOwn(messages, notice) ? messages[notice] : undefined;
}

export function noticeIsError(notice: string): boolean {
  return isAccountErrorCode(notice) || ["declined", "bad-name", "gmail-consent-needed"].includes(notice);
}
