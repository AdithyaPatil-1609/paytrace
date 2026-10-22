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
  {id: "fitline-gym", merchant: "FitLine Gym", narration: "UPI/GYMFITLINE/9845128891", instrument: "UPI Autopay", cadence: "monthly", amount: 1500, annualCost: 18000, kind: "unused", evidence: "Last opened 11 months ago. Twelve monthly debits on a visible UPI mandate.", status: "Unused for 11 months", canCancel: true, cancellationPath: "Open your UPI app, find the FitLine mandate, then revoke it.", opened: 11, account: "priya-savings"},
  {id: "canva-pro", merchant: "Canva Pro", narration: "CANVA.COM PADDLE.NET", instrument: "Card", cadence: "annual", amount: 5988, annualCost: 5988, kind: "unused", evidence: "An annual card charge with no recent use in the fixture.", status: "Unused this year", canCancel: true, cancellationPath: "Cancel the subscription in Canva, then remove the saved card if needed.", opened: 9, account: "priya-credit-card"},
  {id: "fitapp", merchant: "FitApp on Play Store", narration: "GOOGLE*FITAPP", instrument: "Store plan", cadence: "monthly", amount: 299, annualCost: 3588, kind: "unused", evidence: "A store-plan payment with no matching recent usage.", status: "Unused for 5 months", canCancel: true, cancellationPath: "Manage the subscription in Google Play.", opened: 5, account: "priya-credit-card"},
  {id: "caller-tune", merchant: "Caller tune", narration: "VAS CTUNE IDEA", instrument: "Card", cadence: "monthly", amount: 30, annualCost: 360, kind: "unused", evidence: "A recurring telecom add-on.", status: "Telecom add-on", canCancel: true, cancellationPath: "Text STOP to your telecom provider's service number.", opened: null, account: "priya-credit-card"},
  {id: "spotify", merchant: "Spotify Premium", narration: "POS 4512 SPOTIFY STOCKHOLM", instrument: "Card", cadence: "monthly", amount: 139, annualCost: 1668, kind: "silent", evidence: "Four debits: ₹119, ₹119, ₹139, ₹139. No price-change notice found.", status: "Price rose without a notice", canCancel: true, cancellationPath: "Cancel or change your plan in Spotify account settings.", opened: null, account: "priya-credit-card"},
  {id: "youtube", merchant: "YouTube Premium", narration: "GOOGLE*YOUTUBEPREM", instrument: "Card", cadence: "monthly", amount: 149, annualCost: 1788, kind: "trial", evidence: "Trial activity became a paid plan in the same statement year.", status: "Trial became paid", canCancel: true, cancellationPath: "Cancel from YouTube paid memberships.", opened: null, account: "priya-credit-card"},
  {id: "bescom", merchant: "Electricity", narration: "BESCOM BILLPAY", instrument: "UPI Autopay", cadence: "monthly", amount: 1800, annualCost: 21600, kind: "essential", evidence: "A variable utility amount; it is recurring but not a subscription to remove.", status: "Keep - amount changes", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "society", merchant: "Society maintenance", narration: "NEFT APT SOCIETY", instrument: "UPI Autopay", cadence: "monthly", amount: 1500, annualCost: 18000, kind: "essential", evidence: "Uneven dates still form a recurring housing payment.", status: "Keep - housing", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "health-insurance", merchant: "Health insurance", narration: "NACH/HDFC LIFE", instrument: "eNACH", cadence: "annual", amount: 14400, annualCost: 14400, kind: "essential", evidence: "An eNACH insurance payment. It needs its own review path.", status: "Keep - insurance", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "home-loan", merchant: "Home loan EMI", narration: "ACH DR LIC HSG EMI", instrument: "Loan", cadence: "monthly", amount: 8500, annualCost: 102000, kind: "debt", evidence: "A loan repayment is debt, not a cancellable subscription.", status: "Debt - no cancellation", canCancel: false, cancellationPath: null, opened: null, account: "priya-savings"},
  {id: "netflix", merchant: "Netflix", narration: "NETFLIX.COM", instrument: "Card", cadence: "annual", amount: 7788, annualCost: 7788, kind: "essential", evidence: "Kept because the fixture shows ongoing use.", status: "Keep - in use", canCancel: true, cancellationPath: "Manage the membership in Netflix account settings.", opened: null, account: "priya-credit-card"},
  {id: "amazon-prime", merchant: "Amazon Prime", narration: "AMAZON PRIME", instrument: "Card", cadence: "annual", amount: 1499, annualCost: 1499, kind: "essential", evidence: "Kept because the fixture shows ongoing use.", status: "Keep - in use", canCancel: true, cancellationPath: "Manage the membership in your Amazon account.", opened: null, account: "priya-credit-card"},
  {id: "google-one", merchant: "Google One", narration: "GOOGLE*ONE", instrument: "Card", cadence: "annual", amount: 1560, annualCost: 1560, kind: "essential", evidence: "Kept because the fixture shows ongoing use.", status: "Keep - in use", canCancel: true, cancellationPath: "Manage the plan in Google One.", opened: null, account: "priya-credit-card"},
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

MATCH (commitment:Commitment {id: "fitline-gym"})
MERGE (mandate:Mandate {id: "fitline-upi-mandate"})
SET mandate.rail = "UPI Autopay", mandate.state = "active"
MERGE (commitment)-[:CHARGES_VIA]->(mandate);

MATCH (commitment:Commitment {id: "spotify"})
MERGE (notice:Notice {id: "spotify-price-notice"})
SET notice.type = "price change", notice.found = false
MERGE (notice)-[:RELATES_TO]->(commitment);
