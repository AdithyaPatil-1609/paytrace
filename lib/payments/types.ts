export type Instrument =
  | "UPI Autopay"
  | "Card"
  | "Store plan"
  | "eNACH"
  | "Bill autopay"
  | "Standing transfer"
  | "Operator pack"
  | "Loan";

/** The five-way split used on the annual screen. */
export type Bucket = "unused" | "review" | "used" | "bills" | "debt";

/** Kept for the graph seed and the original fixture tests. */
export type CommitmentKind = "unused" | "silent" | "trial" | "essential" | "debt";

export type Mechanism =
  | "upi_autopay"
  | "card_recurring"
  | "play_store"
  | "enach"
  | "bbps"
  | "neft_standing"
  | "vas"
  | "emi_ach"
  | "none";

/** The four ways money leaves, for the annual composition chart. "Unused" is
    a status, not a spend group, so it is deliberately not one of these. */
export type SpendGroup = "subscriptions" | "utilities" | "insurance" | "debt";

/** How much we trust the next-charge date. Never invent one. */
export type DateConfidence = "confirmed" | "estimated" | "unknown";

/** One dated charge, for the price-history chart. */
export type PricePoint = { date: string; amount: number };

/** How the cancel screen behaves for this row. */
export type CancelMode = "normal" | "warn" | "explain" | "block" | "exclude" | "fixture";

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual" | "irregular";

export type AmountPattern = "fixed" | "variable" | "step";

export type Signal =
  | "silent_hike"
  | "trial_converted"
  | "zombie"
  | "annual_next_date"
  | "variable_amount"
  | "irregular_interval"
  | "obligation"
  | "new"
  | "none";

/** One statement line that the grouping kept as proof. */
export type EvidenceRow = {
  txnId: string;
  date: string;
  narration: string;
  amount: number;
  reference: string;
  channel: string;
  account: string;
};

/** One SMS or email that sits beside this commitment. */
export type NoticeRow = {
  noticeId: string;
  sentOn: string;
  channel: "sms" | "email";
  sender: string;
  eventType: string;
  amount?: number;
  text: string;
};

export type StatementRow = {
  txnId: string;
  persona: string;
  date: string;
  accountId: string;
  accountType: string;
  narration: string;
  debit?: number;
  credit?: number;
  reference: string;
  channel: string;
  txnKind: string;
};

export type NotificationRow = {
  noticeId: string;
  sentOn: string;
  channel: "sms" | "email";
  sender: string;
  eventType: string;
  brand: string;
  relatedTxnId?: string;
  amount?: number;
  text: string;
};

export type UsageRow = {
  brand: string;
  lastOpened?: string;
  opensLast12Months: number;
};

export type MandateRow = {
  mandateId: string;
  createdOn: string;
  mechanism: Mechanism;
  narration: string;
  brand: string;
  maxAmount: number;
  frequency: string;
  mandateRef: string;
  accountId: string;
  status: string;
};

export type DictionaryEntry = {
  pattern: string;
  brand: string;
  product: string;
  category: string;
  oneLiner: string;
  mechanism: Mechanism;
  cancelMode: CancelMode;
  stopTheService: string;
  stopTheMoney: string;
  trap: string;
  ifTheyStaySilent: string;
};

export type Dataset = {
  asOf: string;
  statement: StatementRow[];
  notifications: NotificationRow[];
  usage: UsageRow[];
  mandates: MandateRow[];
  dictionary: DictionaryEntry[];
};

export type Commitment = {
  id: string;
  rawNarration: string;
  /** The plain name a person recognises. */
  merchant: string;
  product: string;
  category: string;
  instrument: Instrument;
  mechanism: Mechanism;
  cadence: Cadence;
  amountPattern: AmountPattern;
  /** Latest charge for a fixed or stepped row, median for a variable one. */
  amount: number;
  previousAmount?: number;
  annualCost: number;
  debitCount: number;
  firstCharge: string;
  /** When the autopay began: the mandate's own date when there is one. */
  startedOn: string;
  /** Everything this commitment has taken so far, across the fixture. */
  spentToDate: number;
  lastCharge: string;
  nextCharge?: string;
  lastOpened?: string;
  lastOpenedMonthsAgo?: number;
  opensLast12Months?: number;
  kind: CommitmentKind;
  bucket: Bucket;
  signals: Signal[];
  /** The sentence that explains why the grouping kept this row. */
  whyRecurring: string;
  evidence: string;
  evidenceRows: EvidenceRow[];
  notices: NoticeRow[];
  hasPriceChangeNotice: boolean;
  holds: EvidenceRow[];
  status: string;
  canCancel: boolean;
  cancelMode: CancelMode;
  cancellationPath?: string;
  source: "SMS" | "SMS and email";
  plainDescription: string;
  issue?: string;
  stopService: string;
  stopMoney: string;
  ifSilent: string;
  trap?: string;
  mandateRef?: string;
  mandateStatus?: string;
  spendGroup: SpendGroup;
  dateConfidence: DateConfidence;
  /** Every dated debit, oldest first. The price chart is drawn from this. */
  priceSeries: PricePoint[];
  /** True once the simulated pause is taken: the money has not stopped. */
  paused?: boolean;
  inDictionary: boolean;
};
