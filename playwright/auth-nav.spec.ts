import { expect, test, type Page } from "@playwright/test";

async function registerAndSignIn(page: Page) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const name = `Playwright ${unique}`;
  const email = `playwright-${unique}@example.com`;
  const password = "playwright-pass-123";

  await page.goto("/register");
  await expect(page.getByText("Create account").first()).toBeVisible();

  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL(/\/login\?registered=1$/, { timeout: 15_000 });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL(/\/dashboard(?:\?.*)?$/, { timeout: 30_000 });
  // AnimatePresence keeps the exiting page mounted during the transition, so
  // the empty state briefly exists twice; wait for exactly one, then check it.
  await expect(page.getByText("No trading account found.")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(page.getByText("No trading account found.")).toBeVisible();

  return { email };
}

test("user can register, sign in, and navigate core authenticated pages", async ({ page }) => {
  test.setTimeout(60_000);

  await registerAndSignIn(page);

  await page.getByRole("link", { name: "Upload a CSV to get started →" }).click();
  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByRole("heading", { name: "Import Trades" })).toBeVisible();

  await page.goto("/trades");
  await expect(page).toHaveURL(/\/trades$/);
  await expect(page.getByText("No trading account found.")).toHaveCount(1);
  await expect(page.getByText("No trading account found.")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
});
