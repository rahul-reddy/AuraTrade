import { LOCK_MS, LoginThrottle, MAX_FAILURES, WINDOW_MS } from "@/lib/login-throttle";
import { isRegistrationOpen } from "@/lib/registration";

describe("LoginThrottle", () => {
  const email = "owner@example.com";

  it("locks after MAX_FAILURES failures inside the window", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure(email, 1000 + i);
    expect(throttle.isLocked(email, 2000)).toBe(false);
    throttle.recordFailure(email, 2000);
    expect(throttle.isLocked(email, 2001)).toBe(true);
  });

  it("matches addresses case- and whitespace-insensitively", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure(" Owner@Example.com ", 0);
    expect(throttle.isLocked(email, 1)).toBe(true);
  });

  it("unlocks once LOCK_MS has passed", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure(email, 0);
    expect(throttle.isLocked(email, LOCK_MS - 1)).toBe(true);
    expect(throttle.isLocked(email, LOCK_MS)).toBe(false);
  });

  it("starts a fresh count after a lock expires", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure(email, 0);
    throttle.recordFailure(email, LOCK_MS);
    expect(throttle.isLocked(email, LOCK_MS + 1)).toBe(false);
  });

  it("forgets failures older than the window", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure(email, 0);
    throttle.recordFailure(email, WINDOW_MS);
    expect(throttle.isLocked(email, WINDOW_MS + 1)).toBe(false);
  });

  it("clears the record on success", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure(email, 0);
    throttle.recordSuccess(email);
    throttle.recordFailure(email, 1);
    expect(throttle.isLocked(email, 2)).toBe(false);
  });

  it("does not lock other addresses", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure(email, 0);
    expect(throttle.isLocked("other@example.com", 1)).toBe(false);
  });
});

describe("isRegistrationOpen", () => {
  it("is open when unset, empty or 'open'", () => {
    expect(isRegistrationOpen({})).toBe(true);
    expect(isRegistrationOpen({ AURATRADE_REGISTRATION: "" })).toBe(true);
    expect(isRegistrationOpen({ AURATRADE_REGISTRATION: " Open " })).toBe(true);
  });

  it("is closed for 'closed' and for any unrecognized value", () => {
    expect(isRegistrationOpen({ AURATRADE_REGISTRATION: "closed" })).toBe(false);
    expect(isRegistrationOpen({ AURATRADE_REGISTRATION: "off" })).toBe(false);
    expect(isRegistrationOpen({ AURATRADE_REGISTRATION: "opne" })).toBe(false);
  });
});
