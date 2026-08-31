import { deleteKeys, listKeys, storeKey } from '../store/store.js';

/**
 * Wipes the trading record, for a clean slate.
 *
 * Written for the spot-to-perpetuals cut-over: every open trade was opened
 * against spot prices with spot levels, and every win and loss on the record was
 * earned on a different instrument. Carrying that history into a futures release
 * would make the published win rate a claim about a market the bot no longer
 * trades.
 *
 * Two scopes, and the narrow one is the default on purpose. Wiping the ledger is
 * recoverable — the next scan repopulates it within minutes. Wiping the roster
 * is not: every subscriber would have to be asked to press start again, and
 * nobody would know they had been dropped.
 *
 * `all` returns the deployment to the state of a fresh deploy, which includes
 * re-seeding the owner from `TELEGRAM_CHAT_ID`. So it leaves exactly one
 * recipient rather than none — the alternative is a bot that scans, publishes
 * and tells nobody.
 */
export type ResetScope = 'ledger' | 'all';

/** The trading record: trades, statistics, and the alert-dedup state. */
const LEDGER_PATTERNS = [
  'trades:active',
  'trades:stats',
  'trades:history',
  /*
   * The published cards, one key per trade.
   *
   * Nothing else deletes these until the trade they belong to closes, so a
   * reset that left them would strand one key per open call — and the next
   * trade to reuse an id would edit a message about a trade that no longer
   * exists.
   */
  'trades:cards:*',
  // Derived from the ledger: kept, it would re-report a day that was wiped.
  'telegram:daily-report',
  'alerts:last',
  /*
   * The derived read of the ledger, and it was missed the first time.
   *
   * `/stats` came back to zero the moment `trades:stats` went, because it reads
   * that key directly. `/stats_deep` did not: it reads this snapshot, which the
   * cron refreshes on its own schedule, so it went on quoting a 21% win rate
   * over 75 trades that no longer existed. Anything computed *from* the ledger
   * has to go with it, or the reset is only half a reset.
   */
  'analytics:snapshot',
  'telegram:delivery',
  'radar:cursor',
  'cron:last',
  // Cheap to rebuild — one request — and an operator resetting the record
  // almost certainly wants the board re-ranked rather than replayed.
  'radar:universe*',
];

/** Everything about the people receiving messages. */
const ROSTER_PATTERNS = [
  'telegram:subscribers',
  'telegram:owner-seeded',
  'telegram:profile:*',
  'telegram:prefs:*',
  'telegram:mute:*',
];

export interface ResetResult {
  scope: ResetScope;
  deleted: number;
  keys: string[];
  /** Named so an operator can see what was spared, not only what was removed. */
  kept: string[];
}

export async function resetStore(scope: ResetScope): Promise<ResetResult> {
  const patterns = scope === 'all' ? [...LEDGER_PATTERNS, ...ROSTER_PATTERNS] : LEDGER_PATTERNS;

  const found = await Promise.all(
    patterns.map(async (pattern) =>
      pattern.includes('*') ? listKeys(storeKey(pattern)) : [storeKey(pattern)],
    ),
  );

  const keys = [...new Set(found.flat())];
  const deleted = await deleteKeys(keys);

  return {
    scope,
    deleted,
    keys: keys.map((key) => key.replace(/^[^:]+:/, '')),
    kept: scope === 'all' ? [] : [...ROSTER_PATTERNS],
  };
}
