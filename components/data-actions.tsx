"use client";

import { ChangeEvent, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { formatINR } from "@/lib/format";
import type { Commitment, CommitmentKind, Instrument } from "@/lib/types";

type DataActionsProps = {
  commitments: Commitment[];
  onImport: (result: { commitments: Commitment[]; summary: ImportSummary }) => void;
};

export type ImportSummary = {
  fileName: string;
  sheetCount: number;
  statementRows: number;
  commitmentRows: number;
  included: string[];
};

const statementHeaders = ["txn_id", "persona", "date", "account_id", "account_type", "narration", "debit_inr", "credit_inr", "balance_after_inr", "reference", "channel", "txn_kind", "brand"];
const optionalSheets = ["notifications", "usage", "mandates", "merchant_dictionary", "expected_commitments"];

export function DataActions({ commitments, onImport }: DataActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function readFile(file: File) {
    setError("");
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheetNames = workbook.SheetNames;
      const statementName = sheetNames.find((name) => name.toLowerCase() === "statement") ?? sheetNames[0];
      const statement = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[statementName], { defval: "" });
      const statementColumns = statement[0] ? Object.keys(statement[0]) : [];
      const missing = ["txn_id", "date", "narration", "debit_inr"].filter((header) => !statementColumns.includes(header));
      if (missing.length) throw new Error(`The statement sheet is missing: ${missing.join(", ")}.`);

      const expectedName = sheetNames.find((name) => name.toLowerCase() === "expected_commitments");
      const expectedRows = expectedName ? XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[expectedName], { defval: "" }) : [];
      const parsedCommitments = expectedRows.map(toCommitment).filter((item): item is Commitment => item !== null);
      const nextSummary = {
        fileName: file.name,
        sheetCount: sheetNames.length,
        statementRows: statement.length,
        commitmentRows: parsedCommitments.length,
        included: optionalSheets.filter((sheet) => sheetNames.some((name) => name.toLowerCase() === sheet))
      };
      setSummary(nextSummary);
      onImport({ commitments: parsedCommitments.length ? parsedCommitments : commitments, summary: nextSummary });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not read this file. Please upload a CSV or XLSX statement export.");
    }
  }

  function onChooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void readFile(file);
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
  }

  return <>
    <div className="data-actions">
      <button className="import-button" onClick={() => setImportOpen(true)}><span>＋</span> Import data</button>
      <div className="export-wrap"><button className="export-button" onClick={() => setMenuOpen((open) => !open)}>Export <span>⌄</span></button>{menuOpen && <div className="export-menu"><button onClick={() => downloadPaymentsCsv(commitments)}>Commitments as CSV</button><button onClick={() => downloadReportCsv(commitments)}>Full report as CSV</button><button onClick={() => downloadWorkbook(commitments)}>Full report as XLSX</button><button onClick={downloadTemplate}>Import template XLSX</button></div>}</div>
    </div>
    {importOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}><section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Close import">×</button><p className="section-kicker">BRING YOUR DATA IN</p><h2 id="import-title">Import a statement export</h2><p className="modal-copy">Upload a CSV or XLSX file. Recur recognizes the statement, notifications, usage, mandates, merchant dictionary, and expected commitments sections from your synthetic-data format.</p><div className={`drop-zone ${isDragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}><span className="upload-icon">⇧</span><strong>Drop your CSV or XLSX here</strong><small>or choose a file from your computer</small><button onClick={() => inputRef.current?.click()}>Choose file</button><input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onChooseFile} /></div>{error && <p className="import-error">{error}</p>}{summary && <div className="import-success"><span>✓</span><div><strong>{summary.fileName} is ready</strong><p>{summary.statementRows} statement rows, {summary.commitmentRows} expected commitments, and {summary.sheetCount} sections found.</p><small>Included: {summary.included.length ? summary.included.join(", ") : "statement only"}.</small></div></div>}<div className="expected-fields"><strong>Statement columns we need</strong><p>{statementHeaders.join(" · ")}</p></div></section></div>}
  </>;
}

