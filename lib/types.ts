export type Instrument = "UPI Autopay" | "Card" | "Store plan" | "eNACH" | "Loan";
export type CommitmentKind = "unused" | "silent" | "trial" | "essential" | "debt";

export type Commitment = {
  id: string;
  rawNarration: string;
  merchant: string;
  instrument: Instrument;
  cadence: "weekly" | "monthly" | "annual";
  amount: number;
  annualCost: number;
  lastOpenedMonthsAgo?: number;
  kind: CommitmentKind;
  evidence: string;
  status: string;
  canCancel: boolean;
  cancellationPath?: string;
  source?: "SMS" | "SMS and email";
  plainDescription?: string;
  issue?: string;
  stopService?: string;
  stopMoney?: string;
  ifSilent?: string;
  trap?: string;
  mandateRef?: string;
};
