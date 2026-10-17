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
const MAX_TRACKED = 10_000;

type Entry = { failures: number; firstFailureAt: number; lockedUntil: number };

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();

  private key(email: string): string {
    return email.trim().toLowerCase();
  }

  isLocked(email: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(this.key(email));
    return entry !== undefined && entry.lockedUntil > now;
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
    }
    this.entries.set(key, entry);
  }

  recordSuccess(email: string): void {
    this.entries.delete(this.key(email));
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.lockedUntil <= now && now - entry.firstFailureAt >= WINDOW_MS) {
        this.entries.delete(key);
      }
    }
    // Still full: drop the oldest records (Map keeps insertion order).
    for (const key of this.entries.keys()) {
      if (this.entries.size < MAX_TRACKED) break;
      this.entries.delete(key);
    }
  }
}

export const loginThrottle = new LoginThrottle();
