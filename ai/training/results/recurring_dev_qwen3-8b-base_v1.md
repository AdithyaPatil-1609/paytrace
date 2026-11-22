# Job 4 on recurring_dev.jsonl: qwen3-8b-base (prompt v1)

- Verdict correct: **20/27 (74%)**
- Verdict and kind correct: 14/27
- Everyday spending still shown as recurring: 2/12
- Real commitments hidden as everyday spending (the worse error): 0/13
- Unreadable replies: 0
- Time: 73 s (2.7 s per group)

| Case | Statement text | Expected | Got |
| --- | --- | --- | --- |
| weekly hypermarket | `POS 416021XXXXXX4417 RELIANCE SMART` | everyday_spending | unsure (unknown) |
| food delivery | `UPI/ZOMATO LTD/501882231` | everyday_spending | unsure (unknown) |
| online shopping | `VPS/AMAZON SELLER SERVICES/88213` | everyday_spending | unsure (unknown) |
| electricity bill | `BIL/BPAY/BESCOM/000221` | commitment | unsure (unknown) |
| rides | `UPI/UBER INDIA SYSTEMS/77213` | everyday_spending | unsure (unknown) |
| metro card top-ups | `UPI/BMRCL NAMMA METRO RECHARGE` | everyday_spending | commitment (unknown) |
| weekly fuel | `UPI/HP PAY HPCL/77120` | everyday_spending | commitment (regular_transfer) |
