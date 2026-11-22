# Job 3 · alert extraction · mlx-community/Qwen3-8B-4bit · v2 · qwen3-8b-base

Set: `ai/training/data/alerts_test.jsonl`, 49 synthetic alerts, none of which appear in the prompt.
An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.

| Measure | Result |
| --- | --- |
| Fully correct | **45/49 (92%)** |
| kind correct | 45/45 (100%) |
| merchantText correct | 44/45 (98%) |
| amountPaise correct | 45/45 (100%) |
| occurredOn correct | 42/45 (93%) |
| dueOn correct | 45/45 (100%) |
| reference correct | 45/45 (100%) |
| accountHint correct | 45/45 (100%) |
| Median time | 4.9 s |
| Slowest | 6.8 s |

| Category | Correct |
| --- | --- |
| df_t | 5/5 |
| dp_t | 5/5 |
| ds_t | 5/5 |
| mc_t | 5/5 |
| mp_t | 1/5 |
| mr_t | 5/5 |
| mx_t | 5/5 |
| np_t | 5/5 |
| rf_t | 5/5 |
| secret | 4/4 |

## Misses

- `ZEE5 autopay is on hold from 30Sep26 till 16Oct26 as requested. UMN d75a897495.` → `{"kind":"mandate_paused","merchantText":"ZEE5","amountPaise":null,"occurredOn":null,"dueOn":null,"reference":"d75a897495","accountHint":null}` (wrong: occurredOn)
- `Canva autopay is on hold from 05/11/2026 till 04/01/2027 as requested. UMN 7084256b9d.` → `{"kind":"mandate_paused","merchantText":"Canva","amountPaise":null,"occurredOn":"2026-11-07","dueOn":null,"reference":"7084256b9d","accountHint":null}` (wrong: occurredOn)
- `ACT FIBERNET autopay is on hold from 15-Feb-2026 till 19/03/2026 as requested. UMN 363f4139a3.` → `{"kind":"mandate_paused","merchantText":"FIBERNET","amountPaise":null,"occurredOn":"2026-02-15","dueOn":null,"reference":"363f4139a3","accountHint":null}` (wrong: merchantText)
- `GOOGLE*YOUTUBEPREM autopay is on hold from 21-10-26 till 13 December 2026 as requested. UMN kcddg79@` → `{"kind":"mandate_paused","merchantText":"GOOGLE*YOUTUBEPREM","amountPaise":null,"occurredOn":null,"dueOn":null,"reference":"kcddg79@upi","accountHint":null}` (wrong: occurredOn)
