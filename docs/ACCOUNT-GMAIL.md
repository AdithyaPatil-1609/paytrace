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
GMAIL_ALLOWED_DOMAINS=gmail.com
```

Generate the key once with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Use `gmail.com` only for controlled test receipts, and for real mail use the verified exact sender domains you intend to accept, comma-separated. Do not rotate the key without a plan to reauthorize mailboxes. Keep the same key in the app and worker.

6. `npm install`, then `npm run dev`. Open `http://localhost:3000/account`, sign in and open the account menu in the original five-tab dashboard. Click Connect Gmail securely and approve Google's permission prompt using the same Google account. The dashboard starts the first sync.
7. In a separate terminal, run `npm run gmail:accounts -- --watch` to sync consenting accounts periodically (45-second delay between passes). The open dashboard refreshes its summary every 10 seconds. The first sync searches up to 90 days of eligible email; later passes overlap two days to avoid missing messages. This is near-real-time polling, not instant push delivery.

## Behaviour and limits

- Each account gets a separate graph profile derived from the verified Google subject. Cookies hold opaque session IDs, session hashes and encrypted refresh tokens stay server-side. Each background sync checks the current grant, and private summary reads use the server-side session, never user-supplied profile IDs.
- The original All payments, Issues, Cancel paths, Annual and Evidence graph screens use that user's imported dataset. The account menu holds Gmail connection, sync, disconnect and logout. The All payments screen also shows recent imported events, including one-offs. Demo-only simulation and unscoped demo Cypher calls are disabled in personal mode. What-if previews run against a temporary copy of the user's own records. Cancellation decisions are local UI reports, not actual payment cancellation.
- Gmail is read-only; the Gmail permission technically covers reading the mailbox, but Paytrace queries financial subjects from configured sender domains and extracts supported event fields. Other emails are skipped. Mail bodies and access tokens are not stored in the graph. Receipt parsing is deliberately narrow; not all real bank or merchant formats are supported. Sender-domain filtering alone does not authenticate a payment.
- Disconnect removes the local grant and attempts Google revocation. It stops future imports but retains previously imported payment evidence. Signing out ends the browser session, not the connected Gmail grant. The user may disconnect before signing out.
- `/?demo=1` remains the synthetic dashboard; it does not show the signed-in account's private graph. The legacy device/desktop ingestion is unchanged and remains a separate test profile; personal SMS pairing is not part of this feature.
- Use a private test environment and only consented test data. Before public rollout, configure production HTTPS and a separate production OAuth client, implement data retention/deletion and review security, and complete Google's applicable restricted-scope verification/security assessment. Google's Testing audience is not unrestricted access to all users. Refer to https://developers.google.com/workspace/gmail/api/auth/scopes and https://developers.google.com/identity/protocols/oauth2/web-server.
