import { expect, test } from "@playwright/test";

// src/lib/login-throttle.ts: five wrong passwords lock the address, and the
// correct password is then refused too (the message does not reveal the lock).
test("five wrong passwords lock the address, even for the right password", async ({ page, request }) => {
  test.setTimeout(90_000);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `lockout-${unique}@example.com`;
  const password = "playwright-pass-123";

  const registered = await request.post("/api/auth/register", {
    data: { name: `Lockout ${unique}`, email, password },
  });
  expect(registered.status()).toBe(201);

  async function signIn(attempt: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(attempt);
    await page.getByRole("button", { name: "Sign in" }).click();
  }

  for (let i = 0; i < 5; i++) {
    await signIn("wrong-password-123");
    await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 15_000 });
  }

  await signIn(password);
  await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/login/);
});
