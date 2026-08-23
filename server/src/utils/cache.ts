interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Tiny TTL cache with single-flight de-duplication so a burst of dashboard
 * polls never fans out into a burst of upstream calls.
 */
export class TtlCache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async wrap<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const task = factory()
      .then((value) => {
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, task);
    return task;
  }

  /** Last known good value, ignoring expiry — used as a fallback on upstream errors. */
  stale<T>(key: string): T | undefined {
    return this.store.get(key)?.value as T | undefined;
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

export const cache = new TtlCache();
