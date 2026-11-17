# Job 3 · alert extraction · mlx-community/Qwen3-8B-4bit + adapter ml/adapters/qwen3-8b-alerts · v2 · qwen3-8b-tuned

Set: `ml/data/alerts_test.jsonl`, 49 synthetic alerts, none of which appear in the prompt.
An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.

| Measure | Result |
| --- | --- |
| Fully correct | **49/49 (100%)** |
| kind correct | 45/45 (100%) |
| merchantText correct | 45/45 (100%) |
| amountPaise correct | 45/45 (100%) |
| occurredOn correct | 45/45 (100%) |
| dueOn correct | 45/45 (100%) |
| reference correct | 45/45 (100%) |
| accountHint correct | 45/45 (100%) |
| Median time | 5.1 s |
| Slowest | 6.1 s |

| Category | Correct |
| --- | --- |
| df_t | 5/5 |
| dp_t | 5/5 |
| ds_t | 5/5 |
| mc_t | 5/5 |
| mp_t | 5/5 |
| mr_t | 5/5 |
| mx_t | 5/5 |
| np_t | 5/5 |
| rf_t | 5/5 |
| secret | 4/4 |
