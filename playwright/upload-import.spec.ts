import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `playwright-upload-${unique}@example.com`;
  const password = "playwright-pass-123";

  await page.goto("/register");
  await page.getByLabel("Name").fill(`Playwright Upload ${unique}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });
}

test("user can upload a CSV and see imported trades", async ({ page }) => {
  test.setTimeout(60_000);

  await registerAndSignIn(page);

  const fixturePath = path.join(process.cwd(), "playwright", "fixtures", "sample-trades.csv");

  await page.goto("/upload");
  await expect(page.getByRole("heading", { name: "Import Trades" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(page.getByText("sample-trades.csv")).toBeVisible();
  await expect(page.getByText("Executions parsed")).toBeVisible();

  const importButton = page.getByRole("button", { name: "Import 1 Trades" });
  await expect(importButton).toBeEnabled();
  await importButton.scrollIntoViewIfNeeded();
  await importButton.click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible({
    timeout: 20_000,
  });

  await page.goto("/trades");
  await expect(page.getByRole("heading", { name: "Trade History" })).toBeVisible();
  await expect(page.getByRole("link", { name: "BROS" })).toBeVisible();
});
