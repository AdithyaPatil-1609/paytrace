/**
 * Records the live-mode walkthrough, and refuses to record the wrong one.
 *
 * Run with: npm run demo   (app already running on BASE_URL, default :3000)
 *
 * It checks, in order, the four things a judge needs to see in the video:
 * the Reading Neo4j badge, Screen 00 (the graph itself), an Evidence path
 * that names the missing price_change edge, and all four product screens —
 * with Simulate answered by Cypher on the way. Any one missing fails the run.
 *
 * Output: work/demo/paytrace-live.webm and one PNG per step.
 * Flags:  --headed to watch it, --allow-fixture to record the CSV path anyway.
 */
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = path.join(process.cwd(), "work", "demo");
const headed = process.argv.includes("--headed");
const allowFixture = process.argv.includes("--allow-fixture");

let step = 0;

async function shot(page: Page, name: string) {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log(`  ✓ ${name}`);
}

async function expectText(page: Page, selector: string, text: string, what: string) {
  const locator = page.locator(selector).filter({ hasText: text }).first();
  try {
    await locator.waitFor({ state: "visible", timeout: 8000 });
  } catch {
    throw new Error(`${what}: expected "${text}" in ${selector}, and it is not on screen.`);
  }
  return locator;
}

async function openScreen(page: Page, label: string) {
  await page.locator(".side-nav button", { hasText: label }).click();
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.waitForTimeout(900);
}

async function glide(page: Page, distance: number) {
  for (let moved = 0; moved < distance; moved += 120) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(140);
  }
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: !headed, slowMo: 60 });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1440, height: 900 } }
  });
  const page = await context.newPage();

  try {
    console.log(`Recording ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: "networkidle" });

    // 1. The badge. The CSV clip is the one that scored lower.
    const badge = (await page.locator(".source-badge").innerText()).trim();
    if (!badge.includes("Reading Neo4j") && !allowFixture) {
      const note = await page.locator(".evidence-strip").innerText().catch(() => "");
      throw new Error(
        `The app is on the CSV fixture ("${badge}"). ${note.trim()}\n` +
          "Start Neo4j (docker compose up -d), run npm run seed, restart npm run dev, then record again."
      );
    }
    await expectText(page, ".evidence-strip", "Cypher decided", "Neo4j strip");
    await page.waitForTimeout(1200);
    await shot(page, "badge-reading-neo4j");

    // 2. Screen 00 — the graph before the product.
    await expectText(page, ".screen-header h1", "The harm is a missing edge", "Screen 00");
    await expectText(page, ".graph-focus", "price_change × 0", "Screen 00 missing edge");
    await shot(page, "screen-00-graph");
    await glide(page, 700);
    await page.waitForTimeout(800);
    await shot(page, "screen-00-findings");
    await page.locator(".graph-finding details summary").first().click();
    await page.waitForTimeout(1200);
    await shot(page, "screen-00-cypher");

    // 3. Screen 01 — then an Evidence path on the silent hike.
    await page.locator(".graph-handoff button").click();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await expectText(page, ".screen-header", "SCREEN 1", "Screen 01");
    await page.waitForTimeout(900);
    await shot(page, "screen-01-all-payments");
    await page.locator(".payment-row", { hasText: "Spotify" }).first().click();
    const pathBlock = await expectText(page, ".evidence-path", "Evidence path · Neo4j", "Evidence path");
    await expectText(page, ".path-finding", "silent_hike", "Evidence path finding");
    await pathBlock.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    await shot(page, "evidence-path-spotify");
    await page.locator(".detail-panel header button").click();

    // Simulate, answered by Cypher in a rolled-back transaction.
    const simulate = page.locator(".simulation-card .primary-button");
    await simulate.scrollIntoViewIfNeeded();
    await simulate.click();
    await expectText(page, ".simulation-card", "rolled back", "Simulate in Neo4j");
    await page.waitForTimeout(1200);
    await shot(page, "simulate-in-neo4j");
    await page.locator(".simulation-card .secondary-button").click();

    // 4. Screens 02–04.
    await openScreen(page, "Issues");
    await expectText(page, ".screen-header", "SCREEN 2", "Screen 02");
    await shot(page, "screen-02-issues");
    await glide(page, 600);
    await shot(page, "screen-02-price-history");

    await openScreen(page, "Cancel paths");
    await expectText(page, ".screen-header", "SCREEN 3", "Screen 03");
    await shot(page, "screen-03-cancel-paths");

    await openScreen(page, "Annual");
    await expectText(page, ".screen-header", "SCREEN 4", "Screen 04");
    await shot(page, "screen-04-annual");
    const proof = page.locator(".source-panel.live");
    await proof.scrollIntoViewIfNeeded();
    await expectText(page, ".source-panel.live", "Decided in Neo4j", "Screen 04 Neo4j proof");
    await page.waitForTimeout(1500);
    await shot(page, "screen-04-decided-in-neo4j");
  } finally {
    await context.close();
    await browser.close();
  }

  const video = readdirSync(OUT).find((file) => file.endsWith(".webm"));
  if (video) renameSync(path.join(OUT, video), path.join(OUT, "paytrace-live.webm"));
  console.log(`\nSaved ${step} screenshots and paytrace-live.webm to ${path.relative(process.cwd(), OUT)}/`);
}

main().catch((error) => {
  console.error(`\nDemo failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
