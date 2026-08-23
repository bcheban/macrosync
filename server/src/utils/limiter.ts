/**
 * A minimal concurrency gate.
 *
 * Sixteen tracked symbols means sixteen kline requests per refresh, and firing
 * them all at once is the fastest way to get rate limited by a public exchange
 * endpoint. Queueing them a few at a time costs a little latency and removes
 * that risk entirely.
 */
export function createLimiter(limit: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  const next = (): void => {
    if (active >= limit) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };

  return async function schedule<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    else active += 1;

    try {
      return await task();
    } finally {
      active -= 1;
      next();
    }
  };
}

/** Thrown when upstream answers 429/418, so callers can back off differently. */
export class RateLimitedError extends Error {
  readonly status: number;

  constructor(status: number, message = `upstream rate limited (${status})`) {
    super(message);
    this.name = 'RateLimitedError';
    this.status = status;
  }
}
