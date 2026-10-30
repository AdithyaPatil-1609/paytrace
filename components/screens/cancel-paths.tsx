import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { monthlyCost } from "@/lib/commitment-ui";
import { formatINR } from "@/lib/format";
import type { Commitment } from "@/lib/types";
import { useState } from "react";

function plainAutomaticPaymentStep(text: string) {
  return text
    .replace(/^(.+?)\.\s*Autopay or Mandates, then (.+?), then Revoke\.$/i, "Open $1. Find Automatic payments or Mandates, choose $2, then select Revoke.")
    .replace(/\bautopay\b/gi, "automatic payments");
}

export function CancelPathsScreen({ items, allItems, revoked, kept, handled, onConfirm, onKeep, onFlagAgain, onHandle, onRestore }: {
  items: Commitment[];
  allItems: Commitment[];
  revoked: string[];
  kept: string[];
  handled: string[];
  onConfirm: (id: string) => void;
  onKeep: (id: string) => void;
  onFlagAgain: (id: string) => void;
  onHandle: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const visibleItems = items.filter((item) => item.merchant.toLowerCase().includes(search.trim().toLowerCase()));
  const stopped = allItems.filter((item) => revoked.includes(item.id));
  return (
    <>
      <header className="screen-header">
        <p>MANAGE YOUR PAYMENTS</p>
        <h1>Review or stop a payment</h1>
        <div>Choose a service. We explain the next step; you complete any payment change with the service or your bank.</div>
      </header>
      <label className="payment-search">Find a service
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Type a service name" />
      </label>
      {stopped.length > 0 && (
        <Card className="stopped-payments">
          <CardHeader><CardTitle>Payments you marked as stopped</CardTitle><CardDescription>Your spending estimate has been updated. This does not cancel a bank payment.</CardDescription></CardHeader>
          <CardContent>{stopped.map((item) => (
            <div className="stopped-payment-row" key={item.id}>
              <span>{item.merchant}<small>{formatINR(item.annualCost)} a year removed from the estimate</small></span>
              <Button variant="outline" onClick={() => onRestore(item.id)} aria-label={`Undo stopped status for ${item.merchant}`}>Undo</Button>
            </div>
          ))}</CardContent>
        </Card>
      )}
      <section className="stop-payment-list" aria-label="Payments to manage">
        {visibleItems.map((item) => {
          const isKept = kept.includes(item.id);
          const isIssue = ["unused", "silent", "trial"].includes(item.kind) && !isKept;
          const isObligation = item.cancelMode === "warn" || item.cancelMode === "explain";
          const isLoan = item.cancelMode === "block";
          return (
            <Card className="stop-payment-card" role="article" aria-label={`${item.merchant} payment`} data-row={item.id} key={item.id}>
              <CardHeader>
                <div className="stop-payment-heading">
                  <div>
                    <CardTitle><h2>{item.merchant}</h2></CardTitle>
                    <CardDescription>{monthlyCost(item)}</CardDescription>
                  </div>
                    <span className="payment-status">{isLoan ? "Loan payment" : isObligation ? "Bill or insurance" : isKept ? "Keeping this" : item.kind === "unused" ? "Not used recently" : "Active payment"}</span>
                </div>
              </CardHeader>
              <CardContent>
                {isLoan ? <p className="stop-payment-note">Stopping this payment does not cancel the loan. Speak to your lender before making changes.</p>
                  : isObligation ? <p className="stop-payment-note">Stopping automatic payments does not remove the bill or obligation. Check with the provider first.</p>
                    : <p className="stop-payment-note">{isKept ? "You chose to keep paying. Your yearly estimate stays the same." : `Stopping future charges could reduce your yearly spending by ${formatINR(item.annualCost)}.`}</p>}
                <Accordion type="single" collapsible>
                  <AccordionItem value="steps">
                    <AccordionTrigger>{isLoan ? "What to do about this loan" : "Show steps to stop"}</AccordionTrigger>
                    <AccordionContent>
                      <ol className="simple-stop-steps">
                        <li><strong>{isLoan ? "Contact your lender" : "Contact the service"}</strong><p>{isLoan ? "Ask your lender about repayment options and what is needed to close the loan." : item.stopService.replace(/This prototype[^.]*\./gi, "").trim()}</p></li>
                        <li><strong>{isLoan ? "Keep repayments in place" : "Check automatic payments"}</strong><p>{isLoan ? "Keep making payments until your lender confirms the loan is settled." : plainAutomaticPaymentStep(item.stopMoney)}</p></li>
                      </ol>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="help"><AccordionTrigger>More help and bank details</AccordionTrigger><AccordionContent>
                          <p>{item.ifSilent}</p>
                          {item.trap && <p><strong>Check this:</strong> {item.trap}</p>}
                          {item.mandateRef && <p className="bank-reference">Autopay reference: {item.mandateRef}</p>}
                        </AccordionContent></AccordionItem>
                      </Accordion>
                      {!isLoan && (isObligation ? (
                        <div className="stop-record-action">
                          {handled.includes(item.id) ? <p role="status">Reviewed. The bill remains in your spending estimate.</p>
                            : <Button variant="outline" onClick={() => onHandle(item.id)}>Mark as reviewed</Button>}
                        </div>
                      ) : (
                        <div className="stop-record-action">
                          <p>Already completed the steps with the service and your bank?</p>
                          <AlertDialog>
                            <AlertDialogTrigger asChild><Button>I&apos;ve stopped this payment</Button></AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Mark {item.merchant} as stopped?</AlertDialogTitle>
                                <AlertDialogDescription>Only do this after you have stopped the payment with the service or your bank. This updates your spending estimate by {formatINR(item.annualCost)} a year. It does not cancel anything for you.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction onClick={() => onConfirm(item.id)}>Yes, I have stopped it</AlertDialogAction></AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
              {(isIssue || isKept) && <CardFooter>
                {isIssue ? <Button variant="outline" onClick={() => onKeep(item.id)}>Keep this payment</Button>
                  : <Button variant="ghost" onClick={() => onFlagAgain(item.id)}>Review this again</Button>}
              </CardFooter>}
            </Card>
          );
        })}
      </section>
      {visibleItems.length === 0 && <p className="chart-note" role="status">No payments match this name. Try another service.</p>}
    </>
  );
}
