/**
 * Failed sign-in lockout, per email address.
 *
 * After MAX_FAILURES wrong passwords within WINDOW_MS, that address is locked
 * for LOCK_MS: sign-in is refused without checking the password, so guessing
 * cannot continue while locked. A successful sign-in clears the record.
 *
 * State is in memory. The hosted deployment runs one server process, so one
 * map is the whole picture; a restart forgets lockouts, which is acceptable
 * for a single-owner app (an attacker cannot trigger restarts).
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
export const LOCK_MS = 15 * 60 * 1000;
// Bounds memory if someone sprays many distinct addresses.
export const MAX_TRACKED = 10_000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  isLocked(email: string, now: number = Date.now()): boolean {
    const key = this.key(email);
    const entry = this.entries.get(key);
    if (entry !== undefined) return entry.lockedUntil > now;
    // Fail closed: when every slot holds a live count or lock (someone sprayed
    // failures across MAX_TRACKED addresses), an address with no slot cannot
    // be counted, so it is treated as locked until slots free up. Otherwise
    // the spray would grant unlimited guesses at any untracked address.
    if (this.entries.size >= MAX_TRACKED) {
      this.prune(now);
      return this.entries.size >= MAX_TRACKED;
    }
    return false;
  }

  recordFailure(email: string, now: number = Date.now()): void {
    const key = this.key(email);
    const existing = this.entries.get(key);
    // Sign-in checks run concurrently, so a failure can land after another
    // request has already set the lock; it must never replace an active lock.
    if (existing && existing.lockedUntil > now) {
      existing.failures += 1;
      return;
    }
    // Continue an unlocked count inside the window; an expired lock or an old
    // count starts afresh.
    const entry: Entry =
      existing && existing.lockedUntil === 0 && now - existing.firstFailureAt < WINDOW_MS
        ? existing
        : { failures: 0, firstFailureAt: now, lockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = now + LOCK_MS;
    }
    if (!this.entries.has(key) && this.entries.size >= MAX_TRACKED) {
      this.prune(now);
      // Every slot holds a live count or lock, none of which may be dropped.
      // isLocked() refuses untracked addresses meanwhile.
      if (this.entries.size >= MAX_TRACKED) return;
    }
    this.entries.set(key, entry);
  }

  recordSuccess(email: string): void {
    this.entries.delete(this.key(email));
  }

  // Drops only records that no longer affect any decision: the lock (if any)
  // has expired and the failure window has passed. A live count is never
  // evicted, or spraying other addresses could reset it below the threshold.
  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstFailureAt >= WINDOW_MS) {
        this.entries.delete(key);
      }
    }
  }
}

export const loginThrottle = new LoginThrottle();
