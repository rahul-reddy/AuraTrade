import { LOCK_MS, LoginThrottle, MAX_FAILURES, MAX_TRACKED, WINDOW_MS } from "@/lib/login-throttle";
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

  it("keeps an active lock when in-flight failures land after it was set", () => {
    const throttle = new LoginThrottle();
    // Six concurrent wrong guesses: all passed isLocked() before any finished.
    for (let i = 0; i < MAX_FAILURES + 1; i++) throttle.recordFailure(email, 100);
    expect(throttle.isLocked(email, 101)).toBe(true);
    // A later straggler, still inside the lock, neither resets nor extends it.
    throttle.recordFailure(email, 200);
    expect(throttle.isLocked(email, 100 + LOCK_MS - 1)).toBe(true);
    expect(throttle.isLocked(email, 100 + LOCK_MS)).toBe(false);
  });

  it("keeps an active lock when other addresses fill the tracker", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES; i++) throttle.recordFailure(email, 0);
    for (let i = 0; i < MAX_TRACKED + 10; i++) throttle.recordFailure(`spray-${i}@example.com`, 0);
    expect(throttle.isLocked(email, 1)).toBe(true);
  });

  it("keeps an unlocked count when other addresses fill the tracker", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_FAILURES - 1; i++) throttle.recordFailure(email, 0);
    for (let i = 0; i < MAX_TRACKED; i++) throttle.recordFailure(`spray-${i}@example.com`, 1);
    // The spray must not have reset the count: the next failure locks.
    throttle.recordFailure(email, 2);
    expect(throttle.isLocked(email, 3)).toBe(true);
  });

  it("refuses untracked addresses while the tracker is full of live counts", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_TRACKED; i++) throttle.recordFailure(`spray-${i}@example.com`, 0);
    expect(throttle.isLocked(email, 1)).toBe(true);
    // Once the spray's window passes, its records are pruned and the address is free.
    expect(throttle.isLocked(email, WINDOW_MS)).toBe(false);
  });

  it("keeps every lock when the tracker is full of locks", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_TRACKED; i++) {
      for (let j = 0; j < MAX_FAILURES; j++) throttle.recordFailure(`locked-${i}@example.com`, 0);
    }
    throttle.recordFailure("newcomer@example.com", 1);
    expect(throttle.isLocked("locked-0@example.com", 2)).toBe(true);
    expect(throttle.isLocked(`locked-${MAX_TRACKED - 1}@example.com`, 2)).toBe(true);
  });

  it("refuses an untracked address while every slot is locked, then frees it", () => {
    const throttle = new LoginThrottle();
    for (let i = 0; i < MAX_TRACKED; i++) {
      for (let j = 0; j < MAX_FAILURES; j++) throttle.recordFailure(`locked-${i}@example.com`, 0);
    }
    // The victim never failed, so it has no slot; it must not get free guesses.
    expect(throttle.isLocked(email, 1)).toBe(true);
    // Once the spray's locks expire, the victim is no longer refused.
    expect(throttle.isLocked(email, LOCK_MS + WINDOW_MS)).toBe(false);
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
