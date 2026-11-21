# Scalability: today and in production (card S11)

## Today: one laptop behind Cloudflare

```
phone / browser ──HTTPS──► Cloudflare (paytrace.co.in: TLS, WAF, rate rule on /api/)
                              │ named tunnel, outbound only: no open ports on the laptop
                              ▼
                     laptop: next start -H 127.0.0.1 ──► Neo4j AuraDB (personal), demo DB, Aura Agent DB
                                      └──► Qwen on Ollama / MLX (127.0.0.1 only)
```

**Measured** (production build, `scripts/load-test.ts`):

| Target | Load | p50 | p95 | Result |
| --- | --- | --- | --- | --- |
| Landing page | 50 requests/s for 20 s | 5 ms | 7 ms | all 200 |
| SMS intake, unsigned | 50 requests/s for 15 s | 4 ms | 6 ms | 30 × 401, then 429: the limit holds |

**What limits us today, and why it is safe:**

| Limit | Today | Protection |
| --- | --- | --- |
| The AI reader | One laptop GPU, one message at a time | A capped queue: extra requests get "busy" quickly instead of piling up |
| Request limits, one-use numbers, sandboxes | In this server's memory | One server process, so the counts are exact |
| Uptime | The laptop must stay awake and online | pm2 restarts, pull-based deploys with automatic rollback, phone hotspot as backup |

## Production: what changes

| Today | Production | Why |
| --- | --- | --- |
| One laptop, pm2 | Two or more app containers behind a load balancer | No single machine to lose |
| Limits and nonces in memory | Redis (`SET key NX PX`) shared by every server | Limits and replay checks stay exact across servers |
| Sandboxes in memory | Redis with a 2-hour expiry | Any server can serve any visitor |
| Qwen on the laptop | A GPU inference service inside our network, with a queue | Reads stay off third-party clouds |
| Neo4j AuraDB Free | Neo4j Aura Professional in an India region, with backups | Capacity, data residency, recovery |
| Gmail for approved test users | Google's security assessment (CASA) for the Gmail scope | Required for public Gmail access |
| Phone keys from the Android Keystore | Plus Play Integrity at pairing | Proves the app is genuine |
| SMS and email | Plus bank statements through the Account Aggregator, with a regulated partner | The RBI consent route for statements |
| Settings in `.env.local` | A secrets manager; key rotation with `PAYTRACE_AUTH_KEY_ID` | No secrets on disk |

Every limit already lives in one place (`lib/payments/rules.ts`, `lib/security/rate-limit.ts`), and every store sits behind a small function, so moving each one to Redis or a bigger database changes one file each, not the routes.
