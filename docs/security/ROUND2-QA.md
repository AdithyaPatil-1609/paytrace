# Mentor Round 2: security and privacy answers (Hanish)

Short answers to the questions judges ask, each with where to show the proof.

**1. "Is this real data? How do you protect it?"**
Yes, real Gmail and bank SMS, with consent. Gmail is read-only and asked for on a consent screen first (`/consent/gmail`). Tokens are encrypted (AES-256-GCM, with key versions), sessions are hashed, and every query starts from the signed-in person, never from an id the browser sends. Show: the consent screen, then `docs/security/REMEDIATION.md`.

**2. "Can someone send fake bank SMS to your server?"**
Not as someone else. Each phone pairs once with a one-time code and signs every request with a key kept in the Android Keystore. The server checks the time (5 minutes), a one-use number (replays get 409) and the signature over the exact bytes, all before reading the message. Show: `/sandbox` → Try to break it → the four signed-phone attacks.

**3. "What if a message tricks your AI?"**
Messages that give orders to an AI are dropped before any model sees them. The AI only fills a fixed form, and every value must appear word for word in the original message, or it is removed. Show: sandbox → Prompt injection, and the step-by-step trace.

**4. "What about OTPs?"**
Dropped on the phone and again on the server; never sent, stored or shown to a model. Show: sandbox → OTP message.

**5. "Fake emails?"**
Gmail checks DKIM and DMARC on every email. Paytrace trusts only Google's own verdict and never reads an email Gmail says the From domain did not send.

**6. "How long does someone stay logged in?"**
12 hours at most, 30 minutes idle, token replaced every 2 hours. "Sign out on every device" and "Delete my data" are in the account menu.

**7. "Can one user see another's data?"**
No. Tested: `tests/cypher/account-isolation.test.ts`, and `scripts/two-account-check.ts` on the live site (copies every id from A into B's requests).

**8. "What did the security scan find?"**
ArgosX baseline: 97/100, Security 100, nothing exploitable; 3 low SEO findings fixed, 1 accepted (our wordmark). Final scan this morning on the frozen build.

**9. "What would you do before a real launch?"**
Google's security assessment (CASA) for Gmail, Play Integrity at pairing, Redis for limits across servers, an outside penetration test, and a DPDP breach-response process. See `docs/SCALABILITY.md`.

**10. "Is it compliant with RBI and DPDP?"**
RBI's E-mandate Framework 2026 makes banks send a 24-hour pre-debit notice with merchant, amount, date and reference: that is exactly what Paytrace reads. DPDP: purpose-limited consent, minimum data (fields only, no message text), withdrawal (Disconnect Gmail), and deletion (Delete my data).
