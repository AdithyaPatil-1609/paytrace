import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "playwright";

async function main() {
  const out = path.join(process.cwd(), "work", "demo", String(Date.now()));
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: !process.argv.includes("--headed") });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: out } });
  const page = await context.newPage();
  const video = page.video();
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  let step = 0;
  async function shot(name: string) {
    await page.screenshot({ path: path.join(out, `${++step}-${name}.png`), fullPage: true });
    console.log(`Verified ${name}`);
  }
  async function screen(label: string) {
    await page.locator(".side-nav button").filter({ hasText: label }).click();
    await page.waitForTimeout(300);
  }
  try {
    await page.goto(base, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Know what keeps charging you" }).waitFor();
    await shot("user-overview");
    await page.locator(".technical-source summary").click();
    assert.match(await page.locator(".source-badge").innerText(), /Reading Neo4j/);
    await screen("How PayTrace works");
    await page.getByRole("heading", { name: "Your payments, explained" }).waitFor();
    await shot("live-graph");
    await screen("All payments");
    await page.getByRole("button", { name: "Run difficult scenario" }).click();
    await page.locator(".simulation-result").waitFor();
    assert.match(await page.locator(".simulation-result").innerText(), /transaction rolled back/);
    assert.match(await page.locator(".simulation-result").innerText(), /outside the 45-day matching window/);
    await page.getByRole("button", { name: "Review Lumen Notes evidence" }).click();
    await page.getByText("Explore technical evidence", { exact: true }).click();
    await page.locator(".notice-exclusion").waitFor();
    await shot("difficult-scenario-evidence");
    await page.locator(".detail-panel header button").click();
    await page.getByRole("button", { name: "Reset demo scenario" }).click();
    assert.equal(await page.locator(".payment-row").filter({ hasText: "Lumen Notes" }).count(), 0);
    await page.locator(".payment-row").filter({ hasText: "Spotify" }).first().click();
    await page.getByText("Explore technical evidence", { exact: true }).click();
    await page.locator(".evidence-path").waitFor();
    await shot("discovery-evidence");
    await page.locator(".detail-panel header button").click();
    await screen("Save money");
    await shot("issues");
    await screen("Stop a payment");
    const gym = page.getByRole("article", { name: "FitLine Gym payment", exact: true });
    await gym.getByRole("button", { name: "Show steps to stop", exact: true }).click();
    await gym.getByText("Instructions viewed.", { exact: false }).waitFor();
    await shot("cancellation-guidance");
    await page.reload({ waitUntil: "networkidle" });
    await screen("Stop a payment");
    await gym.getByRole("button", { name: "Show steps to stop", exact: true }).click();
    await gym.getByText("Instructions viewed.", { exact: false }).waitFor();
    await gym.getByRole("button", { name: "I completed these steps", exact: true }).click();
    await page.getByRole("button", { name: "Yes, I have stopped it", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("User reports cancelled", { exact: false }).waitFor();
    await shot("persisted-report");
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) => entry.endsWith(":reports"));
      if (!key) throw new Error("Cancellation report was not saved");
      const reports = JSON.parse(localStorage.getItem(key)!);
      for (const id of Object.keys(reports)) reports[id] = "2026-01-01";
      localStorage.setItem(key, JSON.stringify(reports));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Future debit observed", { exact: false }).waitFor();
    await shot("later-debit-detected");
    await screen("Spending");
    await page.locator(".money-summary").waitFor();
    await shot("annual-impact");
    await page.getByRole("link", { name: "Second synthetic dataset" }).click();
    await screen("All payments");
    await page.locator(".payment-row").filter({ hasText: "CloudNote" }).waitFor();
    await page.locator(".technical-source summary").click();
    assert.match(await page.locator(".source-badge").innerText(), /CSV fixture/);
    await shot("second-dataset");
  } finally {
    await context.close();
    await browser.close();
  }
  if (video) renameSync(await video.path(), path.join(out, "paytrace-live.webm"));
  console.log(`Saved recording and screenshots: ${out}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
