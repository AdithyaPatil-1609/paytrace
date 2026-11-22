# Job 3 · alert extraction · qwen3:14b · v2 · schema

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
| Median time | 4.7 s |
| Slowest | 8.9 s |

| Category | Correct |
| --- | --- |
| df_t | 5/5 |
| dp_t | 4/5 |
| ds_t | 5/5 |
| mc_t | 5/5 |
| mp_t | 2/5 |
| mr_t | 5/5 |
| mx_t | 5/5 |
| np_t | 5/5 |
| rf_t | 5/5 |
| secret | 4/4 |

## Misses

- `Txn alert: APPLE.COM/BILL charged Rs 393 to your credit card xx6284 on 23.07.2026 (recurring payment` → `{"kind":"debit_posted","merchantText":"APPLE.COM","amountPaise":39300,"occurredOn":"2026-07-23","dueOn":null,"reference":"623652512828","accountHint":"6284"}` (wrong: merchantText)
- `ZEE5 autopay is on hold from 30Sep26 till 16Oct26 as requested. UMN d75a897495.` → `{"kind":"mandate_paused","merchantText":"ZEE5","amountPaise":null,"occurredOn":null,"dueOn":null,"reference":"d75a897495","accountHint":null}` (wrong: occurredOn)
- `CANVA.COM PADDLE.NET autopay is on hold from 11 Oct till 16 November 2026 as requested. UMN 10320495` → `{"kind":"mandate_paused","merchantText":"CANVA.COM PADDLE.NET","amountPaise":null,"occurredOn":null,"dueOn":null,"reference":"1032049594","accountHint":null}` (wrong: occurredOn)
- `GOOGLE*YOUTUBEPREM autopay is on hold from 21-10-26 till 13 December 2026 as requested. UMN kcddg79@` → `{"kind":"mandate_paused","merchantText":"GOOGLE*YOUTUBEPREM","amountPaise":null,"occurredOn":null,"dueOn":null,"reference":"kcddg79@upi","accountHint":null}` (wrong: occurredOn)
