#!/usr/bin/env node
/**
 * Zeroes the trading record before a release that changes what it means.
 *
 * Run this once before the multi-TP cut-over. Every open trade was published
 * with one target and no ladder, and every win on the record was earned by a
 * full position running to a single level — under the new rules the same tape
 * would have booked half at 1R and protected the rest. Carrying those figures
 * forward would make the published win rate and the net R claims about a system
 * that no longer exists.
 *
 * Talks to Redis directly rather than through the deployed app, so it works
 * before the release is out and does not need the app's admin secret.
 *
 *   node scripts/reset-ledger.mjs            # dry run: lists what would go
 *   node scripts/reset-ledger.mjs --confirm  # actually deletes
 *
 * Dry run is the default and the confirmation flag is spelled out rather than
 * being a `-y`, because the one thing this script must never do is run by
 * accident in a shell someone was scrolling through.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The record, and everything computed from it. Mirrors `reset.service.ts`. */
const PATTERNS = [
  'trades:active',
  'trades:stats',
  'trades:history',
  'trades:cards:*',
  'alerts:last',
  'analytics:snapshot',
  'telegram:daily-report',
  'telegram:delivery',
  'cron:last',
];

/** The roster is not part of the record and is never touched here. */
const PREFIX = process.env.STORE_PREFIX ?? 'macrosync';

/**
 * Where the credentials come from, resolved against this file rather than the
 * working directory.
 *
 * That was the first thing to go wrong in practice. Run from the repo root and
 * it looked for `./.env`; run from `server/` and it looked somewhere else
 * again — and either way the failure read as a missing variable rather than as
 * a path it had never checked. A script whose behaviour depends on where you
 * happened to be standing is one nobody can be told how to run.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CANDIDATES = ['../.env', '../.env.local', '../../.env', '../../.env.local'];

function env(name) {
  if (process.env[name]) return process.env[name];

  for (const file of CANDIDATES) {
    try {
      const text = readFileSync(resolve(HERE, file), 'utf8');
      // Tolerates `export NAME=`, quotes, and trailing whitespace.
      const pattern = new RegExp(
        `^\\s*(?:export\\s+)?${name}\\s*=\\s*["']?([^"'\\r\\n]+)`,
        'm',
      );
      const match = text.match(pattern);
      if (match) return match[1].trim();
    } catch {
      // Absent is fine; the next candidate or the throw below handles it.
    }
  }

  throw new Error(
    `${name} is not set.` +
      `\n  Looked in: ${CANDIDATES.map((file) => resolve(HERE, file)).join(', ')}` +
      '\n  Fix: put KV_REST_API_URL and KV_REST_API_TOKEN in server/.env, or run' +
      '\n       npx vercel env pull server/.env --environment=production',
  );
}

const url = env('KV_REST_API_URL');
const token = env('KV_REST_API_TOKEN');

async function command(...args) {
  const path = args.map((arg) => encodeURIComponent(String(arg))).join('/');
  const response = await fetch(`${url}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(`${args[0]} failed: ${response.status} ${response.statusText}`);
  return (await response.json()).result;
}

const confirmed = process.argv.includes('--confirm');

const keys = [];
for (const pattern of PATTERNS) {
  const found = await command('keys', `${PREFIX}:${pattern}`);
  keys.push(...found);
}

if (!keys.length) {
  console.log('Nothing to delete — the ledger is already empty.');
  process.exit(0);
}

console.log(`${keys.length} key(s) in scope:`);
for (const key of keys.sort()) console.log(`  ${key}`);

if (!confirmed) {
  console.log('\nDry run. Re-run with --confirm to delete these.');
  process.exit(0);
}

/*
 * Deleted one at a time rather than in one variadic DEL. The command is
 * idempotent per key, so a connection that drops halfway leaves a partial
 * delete that re-running finishes — where a single failed batch leaves no
 * record of how far it got.
 */
let deleted = 0;
for (const key of keys) {
  await command('del', key);
  deleted += 1;
}

console.log(`\nDeleted ${deleted} key(s). The record starts again at zero.`);
console.log('Open trades are gone too: they were published under the old rules.');
