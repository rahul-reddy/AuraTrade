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
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}

test("user can navigate from trades into the symbol chart workspace", async ({ page }) => {
  await registerAndSignIn(page);

  const fixturePath = path.join(process.cwd(), "playwright", "fixtures", "sample-trades.csv");

  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Executions parsed")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 Trades" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/trades");
  await expect(page.getByRole("heading", { name: "Trade History" })).toBeVisible();

  // Navigate to chart from trades list
  await page.getByRole("link", { name: "BROS" }).click();
  await page.waitForURL(/\/chart\/BROS/);

  // Header: back link and symbol name visible
  await expect(page.getByRole("link", { name: "← Trades" })).toBeVisible();
  await expect(page.getByText("BROS").first()).toBeVisible();

  // Stats panel: Net P&L and Win Rate labels visible
  await expect(page.getByText("Net P&L")).toBeVisible();
  await expect(page.getByText("Win Rate")).toBeVisible();

  // Sidebar: trade list section visible
  await expect(page.getByText("Trades · BROS")).toBeVisible();

  // Chart toolbar: all timeframe buttons present
  await expect(page.getByRole("button", { name: "1D" })).toBeVisible();
  await expect(page.getByRole("button", { name: "1H" })).toBeVisible();
  await expect(page.getByRole("button", { name: "15M" })).toBeVisible();
  await expect(page.getByRole("button", { name: "5M", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1M", exact: true })).toBeVisible();

  // Click 1H — fixture trade is from 2022, so Yahoo falls back to daily.
  // The amber fallback message in the toolbar confirms the TF switch was processed.
  await page.getByRole("button", { name: "1H" }).click();
  await expect(page.getByText(/Intraday.*not available|Showing daily/i)).toBeVisible({ timeout: 15_000 });
});
