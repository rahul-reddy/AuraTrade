import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-chart-${unique}@example.com`;
  const password = "playwright-pass-123";

  await page.goto("/register");
  await page.getByLabel("Name").fill(`Playwright Chart ${unique}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });
}

test("user can navigate from trades into the symbol chart workspace", async ({ page }) => {
  test.setTimeout(60_000);

  await registerAndSignIn(page);

  const fixturePath = path.join(process.cwd(), "playwright", "fixtures", "sample-trades.csv");

  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Executions parsed")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 Trades" }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/trades", { waitUntil: "domcontentloaded" });
  const main = page.locator("#main-content");
  await expect(main.getByRole("heading", { name: "Trade History", exact: true })).toHaveCount(1);
  await expect(main.getByRole("heading", { name: "Trade History", exact: true })).toBeVisible();

  // Navigate to chart from trades list
  const chartLink = main.getByRole("link", { name: "BROS", exact: true });
  await expect(chartLink).toHaveAttribute("href", /\/chart\/BROS/);
  await Promise.all([
    page.waitForURL(/\/chart\/BROS/, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    }),
    chartLink.click(),
  ]);

  // Header: back link and symbol name visible
  // Next may temporarily retain streamed route copies outside main content.
  const backLink = main.getByRole("link", { name: "← Trades", exact: true });
  await expect(backLink).toHaveCount(1);
  await expect(backLink).toBeVisible();
  const heading = main.getByRole("heading", { name: "BROS", exact: true });
  await expect(heading).toHaveCount(1);
  await expect(heading).toBeVisible();

  // Stats panel: Net P&L and Win Rate labels visible
  await expect(main.getByText("Net P&L", { exact: true })).toBeVisible();
  await expect(main.getByText("Win Rate", { exact: true })).toBeVisible();

  // Sidebar: trade list section visible
  await expect(main.getByText("Trades · BROS", { exact: true })).toBeVisible();

  // Chart toolbar: all timeframe buttons present
  await expect(main.getByRole("button", { name: "1D", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "1H", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "15M", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "5M", exact: true })).toBeVisible();
  await expect(main.getByRole("button", { name: "1M", exact: true })).toBeVisible();

  // Click 1H — fixture trade is from 2022, so Yahoo falls back to daily.
  // The amber fallback message in the toolbar confirms the TF switch was processed.
  await main.getByRole("button", { name: "1H", exact: true }).click();
  await expect(main.getByText(/Intraday.*not available|Showing daily/i)).toBeVisible({ timeout: 15_000 });
});
