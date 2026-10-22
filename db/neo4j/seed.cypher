// Synthetic fixture for the initial prototype. It contains no real financial information.
MERGE (priya:Person {id: "priya"})
SET priya.name = "Priya", priya.city = "Bengaluru", priya.synthetic = true
MERGE (savings:Account {id: "priya-savings"})
SET savings.type = "Savings account"
MERGE (card:Account {id: "priya-credit-card"})
SET card.type = "Credit card"
MERGE (priya)-[:HAS_ACCOUNT]->(savings)
MERGE (priya)-[:HAS_ACCOUNT]->(card)

UNWIND [
  {id: "fitline", merchant: "FitLine Gym", narration: "UPI/GYMFITLINE/9845128891", instrument: "UPI Autopay", cadence: "monthly", amount: 1500, annualCost: 18000, kind: "unused", evidence: "Last opened 18 Nov 2025. Opened twice. Twelve debits after that.", status: "Stopped using it", canCancel: true, cancellationPath: "Cancel in FitLine, then revoke the UPI mandate.", opened: 11, account: "priya-savings"},
  {id: "canva", merchant: "Canva Pro", narration: "CANVA.COM PADDLE.NET", instrument: "Card", cadence: "monthly", amount: 499, annualCost: 5988, kind: "unused", evidence: "Last opened 3 Feb 2026. The card is still billed.", status: "Stopped using it", canCancel: true, cancellationPath: "Cancel in Canva, then deactivate the recurring card payment.", opened: 8, account: "priya-credit-card"},
  {id: "fitapp", merchant: "FitApp", narration: "GOOGLE*FITAPP", instrument: "Store plan", cadence: "monthly", amount: 299, annualCost: 3588, kind: "unused", evidence: "Last opened 11 Jan 2026. Google Play is still billing.", status: "Stopped using it", canCancel: true, cancellationPath: "Cancel in Google Play, then dispute a continuing charge.", opened: 9, account: "priya-credit-card"},
  {id: "caller-tune", merchant: "Caller tune", narration: "VAS CTUNE IDEA", instrument: "Card", cadence: "monthly", amount: 30, annualCost: 360, kind: "unused", evidence: "A pack she did not go looking for. ₹30 is easy to miss.", status: "Small, unwanted add-on", canCancel: true, cancellationPath: "Turn it off with the operator or send STOP.", opened: null, account: "priya-credit-card"},
  {id: "spotify", merchant: "Spotify Premium", narration: "POS 4512 SPOTIFY STOCKHOLM", instrument: "Card", cadence: "monthly", amount: 139, annualCost: 1668, kind: "silent", evidence: "Nov 2025 to May 2026 at ₹119. June onward at ₹139. Debit SMS exist. A price email does not.", status: "Price changed without a notice", canCancel: true, cancellationPath: "Cancel in Spotify, then block the descriptor after 7 days if needed.", opened: null, account: "priya-credit-card"},
  {id: "youtube", merchant: "YouTube Premium", narration: "GOOGLE*YOUTUBEPREM", instrument: "Card", cadence: "monthly", amount: 149, annualCost: 1788, kind: "trial", evidence: "Trial-ending email on 21 Apr 2026, then ₹149. The ₹1 hold is not the price.", status: "Trial became paid", canCancel: true, cancellationPath: "Cancel in YouTube, then block the descriptor after 7 days if needed.", opened: null, account: "priya-credit-card"},
  {id: "electricity", merchant: "Electricity", narration: "BESCOM BILLPAY", instrument: "UPI Autopay", cadence: "monthly", amount: 1800, annualCost: 21600, kind: "essential", evidence: "The amount changes from ₹900 to ₹3,200. Median about ₹1,800.", status: "Variable bill", canCancel: true, cancellationPath: "Switch off bill autopay; the electricity bill remains due.", opened: null, account: "priya-savings"},
  {id: "society", merchant: "Society maintenance", narration: "NEFT APT SOCIETY", instrument: "UPI Autopay", cadence: "monthly", amount: 4500, annualCost: 18000, kind: "essential", evidence: "₹4,500 each time. Four uneven dates. Still a commitment.", status: "Irregular dates", canCancel: true, cancellationPath: "Stop the standing transfer; maintenance dues remain.", opened: null, account: "priya-savings"},
  {id: "insurance", merchant: "Health insurance", narration: "NACH/HDFC LIFE", instrument: "eNACH", cadence: "monthly", amount: 1200, annualCost: 14400, kind: "essential", evidence: "A policy. Letting it lapse is a different decision from cancelling an app.", status: "Insurance policy", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "home-loan", merchant: "Home loan EMI", narration: "ACH DR LIC HSG EMI", instrument: "Loan", cadence: "monthly", amount: 8500, annualCost: 102000, kind: "debt", evidence: "A loan repayment is debt, not a cancellable subscription.", status: "Debt - no cancellation", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "netflix", merchant: "Netflix", narration: "NETFLIX.COM", instrument: "Card", cadence: "monthly", amount: 649, annualCost: 7788, kind: "essential", evidence: "She still opens Netflix.", status: "In use", canCancel: true, cancellationPath: "Cancel in Netflix, then deactivate the recurring card payment.", opened: null, account: "priya-credit-card"},
  {id: "amazon-prime", merchant: "Amazon Prime", narration: "AMAZON PRIME", instrument: "Card", cadence: "annual", amount: 1499, annualCost: 1499, kind: "essential", evidence: "Kept because the fixture shows ongoing use.", status: "Keep - in use", canCancel: true, cancellationPath: "Manage the membership in your Amazon account.", opened: null, account: "priya-credit-card"},
  {id: "google-one", merchant: "Google One", narration: "GOOGLE*ONE", instrument: "Card", cadence: "monthly", amount: 130, annualCost: 1560, kind: "essential", evidence: "Cloud storage she still uses.", status: "In use", canCancel: true, cancellationPath: "Cancel in Google subscriptions, then deactivate the card payment.", opened: null, account: "priya-credit-card"},
  {id: "jiohotstar", merchant: "JioHotstar", narration: "JIOHOTSTAR", instrument: "UPI Autopay", cadence: "annual", amount: 899, annualCost: 899, kind: "essential", evidence: "Kept because the fixture shows ongoing use.", status: "Keep - in use", canCancel: true, cancellationPath: "Manage the plan in the JioHotstar account.", opened: null, account: "priya-savings"}
] AS row
MATCH (account:Account {id: row.account})
MERGE (merchant:Merchant {key: toLower(row.merchant)}) SET merchant.name = row.merchant
MERGE (service:Service {id: row.id}) SET service.lastOpenedMonthsAgo = row.opened
MERGE (commitment:Commitment {id: row.id})
SET commitment += row
MERGE (transaction:Transaction {id: "fixture-" + row.id})
SET transaction.narration = row.narration, transaction.amount = row.amount, transaction.synthetic = true
MERGE (account)-[:RECORDED]->(transaction)
MERGE (transaction)-[:MATCHED_TO]->(commitment)
MERGE (commitment)-[:FOR]->(service)
MERGE (merchant)-[:OFFERS]->(service)
MERGE (priya)-[:USES]->(service);

MATCH (commitment:Commitment {id: "fitline"})
MERGE (mandate:Mandate {id: "fitline-upi-mandate"})
SET mandate.rail = "UPI Autopay", mandate.state = "active"
MERGE (commitment)-[:CHARGES_VIA]->(mandate);

MATCH (commitment:Commitment {id: "spotify"})
MERGE (notice:Notice {id: "spotify-price-notice"})
SET notice.type = "price change", notice.found = false
MERGE (notice)-[:RELATES_TO]->(commitment);
