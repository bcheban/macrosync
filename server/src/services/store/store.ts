import { env } from '../../config/env.js';

/**
 * Persistence for the little state that must outlive a serverless invocation:
 * which alerts have already gone out, and which trades are still open.
 *
 * Backed by Upstash Redis over its REST API — no TCP socket, no SDK, and no
 * connection to keep warm, which is the only shape that works reliably in a
 * function that may be cold on every request. Falls back to an in-memory map
 * when unconfigured, so local development and an un-provisioned deploy still
 * run; they simply forget everything between invocations.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const memory = new Map<string, string>();
/** Key -> expiry, for the memory backend only; Redis expires its own keys. */
const expiries = new Map<string, number>();
const sets = new Map<string, Set<string>>();

/** Drops a memory-backend key that has passed its TTL. */
const expired = (key: string): boolean => {
  const until = expiries.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return false;
  memory.delete(key);
  expiries.delete(key);
  return true;
};

/** Vercel's marketplace integration and Upstash's own docs use different names. */
const REST_URL = env.redisUrl;
const REST_TOKEN = env.redisToken;

/**
 * Tests never reach the real store, whatever the environment says.
 *
 * `NODE_TEST_CONTEXT` is set by the node test runner in the process it runs
 * cases in, and by nothing else. Without this the backend is chosen purely by
 * whether credentials happen to be present — so a developer who pulls an env
 * file to run a script has, from that moment, a test suite that reads and
 * writes the production ledger. It opens trades, settles them and records wins.
 *
 * That very nearly happened here: the suite was pointed at production for one
 * run and got away with it only because every case that writes also stubs
 * `globalThis.fetch`, which swallowed the REST calls by accident. A file that
 * did not stub fetch would have written for real, and the first sign of it
 * would have been a win rate nobody could explain.
 *
 * Checked here rather than in a test setup file because the guarantee has to
 * hold for every test file including ones not yet written — a convention that
 * has to be remembered is not a guarantee.
 */
const underTest = (): boolean => Boolean(process.env.NODE_TEST_CONTEXT);

export const storeBackend = (): 'redis' | 'memory' =>
  REST_URL && REST_TOKEN && !underTest() ? 'redis' : 'memory';

let lastError: string | undefined;

export const storeStatus = () => ({
  backend: storeBackend(),
  /** Memory means alerts and open trades do not survive a cold start. */
  persistent: storeBackend() === 'redis',
  lastError: lastError ?? null,
});

async function command<T = Json>(args: (string | number)[]): Promise<T | null> {
  if (storeBackend() === 'memory') return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.redisTimeoutMs);
  try {
    const response = await fetch(REST_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${REST_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(payload.error);

    lastError = undefined;
    return payload.result ?? null;
  } catch (error) {
    lastError = (error as Error).message;
    console.warn('[store] command failed:', args[0], lastError);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a JSON value.
 *
 * A store failure returns the fallback rather than throwing: losing the
 * alert-dedup record costs a duplicate message, which is far better than the
 * cron run failing outright.
 */
export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw =
    storeBackend() === 'memory'
      ? (expired(key) ? null : (memory.get(key) ?? null))
      : await command<string>(['GET', key]);
  if (raw === null || raw === undefined) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  const raw = JSON.stringify(value);

  if (storeBackend() === 'memory') {
    memory.set(key, raw);
    if (ttlSeconds) expiries.set(key, Date.now() + ttlSeconds * 1000);
    else expiries.delete(key);
    return;
  }

  await command(ttlSeconds ? ['SET', key, raw, 'EX', ttlSeconds] : ['SET', key, raw]);
}

export async function deleteKey(key: string): Promise<void> {
  if (storeBackend() === 'memory') {
    memory.delete(key);
    expiries.delete(key);
    return;
  }
  await command(['DEL', key]);
}

/**
 * Set membership, for the subscriber roster.
 *
 * A set rather than a JSON array because subscribing is a concurrent write from
 * an unpredictable direction — a webhook, not the scheduled run — and two people
 * pressing start at the same moment must not read-modify-write over each other.
 * `SADD` is atomic; a JSON list is not.
 */
export async function addToSet(key: string, member: string): Promise<void> {
  if (storeBackend() === 'memory') {
    const existing = sets.get(key) ?? new Set<string>();
    existing.add(member);
    sets.set(key, existing);
    return;
  }
  await command(['SADD', key, member]);
}

export async function removeFromSet(key: string, member: string): Promise<void> {
  if (storeBackend() === 'memory') {
    sets.get(key)?.delete(member);
    return;
  }
  await command(['SREM', key, member]);
}

export async function setMembers(key: string): Promise<string[]> {
  if (storeBackend() === 'memory') return [...(sets.get(key) ?? [])];

  const result = await command<string[]>(['SMEMBERS', key]);
  return Array.isArray(result) ? result.map(String) : [];
}

const locks = new Map<string, number>();

/**
 * Clears the in-memory backend.
 *
 * Exists for tests: they share one module graph, so without this each case
 * would inherit the previous one's ledger. A no-op against Redis, so it cannot
 * touch real data even if called by mistake.
 */
export function resetMemoryStore(): void {
  memory.clear();
  expiries.clear();
  sets.clear();
  locks.clear();
}

/**
 * Best-effort mutual exclusion for the scheduled run.
 *
 * Two overlapping runs would both read the trade ledger, both write it, and the
 * second would erase the first — losing a settled trade and its win or loss.
 * `SET NX EX` makes the second run stand down instead. It is not a distributed
 * lock in the strict sense, but the failure mode it guards is a slow run
 * overlapping the next tick, which this covers exactly.
 */
export async function acquireLock(key: string, ttlSeconds: number): Promise<boolean> {
  if (storeBackend() === 'memory') {
    const now = Date.now();
    const held = locks.get(key);
    if (held && held > now) return false;
    locks.set(key, now + ttlSeconds * 1000);
    return true;
  }

  const result = await command<string>(['SET', key, String(Date.now()), 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  if (storeBackend() === 'memory') {
    locks.delete(key);
    return;
  }
  await command(['DEL', key]);
}

/** Namespaced so one Redis instance can host several deployments. */
export const storeKey = (name: string): string => `${env.redisPrefix}:${name}`;

/**
 * Every key under a pattern.
 *
 * `KEYS` rather than `SCAN` deliberately: this deployment holds a few dozen
 * keys, and the operation it serves is a deliberate, rare, admin-triggered
 * wipe. `SCAN` would be right for a large keyspace; here it would be ceremony
 * around a single small round trip.
 */
export async function listKeys(pattern: string): Promise<string[]> {
  if (storeBackend() === 'memory') {
    const prefix = pattern.replace(/\*$/, '');
    return [...new Set([...memory.keys(), ...sets.keys()])].filter((key) => key.startsWith(prefix));
  }

  const result = await command<string[]>(['KEYS', pattern]);
  return Array.isArray(result) ? result.map(String) : [];
}

/** Deletes the given keys, returning how many existed. */
export async function deleteKeys(keys: string[]): Promise<number> {
  if (!keys.length) return 0;

  if (storeBackend() === 'memory') {
    let removed = 0;
    for (const key of keys) {
      if (memory.delete(key) || sets.delete(key)) removed += 1;
      expiries.delete(key);
    }
    return removed;
  }

  const result = await command<number>(['DEL', ...keys]);
  return typeof result === 'number' ? result : keys.length;
}