function toCommitment(row: Record<string, unknown>): Commitment | null {
  const brand = String(row.brand ?? "").trim();
  const annualCost = Number(row.next_12_months_inr);
  if (!brand || !Number.isFinite(annualCost)) return null;
  const signal = String(row.signal ?? "review");
  const bucket = String(row.bucket ?? "review");
  const kind: CommitmentKind = bucket === "leak" ? "unused" : signal.includes("trial") ? "trial" : signal.includes("silent") || signal.includes("price") ? "silent" : bucket === "debt" ? "debt" : "essential";
  const mechanism = String(row.mechanism ?? "Card");
  const instrument: Instrument = mechanism.includes("upi") ? "UPI Autopay" : mechanism.includes("play") ? "Store plan" : mechanism.includes("loan") || mechanism.includes("emi") ? "Loan" : mechanism.includes("nach") ? "eNACH" : "Card";
  return { id: brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""), rawNarration: String(row.narration ?? brand), merchant: brand, instrument, cadence: String(row.interval) === "annual" ? "annual" : String(row.interval) === "weekly" ? "weekly" : "monthly", amount: Number(row.latest_or_median_inr) || 0, annualCost, kind, evidence: `Imported signal: ${signal.replace(/_/g, " ")}.`, status: bucket === "leak" ? "Possible money leak" : signal.replace(/_/g, " "), canCancel: String(row.cancel_mode ?? "normal") !== "none", cancellationPath: "Open the payment provider and follow the service cancellation instructions in your imported merchant dictionary." };
}

function commitmentRows(commitments: Commitment[]) {
  return commitments.map((item) => ({ Merchant: item.merchant, "Statement narration": item.rawNarration, "Payment rail": item.instrument, Cadence: item.cadence, "Amount (INR)": item.amount, "Next 12 months (INR)": item.annualCost, Signal: item.kind, Status: item.status, "Cancellation path": item.cancellationPath ?? "Not applicable" }));
}

function triggerDownload(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadPaymentsCsv(commitments: Commitment[]) {
  const sheet = XLSX.utils.json_to_sheet(commitmentRows(commitments));
  triggerDownload(XLSX.utils.sheet_to_csv(sheet), "recur-commitments.csv", "text/csv;charset=utf-8");
}

function downloadReportCsv(commitments: Commitment[]) {
  const total = commitments.reduce((sum, item) => sum + item.annualCost, 0);
  const leaks = commitments.filter((item) => item.kind === "unused").reduce((sum, item) => sum + item.annualCost, 0);
  const rows = [{ Section: "Summary", Merchant: "Annual commitments", "Amount (INR)": total }, { Section: "Summary", Merchant: "Potential freedom", "Amount (INR)": leaks }, ...commitmentRows(commitments).map((row) => ({ Section: "Commitment", ...row }))];
  triggerDownload(XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)), "recur-full-report.csv", "text/csv;charset=utf-8");
}

function downloadWorkbook(commitments: Commitment[]) {
  const total = commitments.reduce((sum, item) => sum + item.annualCost, 0);
  const leaks = commitments.filter((item) => item.kind === "unused").reduce((sum, item) => sum + item.annualCost, 0);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ Metric: "Annual commitments", "Amount (INR)": total }, { Metric: "Potential freedom", "Amount (INR)": leaks }, { Metric: "Payments reviewed", "Count": commitments.length }]), "Dashboard");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(commitmentRows(commitments)), "Commitments");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(commitmentRows(commitments.filter((item) => item.canCancel))), "Action plan");
  XLSX.writeFile(workbook, "recur-full-report.xlsx");
}

function downloadTemplate() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([statementHeaders]), "statement");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["notice_id", "sent_on", "channel", "sender", "event_type", "merchant_brand", "related_txn_id", "amount_inr", "raw_text"]]), "notifications");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["brand", "last_opened", "opens_last_12_months", "zombie"]]), "usage");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["mandate_id", "created_on", "mechanism", "narration", "brand", "max_amount_inr", "frequency", "mandate_ref", "account_id", "status_as_of"]]), "mandates");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["brand", "narration", "mechanism", "interval", "amount_pattern", "latest_or_median_inr", "next_12_months_inr", "bucket", "signal", "cancel_mode", "debit_count_in_fixture", "last_opened"]]), "expected_commitments");
  XLSX.writeFile(workbook, "recur-import-template.xlsx");
}
