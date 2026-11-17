# Job 1 · intent routing · qwen3:14b · prompt v2 · schema

Test set: `ml/data/intent_test_v2.jsonl`, 40 questions none of which appear in the prompt.
A question is correct only when intent, merchant, amount and period all match.

| Measure | Result |
| --- | --- |
| Fully correct | **36/40 (90%)** |
| intent correct | 40/40 (100%) |
| merchant correct | 38/40 (95%) |
| amount correct | 40/40 (100%) |
| period correct | 38/40 (95%) |
| Median time | 1.8 s |
| Slowest | 2.8 s |

| Category | Correct |
| --- | --- |
| amounts | 2/2 |
| borderline | 6/8 |
| hinglish | 4/5 |
| plain | 15/16 |
| typo | 2/2 |
| unknown | 3/3 |
| vague | 4/4 |

## Misses

- `how much is due before payday` → `{"intent":"upcoming_total","merchant":null,"amount":null,"period":"before salary"}` (wrong: period)
- `kal tak kya kya katega` → `{"intent":"upcoming_total","merchant":null,"amount":null,"period":"before yesterday"}` (wrong: period)
- `is saal ab tak kitna kharch hua subscriptions pe` → `{"intent":"spend_total","merchant":"subscriptions","amount":null,"period":"this year"}` (wrong: merchant)
- `how much went to subscriptions in the last 6 months` → `{"intent":"spend_total","merchant":"subscriptions","amount":null,"period":"last 6 months"}` (wrong: merchant)
