/**
 * Settles open trades until the book fits under `MAX_OPEN_TRADES` again.
 *
 * The engine refuses to open anything while the book is full, which is the cap
 * working as intended — but a book that filled before the cap existed never
 * drains on its own fast enough, and in the meantime nothing new is published.
 * This clears it.
 *
 *   node --import tsx scripts/unjam-trades.mts                    # dry run
 *   node --import tsx scripts/unjam-trades.mts --to-limit --confirm
 *   node --import tsx scripts/unjam-trades.mts --older-than 3 --confirm
 *
 * Dry run is the default and `--confirm` is spelled out, because this settles
 * real positions in the published record and there is no undo.
 *
 * ## Two ways to choose, and why age alone is not enough
 *
 * `--older-than <days>` closes anything past that age. It is the right tool
 * when the book is full of stale calls nobody is watching.
 *
 * It is also the tool that does nothing when every trade is young. The first
 * time this was needed, sixty-two trades were open and the oldest was 1.1 days
 * — a book built in a single day by an engine with no cap — so a three-day
 * threshold would have closed nothing and left the engine jammed. `--to-limit`
 * exists for that: oldest first, until the book fits.
 *
 * ## What it does to the record
 *
 * Nothing invented. Closing goes through `forceClose`, which uses the same
 * `close` and `record` the scan uses:
 *
 *   - a trade that never filled a rung closes as `expired` — it reached no
 *     level, so it is not a win or a loss and stays out of the win rate
 *   - a trade that did fill is graded on what it actually returned at the
 *     current market price, exactly as if the resolver had settled it
 *
 * Nobody is messaged. Announcing fifty closes would bury the channel; the
 * cards simply stop updating, and their keys are removed so nothing dangles.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Credentials before anything imports the store, since `env` is read at module
 * load. Resolved against this file rather than the working directory — the
 * reset script learned that lesson and this one inherits it.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
for (const candidate of ['../.env', '../.env.local', '../../.env']) {
  try {
    const text = readFileSync(resolve(HERE, candidate), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]*)/);
      if (match && !process.env[match[1]!]) process.env[match[1]!] = match[2]!.trim();
    }
    break;
  } catch {
    // Next candidate, or the store's own error if none of them exist.
  }
}

const { env } = await import('../src/config/env.js');
const { loadActive, forceClose } = await import('../src/services/trades/trades.service.js');
const { getAllTickers24h } = await import('../src/services/market.service.js');
const { deleteKeys, storeKey, storeBackend } = await import('../src/services/store/store.js');

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const toLimit = args.includes('--to-limit');
const olderThanIndex = args.indexOf('--older-than');
const olderThanDays = olderThanIndex >= 0 ? Number(args[olderThanIndex + 1]) : null;

if (storeBackend() !== 'redis') {
  console.error('No Redis credentials found. Put them in server/.env or export them.');
  process.exit(1);
}

const active = await loadActive();
const limit = env.maxOpenTrades;

console.log(`\n  ${active.length} open · limit ${limit}\n`);

if (!active.length) {
  console.log('  Nothing open. Nothing to do.');
  process.exit(0);
}

/** Oldest first: if the book has to lose trades, it loses the stalest. */
const byAge = [...active].sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt));
const ageDays = (trade: (typeof byAge)[number]): number =>
  (Date.now() - Date.parse(trade.openedAt)) / 86_400_000;

let victims: typeof byAge = [];

if (olderThanDays !== null && Number.isFinite(olderThanDays)) {
  victims = byAge.filter((trade) => ageDays(trade) > olderThanDays);
  console.log(`  Rule: older than ${olderThanDays} day(s) — ${victims.length} match`);
  if (!victims.length) {
    console.log(`  Oldest open trade is ${ageDays(byAge[0]!).toFixed(2)} days.`);
    console.log('  Nothing is that old. Use --to-limit to close oldest-first instead.');
  }
} else if (toLimit) {
  victims = byAge.slice(0, Math.max(0, active.length - limit));
  console.log(`  Rule: oldest first until ${limit} remain — ${victims.length} to close`);
} else {
  console.log('  Pick a rule:');
  console.log('    --to-limit            close oldest first until the book fits');
  console.log('    --older-than <days>   close anything past that age');
  process.exit(0);
}

if (!victims.length) process.exit(0);

const withFills = victims.filter((trade) => (trade.fills ?? []).length > 0);
console.log(
  `  ${victims.length} to settle · ${withFills.length} carry a filled rung and will be graded on it`,
);
console.log(`  ages ${ageDays(victims[0]!).toFixed(2)}d … ${ageDays(victims.at(-1)!).toFixed(2)}d\n`);

if (!confirm) {
  console.log('  Dry run. Re-run with --confirm to settle these.\n');
  process.exit(0);
}

const prices = await getAllTickers24h()
  .then((tickers) => new Map(tickers.map((ticker) => [ticker.symbol, ticker.lastPrice])))
  .catch(() => new Map<string, number>());

const { closed, remaining, skipped } = await forceClose(
  victims.map((trade) => trade.id),
  (trade) => prices.get(trade.symbol),
);

// The cards described trades that no longer exist.
if (closed.length) {
  await deleteKeys(closed.map((trade) => storeKey(`trades:cards:${trade.id}`)));
}

const tally = closed.reduce<Record<string, number>>((counts, trade) => {
  counts[trade.outcome] = (counts[trade.outcome] ?? 0) + 1;
  return counts;
}, {});

console.log(`  Settled ${closed.length}: ${JSON.stringify(tally)}`);
if (skipped.length) console.log(`  Skipped ${skipped.length} with no live quote — rerun to catch them.`);
console.log(`  ${remaining} open · limit ${limit}`);
console.log(
  remaining < limit
    ? '  The engine can publish again.\n'
    : '  Still at or above the limit — run again or raise MAX_OPEN_TRADES.\n',
);
