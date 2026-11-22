# Job 4 on recurring_test.jsonl: qwen3-14b (prompt v1)

- Verdict correct: **178/204 (87%)**
- Verdict and kind correct: 147/204
- Everyday spending still shown as recurring: 5/76
- Real commitments hidden as everyday spending (the worse error): 5/116
- Unreadable replies: 0
- Time: 696 s (3.4 s per group)

| Case | Statement text | Expected | Got |
| --- | --- | --- | --- |
| ZOMATO GOLD | `ZOMATOGOLD*84253` | commitment | everyday_spending (food) |
| ZOMATO GOLD | `UPI/P2M/5190630004/ZOMATO GOLD` | commitment | everyday_spending (shopping) |
| VI POSTPAID | `VI POSTPAID` | commitment | everyday_spending (unknown) |
| VI POSTPAID | `NETBANKING VI POSTPAID 4642718004` | commitment | unsure (unknown) |
| VI POSTPAID | `Vi Postpaid` | commitment | everyday_spending (unknown) |
| BSNL FTTH | `NETBANKING BSNL FTTH 5938110697` | commitment | unsure (unknown) |
| HATHWAY BROADBAND | `UPI/P2M/4786257551/HATHWAY BROADBAND` | commitment | everyday_spending (unknown) |
| STAR BAZAAR | `STARBAZAAR*4311` | everyday_spending | unsure (unknown) |
| STAR BAZAAR | `POS STAR BAZAAR BANGALORE` | everyday_spending | unsure (unknown) |
| ZEPTO | `UPI/ZEPTO/2585644455` | everyday_spending | unsure (unknown) |
| INDIAN OIL | `UPI/P2M/7014390432/INDIAN OIL` | everyday_spending | commitment (unknown) |
| INDIAN OIL | `UPI-INDIAN OIL-8548533191` | everyday_spending | commitment (bill) |
| SHELL INDIA | `CARD SHELL INDIA MUMBAI` | everyday_spending | unsure (unknown) |
| SHELL INDIA | `CARD SHELL INDIA MUMBAI` | everyday_spending | unsure (unknown) |
| RAPIDO | `UPI/RAPIDO/4349918526` | everyday_spending | unsure (unknown) |
| BLUSMART | `UPI-BLUSMART-4451606939` | everyday_spending | commitment (regular_transfer) |
| BLUSMART | `POS BLUSMART BANGALORE` | everyday_spending | unsure (unknown) |
| BLUSMART | `BLUSMART*74459` | everyday_spending | commitment (regular_transfer) |
| WELLNESS FOREVER | `CARD WELLNESS FOREVER MUMBAI` | everyday_spending | unsure (unknown) |
| WELLNESS FOREVER | `UPI/WELLNESS FOREVER/7425523896` | everyday_spending | unsure (unknown) |
| WELLNESS FOREVER | `WELLNESSFOREVER*10970` | everyday_spending | unsure (unknown) |
| WELLNESS FOREVER | `WELLNESS FOREVER` | everyday_spending | unsure (unknown) |
| VIKRAM SINGH | `UPI/VIKRAM SINGH/9333258981` | everyday_spending | commitment (regular_transfer) |
| VIKRAM SINGH | `Vikram Singh` | everyday_spending | unsure (unknown) |
| VIKRAM SINGH | `VIKRAM SINGH` | everyday_spending | unsure (unknown) |
| VIKRAM SINGH | `UPI/P2M/2097221873/VIKRAM SINGH` | everyday_spending | unsure (unknown) |
