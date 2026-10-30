import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const failures = [];
const report = [];

function check(condition, description) {
  if (!condition) failures.push(description);
}

await page.goto("http://127.0.0.1:3000", { waitUntil: "networkidle" });

for (const width of [320, 390, 480, 768, 1024, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  for (const screen of ["Spending", "All payments", "Save money", "Stop a payment", "How it works"]) {
    await page.locator("button:visible", { hasText: screen }).first().click();
    await page.waitForTimeout(100);
    const result = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heading: document.querySelector("h1")?.textContent?.trim() ?? "",
      unlabeledButtons: [...document.querySelectorAll("button")]
        .filter((button) => button.getClientRects().length > 0)
        .filter((button) => !(button.textContent?.trim() || button.getAttribute("aria-label")))
        .map((button) => button.outerHTML.slice(0, 120)),
    }));
    check(result.scrollWidth <= result.width, `${width}px ${screen}: horizontal overflow (${result.scrollWidth}/${result.width})`);
    check(Boolean(result.heading), `${width}px ${screen}: missing page heading`);
    check(result.unlabeledButtons.length === 0, `${width}px ${screen}: unlabeled visible button`);
    report.push(`${width}px ${screen}: ${result.heading}; ${result.scrollWidth}/${result.width}`);
  }
}

await page.setViewportSize({ width: 1280, height: 900 });
await page.locator("button:visible", { hasText: "All payments" }).first().click();
await page.locator(".payment-row").first().click();
await page.locator(".detail-panel").waitFor();
await page.keyboard.press("Escape");
await page.waitForTimeout(100);
check(await page.locator(".detail-panel").count() === 0, "Payment details do not close with Escape");

await page.locator("button:visible", { hasText: "Save money" }).first().click();
const firstChoice = page.locator(".savings-choice input").first();
const beforeSavings = await page.locator(".savings-result").innerText();
await firstChoice.uncheck();
const afterSavings = await page.locator(".savings-result").innerText();
check(beforeSavings !== afterSavings, "Changing a savings choice does not update the estimate");
await page.locator("button:visible", { hasText: "See how to stop payments" }).click();
check(await page.locator("h1").innerText() === "Review or stop a payment", "Savings action does not open the stop-payment screen");

await page.locator("button:visible", { hasText: "Stop a payment" }).first().click();
await page.getByLabel("Find a service").fill("FitLine");
await page.locator("button:visible", { hasText: "Show steps to stop" }).click();
const action = page.locator(".stop-record-action button");
const actionStyle = await action.evaluate((node) => {
  const style = getComputedStyle(node);
  return { text: node.textContent?.trim(), color: style.color, background: style.backgroundColor, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, html: node.outerHTML };
});
check(Boolean(actionStyle.text), "Stop-payment action has no label");
check(actionStyle.color !== actionStyle.background, "Stop-payment action label has the same colour as its background");
report.push(`Action: ${JSON.stringify(actionStyle)}`);
await action.click();
await page.locator("[data-slot='alert-dialog-content']").waitFor();
await page.locator("button:visible", { hasText: "Go back" }).click();
check(await page.locator("[data-slot='alert-dialog-content']").count() === 0, "Stop-payment confirmation does not close");

await page.locator("button:visible", { hasText: "Spending" }).first().click();
await page.locator("summary", { hasText: "See payment dates on a calendar" }).click();
const calendarMonth = page.locator(".fridge-head strong");
const beforeMonth = await calendarMonth.innerText();
await page.locator("button[aria-label='Next month']").click();
check(await calendarMonth.innerText() !== beforeMonth, "Payment calendar did not navigate to the next month");

const bannedCopy = await page.locator("body").innerText();
check(!/\b(demo|factual|synthetic|sample|prototype|fixture)\b/i.test(bannedCopy), "Public UI contains a demo or factual-data label");
await page.screenshot({ path: "/tmp/paytrace-ui-audit.png", fullPage: true });

console.log(report.join("\n"));
if (failures.length) {
  console.error("\nFAILURES\n" + failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("\nUI audit passed");
}
await browser.close();
