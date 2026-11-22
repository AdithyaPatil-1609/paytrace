# Job 3 · alert extraction · mlx-community/Qwen3-8B-4bit + adapter ai/training/adapters/qwen3-8b-alerts · v2 · qwen3-8b-tuned

Set: `ai/training/data/alerts_dev.jsonl`, 20 synthetic alerts, none of which appear in the prompt.
An alert is correct only when all seven fields match; a secret-bearing alert only when it is dropped before the model.

| Measure | Result |
| --- | --- |
| Fully correct | **20/20 (100%)** |
| kind correct | 19/19 (100%) |
| merchantText correct | 19/19 (100%) |
| amountPaise correct | 19/19 (100%) |
| occurredOn correct | 19/19 (100%) |
| dueOn correct | 19/19 (100%) |
| reference correct | 19/19 (100%) |
| accountHint correct | 19/19 (100%) |
| Median time | 5.6 s |
| Slowest | 6.9 s |

| Category | Correct |
| --- | --- |
| bill | 1/1 |
| card | 3/3 |
| email | 1/1 |
| enach | 2/2 |
| failed | 2/2 |
| mandate | 3/3 |
| messy | 1/1 |
| negative | 2/2 |
| one_off | 1/1 |
| refund | 1/1 |
| secret | 1/1 |
| upi_autopay | 2/2 |
