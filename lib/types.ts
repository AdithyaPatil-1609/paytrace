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
};
