# Job 3 · alert extraction · mlx-community/Qwen3-8B-4bit · v2 · qwen3-8b-base

Set: `ml/data/alerts_dev.jsonl`, 20 synthetic alerts, none of which appear in the prompt.
An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.

| Measure | Result |
| --- | --- |
| Fully correct | **15/20 (75%)** |
| kind correct | 19/19 (100%) |
| merchantText correct | 19/19 (100%) |
| amountPaise correct | 19/19 (100%) |
| occurredOn correct | 15/19 (79%) |
| dueOn correct | 19/19 (100%) |
| reference correct | 18/19 (95%) |
| accountHint correct | 19/19 (100%) |
| Median time | 5.8 s |
| Slowest | 8.2 s |

| Category | Correct |
| --- | --- |
| bill | 1/1 |
| card | 2/3 |
| email | 1/1 |
| enach | 1/2 |
| failed | 0/2 |
| mandate | 3/3 |
| messy | 1/1 |
| negative | 2/2 |
| one_off | 1/1 |
| refund | 1/1 |
| secret | 1/1 |
| upi_autopay | 1/2 |

## Misses

- `Rs.139.00 spent on Arclight Bank Credit Card XX2291 at SPOTIFY on 11-11-2026. Avl Lmt: Rs.84,210.00.` → `{"kind":"debit_posted","merchantText":"SPOTIFY","amountPaise":13900,"occurredOn":"2026-11-14","dueOn":null,"reference":null,"accountHint":"2291"}` (wrong: occurredOn)
- `Your A/c XX9912 debited INR 1,500.00 on 04/11/26 towards GYMFITLINE via UPI Autopay. UMN 8f3a21c09e.` → `{"kind":"debit_posted","merchantText":"GYMFITLINE","amountPaise":150000,"occurredOn":"2026-11-04","dueOn":null,"reference":"432198765432","accountHint":"9912"}` (wrong: reference)
- `Mandate UMRN ARCL0099887766 for HDFC LIFE INSURANCE has been revoked successfully on 12-Nov-2026.` → `{"kind":"mandate_cancelled","merchantText":"HDFC LIFE INSURANCE","amountPaise":null,"occurredOn":"2026-11-14","dueOn":null,"reference":"ARCL0099887766","accountHint":null}` (wrong: occurredOn)
- `Autopay of Rs.8,500.00 for LIC HSG EMI could not be processed due to insufficient balance in A/c XX9` → `{"kind":"debit_failed","merchantText":"LIC HSG EMI","amountPaise":850000,"occurredOn":"2026-11-14","dueOn":null,"reference":null,"accountHint":"9912"}` (wrong: occurredOn)
- `Txn of Rs 499 at CANVA declined on card XX2291 due to expired card on 07/11/26.` → `{"kind":"debit_failed","merchantText":"CANVA","amountPaise":49900,"occurredOn":"2026-11-14","dueOn":null,"reference":null,"accountHint":"2291"}` (wrong: occurredOn)
