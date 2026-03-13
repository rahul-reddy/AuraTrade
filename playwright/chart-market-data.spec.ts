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

test("user can navigate from trades into the symbol market-data preview", async ({ page }) => {
  await registerAndSignIn(page);

  const fixturePath = path.join(process.cwd(), "playwright", "fixtures", "sample-trades.csv");

  await page.goto("/upload");
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("Executions parsed")).toBeVisible();
  await page.getByRole("button", { name: "Import 1 Trades" }).click();
  await expect(page.getByText("Import complete")).toBeVisible();

  await page.goto("/trades");
  await expect(page.getByRole("heading", { name: "Trade History" })).toBeVisible();

  await page.getByRole("link", { name: "BROS" }).click();
  await page.waitForURL(/\/chart\/BROS\?/);
  await expect(page.getByText("Market data preview")).toBeVisible();
  await expect(page.getByText("Window:")).toBeVisible();
  await expect(page.getByText("Selected trade:")).toBeVisible();
  await expect(page.getByRole("link", { name: "1H" })).toBeVisible();

  await page.getByRole("link", { name: "1H" }).click();
  await page.waitForURL(/timeframe=1h/);
  await expect(page.getByText("Market data preview")).toBeVisible();
  await expect(page.getByText("Closed Net P&L")).toBeVisible();
});
