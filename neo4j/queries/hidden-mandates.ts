/**
 * Discover active mandates for which no paid debit can be identified in the
 * imported evidence. Absence here is not proof that a bank never charged.
 *
 * Prefer an explicit AUTHORIZED_BY link; also use same-account, same-merchant
 * debits since mandate creation as a conservative fallback when the bank
 * narration differs from the mandate narration.
 */
export const HIDDEN_MANDATES = `
MATCH (md:Mandate {status: 'active'})-[:FOR]->(merchant:Merchant)
MATCH (md)-[:ON_ACCOUNT]->(account:Account)
WHERE NOT EXISTS {
  MATCH (payment:Payment)-[:AUTHORIZED_BY]->(md)
  WHERE payment.debit_inr > 0
    AND coalesce(payment.txn_kind, '') <> 'authorisation'
}
AND NOT EXISTS {
  MATCH (payment:Payment)-[:ON_ACCOUNT]->(account)
  MATCH (payment)-[:PAID_TO]->(merchant)
  WHERE payment.debit_inr > 0
    AND coalesce(payment.txn_kind, '') <> 'authorisation'
    AND payment.date >= md.created_on
}
RETURN md.mandate_id AS mandateId,
       md.mandate_ref AS mandateRef,
       merchant.brand AS merchant,
       account.account_id AS accountId,
       md.max_amount_inr AS maxAmount,
       md.frequency AS frequency,
       toString(md.created_on) AS createdOn,
       md.status AS status
ORDER BY merchant, mandateId
`;
