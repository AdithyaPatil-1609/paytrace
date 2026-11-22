# Job 4 on recurring_test.jsonl: qwen3-8b-tuned (prompt v1)

- Verdict correct: **193/204 (95%)**
- Verdict and kind correct: 178/204
- Everyday spending still shown as recurring: 9/76
- Real commitments hidden as everyday spending (the worse error): 1/116
- Unreadable replies: 0
- Time: 536 s (2.6 s per group)

| Case | Statement text | Expected | Got |
| --- | --- | --- | --- |
| ZOMATO GOLD | `UPI/P2M/5190630004/ZOMATO GOLD` | commitment | everyday_spending (food) |
| EATSURE | `CARD EATSURE MUMBAI` | everyday_spending | commitment (insurance) |
| EATSURE | `EATSURE*80472` | everyday_spending | commitment (subscription) |
| EATSURE | `EATSURE` | everyday_spending | commitment (subscription) |
| BLUSMART | `BLUSMART*74459` | everyday_spending | commitment (subscription) |
| WELLNESS FOREVER | `CARD WELLNESS FOREVER MUMBAI` | everyday_spending | commitment (insurance) |
| WELLNESS FOREVER | `UPI/WELLNESS FOREVER/7425523896` | everyday_spending | commitment (membership) |
| WELLNESS FOREVER | `WELLNESSFOREVER*10970` | everyday_spending | commitment (membership) |
| WELLNESS FOREVER | `WELLNESS FOREVER` | everyday_spending | commitment (membership) |
| VIKRAM SINGH | `UPI/VIKRAM SINGH/9333258981` | everyday_spending | commitment (regular_transfer) |
| Q55120846@AXL | `Q55120846@Axl` | unsure | everyday_spending (transfer) |
