/**
 * How far one piece of evidence can be trusted, decided on the server from
 * checks that really ran. The browser, the phone and the AI model never choose
 * it: PaymentEvent has no trust field, and validateEvent rejects one.
 * Records stored before this existed have no level and read as "unverified".
 */
import type { SenderCheck } from "./dkim";

export const SOURCE_TRUST = ["verified_origin", "authenticated_source", "user_provided", "unverified"] as const;
export type SourceTrust = typeof SOURCE_TRUST[number];
export type VerificationStatus = "verified" | "channel_verified" | "not_verified";

export type Provenance = {
  sourceTrust: SourceTrust;
  verificationStatus: VerificationStatus;
  verificationMethod: string;
  trustReason: string;
  /** When the check ran; null when nothing was verified. */
  verifiedAt: string | null;
};

const now = () => new Date().toISOString();

/** Gmail's own DKIM/DMARC verdict for the From domain (lib/ingestion/dkim.ts). "fail" is never stored. */
export function emailProvenance(check: SenderCheck, at = now()): Provenance {
  if (check === "pass") return { sourceTrust: "verified_origin", verificationStatus: "verified", verificationMethod: "gmail_dkim_dmarc", trustReason: "Gmail confirmed the sender's domain signed this email (DKIM/DMARC pass).", verifiedAt: at };
  return { sourceTrust: "unverified", verificationStatus: "not_verified", verificationMethod: "none", trustReason: "Read from your Gmail, but Gmail gave no sender-domain verdict, so who sent it is not proven.", verifiedAt: null };
}

export type SmsChannel = "signed_device" | "ios_token" | "legacy_code";

/** A signed request proves which phone sent it, not that the bank really sent the SMS. */
export function smsProvenance(channel: SmsChannel, at = now()): Provenance {
  if (channel === "signed_device") return { sourceTrust: "authenticated_source", verificationStatus: "channel_verified", verificationMethod: "device_signature", trustReason: "Sent by your paired phone with a valid signature. The bank sender name is as the phone reported it; Paytrace cannot prove the bank sent it.", verifiedAt: at };
  if (channel === "ios_token") return { sourceTrust: "authenticated_source", verificationStatus: "channel_verified", verificationMethod: "ios_shortcut_token", trustReason: "Sent by your iPhone Shortcut with your personal token. The SMS sender is as the Shortcut reported it; Paytrace cannot prove the bank sent it.", verifiedAt: at };
  return { sourceTrust: "unverified", verificationStatus: "not_verified", verificationMethod: "shared_pairing_code", trustReason: "Sent with the old shared pairing code, which does not prove which phone sent it.", verifiedAt: null };
}

/** An uploaded file is the person's own copy; its authenticity is not checked. */
export function statementProvenance(): Provenance {
  return { sourceTrust: "user_provided", verificationStatus: "not_verified", verificationMethod: "user_upload", trustReason: "From a bank statement you uploaded. Paytrace does not check the file came from the bank.", verifiedAt: null };
}

/** Anything with no check behind it (command-line imports, tests). */
export const UNVERIFIED: Provenance = { sourceTrust: "unverified", verificationStatus: "not_verified", verificationMethod: "none", trustReason: "No verification ran for this record.", verifiedAt: null };

export const LEGACY_REASON = "Recorded before Paytrace kept trust levels; not verified.";

/** A stored level, or "unverified" for older records. Never upgrades. */
export function readTrust(stored: { sourceTrust?: unknown; trustReason?: unknown }): { sourceTrust: SourceTrust; trustReason: string } {
  const level = SOURCE_TRUST.includes(stored.sourceTrust as SourceTrust) ? stored.sourceTrust as SourceTrust : null;
  return level ? { sourceTrust: level, trustReason: typeof stored.trustReason === "string" ? stored.trustReason : "" } : { sourceTrust: "unverified", trustReason: LEGACY_REASON };
}

export const TRUST_LABEL: Record<SourceTrust, string> = {
  verified_origin: "Sender verified",
  authenticated_source: "From your own device",
  user_provided: "You uploaded it",
  unverified: "Not verified"
};

/**
 * Independent confirmation of one payment: distinct channels (SMS, email,
 * statement), not copies. Two copies of one email are one event already
 * (same Gmail id), and two emails are still one channel.
 */
export function corroboration(evidence: { id: string; source: string }[]) {
  const sources = [...new Set(evidence.map(e => e.source))].sort();
  return { sources, independent: sources.length, corroborated: sources.length >= 2 };
}
