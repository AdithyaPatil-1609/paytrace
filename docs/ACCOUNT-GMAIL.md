# Personal accounts and optional Gmail linking

This flow is separate from the desktop Gmail test script and the synthetic dashboard. Each user signs in with Google, then independently chooses whether to grant Gmail read-only access. Sign-in alone cannot read email. The linked Google identity must match the signed-in identity.

## Local configuration

1. Start Neo4j. Keep your existing Neo4j credentials in `.env.local`.
2. In the Google Cloud project with Gmail API enabled, open Google Auth Platform → Clients. Create a **Web application** OAuth client. Keep the old Desktop client for `gmail:authorize` if needed.
3. Register the exact authorized redirect URI `http://localhost:3000/api/auth/google/callback`. If using a different port or hostname, change both Google Cloud and `PAYTRACE_APP_URL` to match.
4. Configure the Google consent screen, add `https://www.googleapis.com/auth/gmail.readonly` to the requested scopes, and add the consenting test users under Audience if the app is in Testing mode.
5. Add the following settings to the existing `.env.local` (do not overwrite existing values or commit secrets):

```dotenv
PAYTRACE_APP_URL=http://localhost:3000
GOOGLE_WEB_CLIENT_ID=your-web-client-id
GOOGLE_WEB_CLIENT_SECRET=your-web-client-secret
PAYTRACE_AUTH_KEY=your-64-character-hex-key
GMAIL_ALLOWED_DOMAINS=.com,.in
```

Generate the key once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. `.com,.in` accepts any sender domain ending in either suffix, including subdomains such as `alerts.bank.co.in`. For a narrower test, use comma-separated exact domains such as `gmail.com,bank.co.in`. Suffixes and exact domains can be mixed. Do not rotate the key without a plan to reauthorize mailboxes. Keep the same key in the app and worker.

If upgrading from the old exact-domain configuration, change the existing `GMAIL_ALLOWED_DOMAINS` value, remove any obsolete subject-only `GMAIL_ACCOUNT_QUERY` override (or change it to a body-inclusive search), and restart both the app and the worker. For older receipts missed during a previous import, disconnect and reconnect Gmail to repeat the initial 90-day scan. Existing imported evidence remains and provider IDs prevent duplicate imports.

6. `npm install`, then `npm run dev`. Open `http://localhost:3000/account`, sign in and open the account menu in the original five-tab dashboard. Click Connect Gmail securely and approve Google's permission prompt using the same Google account. The dashboard starts the first sync.
7. In a separate terminal, run `npm run gmail:accounts -- --watch` to sync consenting accounts periodically (45-second delay between passes). The open dashboard refreshes its summary every 10 seconds. The first sync searches up to 90 days of eligible email; later passes overlap two days to avoid missing messages. This is near-real-time polling, not instant push delivery.

## Behaviour and limits

- Each account gets a separate graph profile derived from the verified Google subject. Cookies hold opaque session IDs, session hashes and encrypted refresh tokens stay server-side. Each background sync checks the current grant, and private summary reads use the server-side session, never user-supplied profile IDs.
- The original All payments, Issues, Cancel paths, Annual and Evidence graph screens use that user's imported dataset. The account menu holds Gmail connection, sync, disconnect and logout. The All payments screen also shows recent imported events, including one-offs. Demo-only simulation and unscoped demo Cypher calls are disabled in personal mode. What-if previews run against a temporary copy of the user's own records. Cancellation decisions are local UI reports, not actual payment cancellation.
- Confirmed zero-cost subscription orders (including fully discounted plans) are stored as `subscription_registered` evidence, not payments. The subscription watchlist on All payments and Issues shows the listed price, ₹0 paid, and an upcoming renewal alert within 30 days only when an explicit billing/renewal date is available. No dates or future charges are inferred. They are excluded from recurring expenditure estimates until actual payment evidence is available. For receipts skipped before upgrading, reconnect Gmail for a fresh 90-day scan.
- Use **Rescan last 90 days** in the account menu to reprocess older receipts without disconnecting Gmail. The result reports counts of scanned messages, new events, duplicates, sender-filtered messages and unrecognized subscription notices. MIME plain-text and HTML alternatives are inspected independently; neither raw content nor attachment contents are stored. Conflicting totals are not posted as debits.
- Gmail is read-only; the permission technically covers reading the mailbox. By default Paytrace searches financial terms in subjects and message contents, including subjectless messages. With suffix rules, it checks the actual From domain after retrieving candidates; exact-only rules also narrow the Gmail search itself. Non-matching senders and unsupported messages are skipped. Mail bodies and access tokens are not stored in the graph. Receipt parsing is deliberately narrow and only INR amounts are supported; not all real bank or merchant formats are supported. An order confirmation without payment evidence is not treated as a debit. Sender-domain filtering alone does not authenticate a payment; broad suffix rules increase the risk of misleading receipts, so independently corroborate payments with bank evidence.
- Disconnect removes the local grant and attempts Google revocation. It stops future imports but retains previously imported payment evidence. Signing out ends the browser session, not the connected Gmail grant. The user may disconnect before signing out.
- If authorization or sync fails, the account banner now shows a specific recovery message (expired consent, rejected OAuth configuration, Gmail API access, rate limit, invalid sender configuration, or Neo4j availability). The web server and worker log only a fixed error code, not mailbox contents or credentials. Use the exact `PAYTRACE_APP_URL` origin when testing. Sync skips deleted/invalid messages, retries temporary Gmail quota/server errors, and renews its lease between pages for longer imports.
- `/?demo=1` remains the synthetic dashboard; it does not show the signed-in account's private graph. The legacy device/desktop ingestion remains a separate test profile; it shares the Gmail domain rules. Personal SMS pairing is not part of this feature.
- Use a private test environment and only consented test data. Before public rollout, configure production HTTPS and a separate production OAuth client, implement data retention/deletion and review security, and complete Google's applicable restricted-scope verification/security assessment. Google's Testing audience is not unrestricted access to all users. Refer to https://developers.google.com/workspace/gmail/api/auth/scopes and https://developers.google.com/identity/protocols/oauth2/web-server.
