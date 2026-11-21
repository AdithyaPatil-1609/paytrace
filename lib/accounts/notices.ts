/**
 * The short messages shown after sign-in, Gmail linking or an error.
 * Shared by the sign-in page and the account page, so both show the same words.
 */
import { accountErrors, isAccountErrorCode } from "./errors";

const messages: Record<string, string> = {"signed-in":"You're signed in. Gmail linking is optional.",linked:"Gmail permission granted. Your first sync is starting.",declined:"Permission was not granted. You can continue without Gmail.","wrong-account":"Please connect the same Google account you signed in with.","authorization-error":"Authorization was not completed. Please retry with the correct account and permissions.","permission-required":"Gmail read permission and offline access are required to sync.",disconnected:"Gmail disconnected. No new messages will be fetched. Previously imported payments remain.","disconnected-local":"Sync stopped locally. You can also revoke Paytrace access in your Google account settings.","session-expired":"Your session expired. Please sign in again."};

export function noticeText(notice: string): string | undefined {
  if (isAccountErrorCode(notice)) return accountErrors[notice];
  return Object.hasOwn(messages, notice) ? messages[notice] : undefined;
}

export function noticeIsError(notice: string): boolean {
  return isAccountErrorCode(notice) || notice === "declined";
}
