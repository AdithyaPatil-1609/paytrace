/**
 * Read-only merchant evidence for Paytrace explanations and GraphRAG.
 * The API accepts a canonical merchant name; queries are parameterized.
 * A missing notice means it is absent from imported evidence, not that the
 * merchant never sent one.
 */
export const MERCHANT_EVIDENCE = `
MATCH (merchant:Merchant {brand: $merchant})
CALL (merchant) {
  MATCH (payment:Payment)-[:PAID_TO]->(merchant)
  WITH payment ORDER BY payment.date DESC, payment.txn_id DESC
  LIMIT 30
  RETURN collect({
    txnId: payment.txn_id,
    date: toString(payment.date),
    amount: payment.debit_inr,
    narration: payment.narration,
    reference: payment.reference,
    kind: payment.txn_kind
  }) AS payments
}
CALL (merchant) {
  MATCH (notice:Message)-[:ABOUT]->(merchant)
  WITH notice ORDER BY notice.sent_on DESC, notice.notice_id DESC
  LIMIT 30
  RETURN collect({
    noticeId: notice.notice_id,
    sentOn: toString(notice.sent_on),
    eventType: notice.event_type,
    amount: notice.amount_inr,
    text: notice.raw_text
  }) AS notices
}
CALL (merchant) {
  MATCH (mandate:Mandate)-[:FOR]->(merchant)
  RETURN collect({
    mandateId: mandate.mandate_id,
    reference: mandate.mandate_ref,
    status: mandate.status,
    frequency: mandate.frequency,
    limit: mandate.max_amount_inr
  }) AS mandates
}
RETURN merchant.brand AS merchant, payments, notices, mandates
`;
