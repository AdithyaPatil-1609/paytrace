# Job 1 · intent routing · qwen3:14b · schema

Test set: `ml/data/intent_test.jsonl`, 40 questions none of which appear in the prompt.
A question is correct only when intent, merchant, amount and period all match.

| Measure | Result |
| --- | --- |
| Fully correct | **39/40 (98%)** |
| intent correct | 39/40 (98%) |
| merchant correct | 40/40 (100%) |
| amount correct | 40/40 (100%) |
| period correct | 40/40 (100%) |
| Median time | 1.9 s |
| Slowest | 2.2 s |

| Category | Correct |
| --- | --- |
| amounts | 2/2 |
| hinglish | 7/7 |
| plain | 21/22 |
| typo | 3/3 |
| unknown | 3/3 |
| vague | 3/3 |

## Misses

- `what's leaving my account before friday` → `{"intent":"set_aside","merchant":null,"amount":null,"period":"before friday"}` (wrong: intent)
