# Job 4 on recurring_dev.jsonl: qwen3-14b (prompt v1)

- Verdict correct: **24/27 (89%)**
- Verdict and kind correct: 19/27
- Everyday spending still shown as recurring: 3/12
- Real commitments hidden as everyday spending (the worse error): 0/13
- Unreadable replies: 0
- Time: 54 s (2.0 s per group)

| Case | Statement text | Expected | Got |
| --- | --- | --- | --- |
| fuel in round amounts | `UPI/INDIAN OIL CORP LTD/600998812` | everyday_spending | commitment (bill) |
| metro card top-ups | `UPI/BMRCL NAMMA METRO RECHARGE` | everyday_spending | commitment (regular_transfer) |
| weekly fuel | `UPI/HP PAY HPCL/77120` | everyday_spending | commitment (bill) |
