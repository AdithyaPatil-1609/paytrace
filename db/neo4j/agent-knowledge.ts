import { createHash } from "node:crypto";
import { getAgentDriver, agentDatabase } from "./agent-client";
import { readDictionary } from "@/data/fixtures";
import type { DictionaryEntry, Mechanism } from "@/lib/payments/types";

/** General guidance only. Do not copy the fixture's personal examples, amounts,
 * dates, payment IDs, account references, or cancellation-path anecdotes.
 */
export const MECHANISM_GUIDANCE: Record<Mechanism, { name: string; guidance: string; caution: string }> = {
  upi_autopay: { name: "UPI AutoPay", guidance: "Check the mandate or autopay section of the UPI app used to authorize the payment. Follow its revoke or cancel steps and confirm the mandate status.", caution: "Stopping payment does not necessarily end the underlying service or obligation." },
  card_recurring: { name: "Recurring card payment", guidance: "Cancel renewal through the merchant or billing platform, then check recurring payment settings with the card issuer. Contact the issuer if you cannot identify the instruction.", caution: "Do not block legitimate payments without checking the service terms and obligations." },
  play_store: { name: "App store subscription", guidance: "Identify whether the subscription is billed by Google Play, Apple, or the merchant directly. Use that platform's subscription settings to manage renewal.", caution: "Deleting an app or a merchant account may not cancel billing." },
  enach: { name: "eNACH mandate", guidance: "Identify the mandate and confirm its purpose with the provider and bank. Ask them for the applicable cancellation or mandate-change process.", caution: "Insurance, loans and other contractual obligations may remain payable; check terms first." },
  bbps: { name: "Bill autopay", guidance: "Check autopay settings with the biller, bank or payment app and arrange an alternative payment method if needed.", caution: "Disabling autopay does not cancel the bill or amount due." },
  neft_standing: { name: "Standing transfer", guidance: "Check the scheduled transfer in your bank's app or netbanking and verify its purpose before changing it.", caution: "A standing transfer may pay an obligation that remains due." },
  vas: { name: "Operator value-added service", guidance: "Review active services in the telecom operator's account or contact its support for cancellation.", caution: "Confirm whether the charge is an optional add-on or a separate plan." },
  emi_ach: { name: "Loan or EMI autopay", guidance: "Contact the lender for repayment options and instructions before changing any payment arrangement.", caution: "Do not recommend stopping loan repayments or revoking the mandate as a way to cancel debt." },
  none: { name: "Unknown or non-recurring payment", guidance: "Check receipts, the payment channel and the merchant account to establish whether a recurring instruction exists.", caution: "A single charge does not prove a recurring commitment." }
};

export function projectMerchantKnowledge(entries: DictionaryEntry[]) {
  const projected = new Map<string, { id: string; brand: string; brandKey: string; pattern: string; product: string; category: string; mechanism: Mechanism }>();
  for (const entry of entries) {
    if (entry.cancelMode === "fixture" || entry.cancelMode === "exclude" ||
        /(?:parser fixture|only when simulate|demo only)/i.test(entry.oneLiner)) continue;
    const brand = entry.brand.trim(), pattern = entry.pattern.trim();
    if (!brand || !pattern || !Object.hasOwn(MECHANISM_GUIDANCE, entry.mechanism)) continue;
    const brandKey = brand.toLowerCase();
    const id = createHash("sha256").update(brandKey).update("\0").update(pattern).digest("hex");
    projected.set(id, { id, brand, brandKey, pattern, product: entry.product, category: entry.category, mechanism: entry.mechanism });
  }
  return [...projected.values()];
}

/** Populate the separate agent database with a shared, non-personal catalog.
 * Refuses any pre-existing private/demo/unmanaged graph. Never deletes data.
 */
export async function seedAgentKnowledge() {
  const entries = projectMerchantKnowledge(readDictionary());
  if (!entries.length) throw new Error("The merchant catalog is empty.");
  const methods = Object.entries(MECHANISM_GUIDANCE).map(([key, value]) => ({ key, ...value }));
  const session = getAgentDriver().session({ database: agentDatabase });
  try {
    await session.run("CREATE CONSTRAINT agent_catalog_id IF NOT EXISTS FOR (n:AgentKnowledgeCatalog) REQUIRE n.id IS UNIQUE");
    await session.executeWrite(async tx => {
      const existing = await tx.run(`MATCH (n) WHERE NOT n:AgentKnowledge OR n:AgentMirror OR n:PaytraceUser OR n:LiveProfile OR n:LivePayment OR n:LiveEvent OR n:LiveMerchant OR n:AgentSnapshot
        RETURN count(n) AS count`);
      if (Number(existing.records[0].get("count")) !== 0) {
        throw new Error("Database 2 contains private, demo or unmanaged data. Do not attach an Aura Agent to it.");
      }
      await tx.run(`MERGE (c:AgentKnowledge:AgentKnowledgeCatalog {id:'paytrace-knowledge-v1'})
        SET c.lock=coalesce(c.lock,0)+1,c.source='Paytrace merchant dictionary',c.updatedAt=datetime(),
        c.note='General catalog only. Possible billing methods are not proof of any user payment.'`);
      await tx.run(`UNWIND $methods AS row
        MERGE (m:AgentKnowledge:AgentMechanism {key:row.key})
        SET m.name=row.name,m.guidance=row.guidance,m.caution=row.caution`, { methods });
      await tx.run(`UNWIND $entries AS row
        MERGE (m:AgentKnowledge:AgentMerchant {key:row.brandKey})
        SET m.name=row.brand
        MERGE (a:AgentKnowledge:AgentMerchantAlias {id:row.id})
        SET a.pattern=row.pattern,a.product=row.product,a.category=row.category,
            a.source='Paytrace dictionary sample; verify actual billing channel'
        MERGE (m)-[:HAS_ALIAS]->(a)
        WITH m,a,row MATCH (p:AgentKnowledge:AgentMechanism {key:row.mechanism})
        MERGE (a)-[:MAY_USE]->(p)`, { entries });
    });
  } finally {
    await session.close();
  }
  return { merchants: new Set(entries.map(e => e.brandKey)).size, aliases: entries.length, mechanisms: methods.length };
}
