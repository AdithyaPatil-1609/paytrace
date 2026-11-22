/**
 * Consent for reading Gmail (India's DPDP Act 2023: consent for a stated
 * purpose, given before any data is read). The link flow refuses to start
 * without it, and the version the person agreed to is stored on their account.
 * Change the version whenever the consent text changes.
 */
export const GMAIL_CONSENT_VERSION = "gmail-v1-2026-11-22";

export function hasGmailConsent(form: FormData) {
  return form.get("consent") === GMAIL_CONSENT_VERSION && form.get("agree") === "yes";
}
