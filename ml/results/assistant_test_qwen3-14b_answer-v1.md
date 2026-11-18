# Job 2 · the whole assistant · qwen3:14b · intent prompt v2 · answer prompt v1

Test set: `ml/data/assistant_test.jsonl`, 30 questions about the demo payments (as of 2026-10-22).
Each question runs the full path: secret filter → Job 1 routing → facts worked out in code → Job 2 wording → number check.
A question passes only when every check on it passes.

| Measure | Result |
| --- | --- |
| Fully correct | **30/30 (100%)** |
| Routed to the right intent | 30/30 |
| Key facts in the reply | 30/30 |
| Wording used as expected | 30/30 |
| Unknown payment reported as not found | 2/2 |
| Median time | 8.9 s |
| Slowest | 12.7 s |

| Category | Correct |
| --- | --- |
| after_cancel | 2/2 |
| cancel | 3/3 |
| merchant | 3/3 |
| not_found | 2/2 |
| set_aside | 2/2 |
| spend | 3/3 |
| status | 3/3 |
| unknown | 2/2 |
| upcoming | 5/5 |
| why | 5/5 |

"Wording used" means Qwen's sentence passed the number check, so it was shown. Cancel steps, out-of-scope
questions and empty periods always use the app's own sentence by design, and are expected to.

**Read this score with care.** These 30 questions were used while building the assistant: the first run scored
22/30, and the misses led to fixes (matching by amount, partial names, a less strict sentence check). So this is
not a held-out score. A further 8 unseen questions were tried by hand; they found four more gaps, also fixed.
Expect new questions to find more. Correct wording is also checked only for numbers: a reply can still state
something the facts do not say, so the replies below were read by a person.

## Every reply

