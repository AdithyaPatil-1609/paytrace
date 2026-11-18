# Job 1 · intent routing · qwen3:14b · prompt v1 · schema

Test set: `ml/data/intent_test_v2.jsonl`, 40 questions none of which appear in the prompt.
A question is correct only when intent, merchant, amount and period all match.

| Measure | Result |
| --- | --- |
| Fully correct | **33/40 (82%)** |
| intent correct | 36/40 (90%) |
| merchant correct | 38/40 (95%) |
| amount correct | 40/40 (100%) |
| period correct | 37/40 (92%) |
| Median time | 1.9 s |
| Slowest | 2.9 s |

| Category | Correct |
| --- | --- |
| amounts | 2/2 |
| borderline | 3/8 |
| hinglish | 4/5 |
| plain | 15/16 |
| typo | 2/2 |
| unknown | 3/3 |
| vague | 4/4 |

## Misses

- `what goes out before the weekend` → `{"intent":"set_aside","merchant":null,"amount":null,"period":"before the weekend"}` (wrong: intent)
- `anything getting debited before the 15th?` → `{"intent":"set_aside","merchant":null,"amount":null,"period":"before the 15th"}` (wrong: intent)
- `how much is due before payday` → `{"intent":"set_aside","merchant":null,"amount":null,"period":"before salary"}` (wrong: intent, period)
- `kal tak kya kya katega` → `{"intent":"unknown","merchant":null,"amount":null,"period":null}` (wrong: intent, period)
- `how much buffer should i leave before payday` → `{"intent":"set_aside","merchant":null,"amount":null,"period":"before salary"}` (wrong: period)
- `is saal ab tak kitna kharch hua subscriptions pe` → `{"intent":"spend_total","merchant":"subscriptions","amount":null,"period":"this year"}` (wrong: merchant)
- `how much went to subscriptions in the last 6 months` → `{"intent":"spend_total","merchant":"subscriptions","amount":null,"period":"last 6 months"}` (wrong: merchant)
