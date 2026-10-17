/**
 * Public sign-up switch.
 *
 * `AURATRADE_REGISTRATION=closed` turns `/register` and `POST /api/auth/register`
 * off; accounts are then created on the server with `deploy/set-user.mjs`. The
 * hosted deployment pins it to `closed` in deploy/compose.yaml, where the
 * server's .env cannot override it.
 *
 * Unset or `open` keeps sign-up on, which local development and the browser
 * tests rely on. Any other value is treated as a typo for `closed`: a mistyped
 * setting must never open sign-up on a server that meant to close it.
 */
export function isRegistrationOpen(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env.AURATRADE_REGISTRATION?.trim().toLowerCase();
  return value === undefined || value === "" || value === "open";
}
