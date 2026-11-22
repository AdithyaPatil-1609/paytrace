# Job 1 · intent routing · qwen3:14b · prompt v2 · schema

Test set: `ai/training/data/intent_test.jsonl`, 40 questions none of which appear in the prompt.
A question is correct only when intent, merchant, amount and period all match.

| Measure | Result |
| --- | --- |
| Fully correct | **40/40 (100%)** |
| intent correct | 40/40 (100%) |
| merchant correct | 40/40 (100%) |
| amount correct | 40/40 (100%) |
| period correct | 40/40 (100%) |
| Median time | 2.7 s |
| Slowest | 3.1 s |

| Category | Correct |
| --- | --- |
| amounts | 2/2 |
| hinglish | 7/7 |
| plain | 22/22 |
| typo | 3/3 |
| unknown | 3/3 |
| vague | 3/3 |