| | Question | Intent | Reply | Worded by |
| --- | --- | --- | --- | --- |
| ✓ | How much will go out next month? | upcoming_total | ₹14,895 will go out in November 2026. This includes 11 payments listed, with some amounts varying. There are 3 more payments not listed. | qwen3:14b |
| ✓ | what autopays hit in the next 2 weeks | upcoming_total | ₹10,030 will be taken in the next 2 weeks. Payments are: ₹30 on 2 Nov 2026 for Caller tune, ₹1,500 on 4 Nov 2026 for FitLine Gym, and ₹8,500 on 5 Nov 2026 for Home loan. Society payment has no fixed date. | qwen3:14b |
| ✓ | anything getting debited this week? | upcoming_total | Nothing is due by autopay in the rest of this week. The next is Caller tune, ₹30 on 2 Nov 2026. | fixed |
| ✓ | agle mahine kitna katega | upcoming_total | ₹14,895 will be deducted in November 2026. This includes fixed payments and estimates. Some payments may vary. | qwen3:14b |
| ✓ | when is the prime renewal and how much | upcoming_total | Nothing is due by autopay in the next 30 days. The next is Amazon Prime, ₹1,499 on 15 Aug 2027. | fixed |
| ✓ | how much should I keep aside for november | set_aside | You should keep aside ₹14,895 for November 2026. This includes 11 payments, with some amounts varying. Additional payments not listed may also occur. | qwen3:14b |
| ✓ | how much money do I need to leave in the account before the 10th of november | set_aside | You need ₹10,659 in your account before 10 Nov 2026. Five payments will be made: ₹30, ₹1,500, ₹8,500, ₹499, and ₹130. These include a home loan and other services. | qwen3:14b |
| ✓ | why did spotify charge me | why_debit | Spotify charged you for Spotify Premium. The amount changed from ₹119 to ₹139. No price change notice was sent. | qwen3:14b |
| ✓ | what is this 1500 debit every month | why_debit | This ₹1,500 debit every month is for your FitLine Gym gym membership. It is paid by UPI Autopay. The charge has repeated 12 times since November 2025. | qwen3:14b |
| ✓ | why was I charged for youtube | why_debit | You were charged for YouTube Premium, which repeats every month. The amount is ₹149, paid by Card. The charge started on 29 Apr 2026 and ended on 29 Oct 2026. | qwen3:14b |
| ✓ | why does netfilx keep taking money | why_debit | Netflix is taking ₹649 every month by card. This has happened 12 times, starting 16 Nov 2025 and ending 16 Oct 2026. The payments repeat because they are the same amount and spaced about 31 days apart. | qwen3:14b |
| ✓ | what is the 30 rupees charge from my operator | why_debit | The ₹30 charge is for a Caller tune pack. It repeats every month, paid by your Operator pack. It has been charged 12 times since November 2025. | qwen3:14b |
| ✓ | is my canva autopay still active? | mandate_status | Yes, your Canva autopay is active. It was last charged on 7 Oct 2026 and will next charge on 7 Nov 2026. The amount is ₹499. | qwen3:14b |
| ✓ | did the gym mandate get paused | mandate_status | The gym mandate is not paused. The FitLine Gym is active, and the next charge is scheduled for 4 Nov 2026. The amount is ₹1,500. | qwen3:14b |
| ✓ | is the hdfc life ecs on | mandate_status | Yes, the HDFC Life ECS is active. It last charged on 18 Oct 2026 and will next charge on 18 Nov 2026. The amount is ₹1,200. This is insurance. | qwen3:14b |
| ✓ | I cancelled fitapp but they still charged me | charged_after_cancel | FitApp was last charged on 21 Oct 2026. No cancellation message was found. Cancel in the Play Store. A later charge is a Play dispute, then a card dispute. | qwen3:14b |
| ✓ | stopped google one last month, why is it still debiting | charged_after_cancel | Your cancellation may not have taken effect. The last charge was on 9 Oct 2026. After 7 days, block GOOGLE*ONE with the issuer. | qwen3:14b |
| ✓ | what all do I pay google | list_by_merchant | You pay ₹130 every month for Google One. This totals ₹1,560 per year. You have been charged 12 times since 9 Nov 2025. | qwen3:14b |
| ✓ | how much do I pay hotstar | list_by_merchant | You pay ₹899 once a year for JioHotstar. You have been charged ₹1,798 in total so far. The first charge was on 3 Sept 2025. | qwen3:14b |
| ✓ | what am I paying for the home loan | list_by_merchant | You are paying ₹8,500 every month for your home loan. This has cost ₹1,02,000 in total so far. The payments have been made 12 times since 5 Apr 2023. | qwen3:14b |
| ✓ | how much did I spend on subscriptions last month | spend_total | You spent ₹16,994 on recurring payments and autopays in September 2026. This includes 12 debits. The biggest payments were for Home loan, BESCOM, FitLine Gym, HDFC Life, and JioHotstar. | qwen3:14b |
| ✓ | total autopay spend this year | spend_total | ₹1,62,152 has been spent on autopays and recurring payments so far in 2026. The biggest payments were for Home loan, BESCOM, FitLine Gym, HDFC Life, and Society. This covers only recurring payments and autopays, not one-off shopping. | qwen3:14b |
| ✓ | pichle mahine kitna gaya | spend_total | ₹16,994 was spent in September 2026. This includes 12 recurring payments and autopays. The biggest payments were for Home loan, BESCOM, FitLine Gym, HDFC Life, and JioHotstar. | qwen3:14b |
| ✓ | how do I cancel canva | how_to_cancel | First stop the service: Cancel inside the Canva account. An email link often opens a discount, not a cancellation. Then stop the money: Card app or netbanking, recurring payments, deactivate Canva. If it is missing, ask the issuer to block CANVA.COM PADDLE.NET. | fixed |
| ✓ | stop the hdfc life payment | how_to_cancel | This is insurance. Lapsing it is not the same as cancelling an app. Revoke the eNACH at her bank with UMRN HDFC000998877665544. | fixed |
| ✓ | how to get rid of the caller tune charge | how_to_cancel | First stop the service: Turn the caller tune off in the operator app, or send the operator STOP message shown on this row. The message is a sample. Then stop the money: The operator removes the pack. There is no separate UPI mandate. | fixed |
| ✓ | what's the weather in bangalore | unknown | I can answer questions about your recurring payments, such as what is due next month, why a charge happened, or how to cancel one. You can also paste a bank SMS for me to read. | fixed |
| ✓ | should I buy tata motors shares | unknown | I can answer questions about your recurring payments, such as what is due next month, why a charge happened, or how to cancel one. You can also paste a bank SMS for me to read. | fixed |
| ✓ | why did swiggy one charge me | why_debit | I could not find any payment related to "swiggy one". Please name the service as it appears on your statement. | qwen3:14b |
| ✓ | is my disney autopay active | mandate_status | I could not find a Disney autopay in your records. Please name the service as it appears on your statement. | qwen3:14b |
