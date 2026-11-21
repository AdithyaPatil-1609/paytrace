# Deploying Paytrace (cards S4, S7, S11)

## Today: one laptop behind Cloudflare

```
phone / browser ──HTTPS──► Cloudflare (paytrace.co.in: WAF, rate rule on /api/, Always HTTPS)
                              │ named tunnel (outbound only; no open ports on the laptop)
                              ▼
                     laptop: cloudflared ──► next start -H 127.0.0.1 :3000 ──► Neo4j AuraDB
                                                         └──► Qwen on Ollama / MLX (127.0.0.1)
```

### One-time setup on the laptop

```bash
npm i -g pm2
scripts/deploy/deploy.sh setup                       # ~/paytrace-deploy, git mirror
cp .env.local ~/paytrace-deploy/shared/.env.local    # real settings, outside git
chmod 600 ~/paytrace-deploy/shared/.env.local
scripts/deploy/deploy.sh once                        # first deploy of main (needs green CI)
pm2 start scripts/deploy/ecosystem.config.cjs && pm2 save
caffeinate -dimsu &                                  # keep the laptop awake
```

`.env.local` for the domain: `PAYTRACE_APP_URL=https://paytrace.co.in/`, and add `https://paytrace.co.in/api/auth/google/callback` to the Google OAuth client.

### Named tunnel (after Cloudflare says the domain is active)

```bash
cloudflared tunnel login
cloudflared tunnel create paytrace
cloudflared tunnel route dns paytrace paytrace.co.in
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: paytrace
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: paytrace.co.in
    service: http://127.0.0.1:3000
  - service: http_status:404
```

In the Cloudflare dashboard: SSL/TLS **Full**, **Always Use HTTPS** on, managed WAF rules on, one rate-limiting rule for `/api/*`. Check that bot protection does not block ArgosX.

### Everyday commands

| Task | Command |
| --- | --- |
| What is live | `scripts/deploy/deploy.sh status` |
| Stop deploys (judging, mentor rounds) | `touch ~/paytrace-deploy/DEPLOY_FREEZE` |
| Resume deploys | `rm ~/paytrace-deploy/DEPLOY_FREEZE` |
| Roll back one release | `scripts/deploy/deploy.sh rollback` (also freezes) |
| Logs | `pm2 logs paytrace`, `tail -f ~/paytrace-deploy/deploy.log` |

The deployer only ships a commit of `main` whose CI checks all passed. If the build fails, the old version keeps running. If the new version does not answer within 30 seconds, it switches back by itself.

## Load test (card S11)

```bash
npx tsx scripts/load-test.ts http://127.0.0.1:3000/ 50 60                       # dashboard page
npx tsx scripts/load-test.ts http://127.0.0.1:3000/api/ingest/sms 50 30 post    # must be 401/429, never 202
```

Record the p50/p95 times and status counts in `docs/security/REMEDIATION.md`.

## Production: what changes

| Today (hackathon) | Production |
| --- | --- |
| One laptop, pm2 | Two or more app servers behind a load balancer (containers) |
| Limits and nonces in memory | Redis shared by every server |
| Neo4j AuraDB Free | Neo4j Aura Professional, India region, backups |
| Qwen on the laptop | A GPU inference server inside our network |
| Phone keys from the Keystore | Plus Play Integrity attestation at pairing |
| Gmail for approved test users | Google CASA security assessment for the Gmail scope |
| Bank SMS and email | Plus RBI Account Aggregator for statements, with consent |
| Settings in `.env.local` | A secrets manager; key rotation with `PAYTRACE_AUTH_KEY_ID` |
