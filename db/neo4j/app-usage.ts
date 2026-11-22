/**
 * App-usage facts from a paired Android phone (card M3). Each reported app is
 * matched to the person's own subscriptions by name; a match records when the
 * app was last opened (or that it was not opened in the phone's window) and its
 * minutes in the last 30 days. These feed the "unused" warning. Scoped to the
 * owner's profile; nothing is matched across people.
 */
import { getNeo4jDriver, neo4jDatabase } from "./client";
import { merchantKey } from "@/lib/ingestion/event";
import { APP_USAGE_LIMITS } from "@/lib/payments/rules";

export type AppUsage = { package: string; merchant: string; lastUsed: string | null; minutes30d: number };

/**
 * "YOUTUBE MUSIC" matches "YOUTUBE MUSIC PREMIUM STUDENT", and "HOTSTAR" matches
 * "JIOHOTSTAR" or "DISNEY+ HOTSTAR". Names under 4 letters never match, and a
 * name inside another must be at least 6 letters, so short words cannot cross-match.
 */
export function usageMatches(subscriptionMerchant: string, appMerchant: string) {
  const s = merchantKey(subscriptionMerchant), a = merchantKey(appMerchant);
  if (a.length < APP_USAGE_LIMITS.minMatchLength || s.length < APP_USAGE_LIMITS.minMatchLength) return false;
  return s.startsWith(a) || a.startsWith(s) || (a.length >= 6 && s.includes(a));
}

export async function recordAppUsage(profile: string, apps: AppUsage[], windowStart: string, today: string) {
  const session = getNeo4jDriver().session({ database: neo4jDatabase });
  try {
    return await session.executeWrite(async tx => {
      const subs = await tx.run(`MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription) RETURN s.id AS id, s.merchant AS merchant`, { profile });
      const updates: { id: string; app: AppUsage }[] = [];
      for (const record of subs.records) {
        const merchant = String(record.get("merchant") ?? "");
        // The longest matching app name wins ("YOUTUBE MUSIC" over "YOUTUBE").
        const app = apps.filter(a => usageMatches(merchant, a.merchant)).sort((x, y) => merchantKey(y.merchant).length - merchantKey(x.merchant).length)[0];
        if (app) updates.push({ id: String(record.get("id")), app });
      }
      for (const { id, app } of updates) {
        await tx.run(
          `MATCH (:LiveProfile {id:$profile})-[:HAS_SUBSCRIPTION]->(s:LiveSubscription {id:$id})
           SET s.usageMinutes30d = $minutes, s.usagePackage = $package, s.usageReportedAt = $today
           FOREACH (_ IN CASE WHEN $lastUsed IS NOT NULL AND (s.lastVerifiedUsageAt IS NULL OR $lastUsed >= s.lastVerifiedUsageAt) THEN [1] ELSE [] END |
             SET s.lastVerifiedUsageAt = $lastUsed, s.usageSource = 'android_usage_stats', s.usageCoverage = 'device', s.usageEvidenceId = null, s.usageNoUseSince = null)
           FOREACH (_ IN CASE WHEN $lastUsed IS NULL AND s.lastVerifiedUsageAt IS NULL THEN [1] ELSE [] END |
             SET s.usageNoUseSince = $windowStart, s.usageSource = 'android_usage_stats', s.usageCoverage = 'device')`,
          { profile, id, minutes: app.minutes30d, package: app.package, lastUsed: app.lastUsed, windowStart, today }
        );
      }
      return { matched: updates.length, merchants: [...new Set(updates.map(u => u.app.merchant))] };
    });
  } finally {
    await session.close();
  }
}
