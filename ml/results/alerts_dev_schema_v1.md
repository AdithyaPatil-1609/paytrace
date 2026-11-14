# Job 3 · alert extraction · qwen3:14b · prompt v1 · schema

Set: `ml/data/alerts_dev.jsonl`, 20 synthetic alerts, none of which appear in the prompt.
An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.

| Measure | Result |
| --- | --- |
| Fully correct | **16/20 (80%)** |
| kind correct | 19/19 (100%) |
| merchantText correct | 19/19 (100%) |
| amountPaise correct | 19/19 (100%) |
| occurredOn correct | 18/19 (95%) |
| dueOn correct | 18/19 (95%) |
| reference correct | 18/19 (95%) |
| accountHint correct | 18/19 (95%) |
| Median time | 4.8 s |
| Slowest | 7.7 s |

| Category | Correct |
| --- | --- |
| bill | 1/1 |
| card | 3/3 |
| email | 1/1 |
| enach | 2/2 |
| failed | 1/2 |
| mandate | 2/3 |
| messy | 1/1 |
| negative | 1/2 |
| one_off | 1/1 |
| refund | 1/1 |
| secret | 1/1 |
| upi_autopay | 1/2 |

## Misses

- `Your A/c XX9912 debited INR 1,500.00 on 04/11/26 towards GYMFITLINE via UPI Autopay. UMN 8f3a21c09e.` → `{"kind":"debit_posted","merchantText":"GYMFITLINE","amountPaise":150000,"occurredOn":"2026-11-04","dueOn":null,"reference":"432198765432","accountHint":"9912"}` (wrong: reference)
- `Your UPI Autopay for Canva (UMN canva-2291) has been paused till 30 Nov 2026. You can resume it anyt` → `{"kind":"mandate_paused","merchantText":"Canva","amountPaise":null,"occurredOn":null,"dueOn":"2026-11-30","reference":"canva-2291","accountHint":null}` (wrong: dueOn)
- `Avl bal in A/c XX9912 is INR 23,410.55 as on 14-Nov-26. -Arclight Bank` → `{"kind":"not_payment","merchantText":null,"amountPaise":null,"occurredOn":null,"dueOn":null,"reference":null,"accountHint":"9912"}` (wrong: accountHint)
- `Txn of Rs 499 at CANVA declined on card XX2291 due to expired card on 07/11/26.` → `{"kind":"debit_failed","merchantText":"CANVA","amountPaise":49900,"occurredOn":"2026-11-14","dueOn":null,"reference":null,"accountHint":"2291"}` (wrong: occurredOn)
