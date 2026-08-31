import { env } from '../../config/env.js';
import { getKlines, type Interval } from '../market.service.js';
import type { Signal, Strategy } from '../../types/domain.js';
import { getJson, setJson, storeKey } from '../store/store.js';
import { STRATEGIES, STRATEGY_PROFILES } from '../signal.engine.js';
import { realisedR } from './confidence.js';
import {
  anyTargetHit,
  buildLadder,
  pctAt,
  pendingTargets,
  remainingShare,
  weighted,
  type Fill,
  type Target,
} from './targets.js';

export type { Fill, Target } from './targets.js';

/**
 * Outcome tracking for the calls the bot publishes.
 *
 * A signal is only worth anything if somebody counts how often it was right, so
 * every alert opens a trade here and every scheduled run checks whether the open
 * ones reached their target or their stop.
 *
 * The record is deliberately conservative. Where the candles cannot say what
 * happened, the reading that flatters the engine least is the one taken.
 */
export interface ActiveTrade {
  id: string;
  symbol: string;
  base: string;
  strategy: Strategy;
  side: 'buy' | 'sell';
  entry: number;
  /** Moves to `entry` once the trade is halfway to target. */
  stopLoss: number;
  /**
   * Where the stop started.
   *
   * Kept because `stopLoss` is no longer immutable: without it, a trade that
   * moved to breakeven would look as though it had been opened with a
   * zero-risk stop, and the risk the call actually carried would be
   * unreconstructable from the record.
   */
  initialStopLoss: number;
  /**
   * The last rung of the ladder, kept as its own field.
   *
   * Every consumer that predates multi-TP reads this — the alert card, the
   * board, the resolvability check — and every one of them means "the price
   * this call is aiming at". That is still the last rung, so the field keeps
   * its meaning rather than being deleted and re-added under another name.
   */
  takeProfit: number;
  /**
   * The ladder, nearest rung first.
   *
   * Optional because the trades already open when this shipped have none, and
   * they have to resolve on the rules they were opened under. A trade cannot be
   * retrofitted with targets it was never published with — the reader was shown
   * one level and would be judged against three.
   */
  targets?: Target[];
  /** What has closed so far, in the order it closed. */
  fills?: Fill[];
  /**
   * Where this call was announced, so the announcement can be updated.
   *
   * One entry per chat that received it. Absent for a trade opened while
   * Telegram was unreachable, which is the case that matters: an edit needs a
   * message to edit, and a trade with no announcement simply has nothing to
   * keep in step.
   */
  messages?: { chatId: string; messageId: number }[];
  timeframe: string;
  openedAt: string;
  /** When the stop was moved to entry, if it has been. */
  breakevenAt?: string;
  /**
   * The confluence score the call was published with, 0-100.
   *
   * Optional because trades opened before this field existed do not carry it,
   * and the analytics that reads it says so rather than treating an absent
   * score as a zero — which would drag any correlation toward a number that
   * describes the migration rather than the strategy.
   */
  confidence?: number;
}

/**
 * `win` and `loss` are the only outcomes that move the win rate.
 *
 * `expired` is a call that never reached either level inside its horizon, and
 * `superseded` is one replaced by a reversal on the same pair. Counting either
 * as a loss would be as dishonest as counting it as a win — they are recorded
 * separately so the denominator stays meaningful and nothing is quietly dropped.
 *
 * `voided` is a call that could never have resolved: a target that is not a
 * price. Those existed — the engine could put a short's target below zero on a
 * violent microcap — and they are the one case that genuinely does poison the
 * record, because such a trade can still hit its stop. It can lose and it cannot
 * win. Leaving them to expire would have counted every one of them as a loss.
 *
 * `breakeven` is a trade that travelled halfway to target — moving its stop to
 * entry — and then came back to it. It costs nothing and gains nothing.
 *
 * That one deserves suspicion, because it flatters. Before the breakeven rule
 * existed, every one of these was a **loss**; now they leave the denominator
 * entirely, so the published win rate rises without the strategy having
 * improved at all. It is counted and reported separately for exactly that
 * reason: a rate quoted without its breakeven count is a better-looking number
 * about a smaller question.
 */
export type Outcome = 'win' | 'loss' | 'expired' | 'superseded' | 'voided' | 'breakeven';

export interface ClosedTrade extends ActiveTrade {
  outcome: Outcome;
  closedAt: string;
  /** Realised move in percent, signed in the direction of the trade. */
  resultPct: number;
}

export interface TradeStats {
  wins: number;
  losses: number;
  expired: number;
  superseded: number;
  voided: number;
  breakeven: number;
  byStrategy: Record<string, { wins: number; losses: number }>;
  /**
   * Net R over every decided trade, carried forward rather than recomputed.
   *
   * The detailed log holds the most recent closes and rolls the rest out,
   * taking the prices R is derived from with them — so a sum over the log
   * describes a window, not the record, and the window shrinks as the bot gets
   * busier. Two days, at the rate it currently closes trades. Accumulating at
   * close is the only way the figure keeps meaning what it says.
   *
   * `roiPct` is the same record as a share of a deposit: each trade's R times
   * the risk its setup calls for. Summed rather than compounded, so it does
   * not depend on the order the trades happened to close in.
   *
   * `settled` is what both cover, and it tracks wins + losses exactly once the
   * seed below has run.
   */
  sums: { r: number; roiPct: number; settled: number };
  updatedAt: string;
}

const ACTIVE_KEY = storeKey('trades:active');
const STATS_KEY = storeKey('trades:stats');
const HISTORY_KEY = storeKey('trades:history');

/**
 * How many closes the detailed log keeps.
 *
 * It was 100, which the record outgrew — and because every published figure
 * that needs per-trade data reads this log while the win rate read the lifetime
 * counters, the two started describing different sets of trades. A thousand is
 * roughly a month at the current rate and a few hundred kilobytes; the counters
 * remain the authority for anything older.
 */
const HISTORY_LIMIT = 1000;


const EMPTY_STATS: TradeStats = {
  wins: 0,
  losses: 0,
  expired: 0,
  superseded: 0,
  voided: 0,
  breakeven: 0,
  byStrategy: {},
  sums: { r: 0, roiPct: 0, settled: 0 },
  updatedAt: new Date(0).toISOString(),
};

export const INTERVAL: Record<Strategy, Interval> = { scalping: '5m', day: '1h', swing: '4h' };

/**
 * How long a call is given to resolve, roughly three times the duration the
 * alert advertises.
 *
 * Without this a trade that never reaches either level stays open forever: the
 * active list grows without bound, every run re-fetches candles for all of it,
 * and the win rate silently counts only the decisive calls — which is the most
 * flattering possible sample.
 */
export const MAX_LIFETIME_MS: Record<Strategy, number> = {
  scalping: 6 * 60 * 60_000,
  day: 36 * 60 * 60_000,
  swing: 10 * 24 * 60 * 60_000,
};

/** Bars fetched per resolve — must span the longest a trade can stay open. */
export const LOOKBACK: Record<Strategy, number> = {
  scalping: Math.ceil(MAX_LIFETIME_MS.scalping / (5 * 60_000)) + 5, // 77
  day: Math.ceil(MAX_LIFETIME_MS.day / (60 * 60_000)) + 5, // 41
  swing: Math.ceil(MAX_LIFETIME_MS.swing / (4 * 60 * 60_000)) + 5, // 65
};

export const winRate = (stats: TradeStats): number => {
  const decided = stats.wins + stats.losses;
  return decided ? Math.round((stats.wins / decided) * 100) : 0;
};

/**
 * What the record already decided was worth, before anything accumulated it.
 *
 * A loss is exactly one risk unit: it means the stop was hit at the price the
 * trade was opened against, and a stop that had moved would have closed the
 * trade as breakeven instead. A win is the ratio the engine targets, taken
 * from the profile rather than written here, so this cannot quietly disagree
 * with what the engine actually publishes.
 *
 * Approximate in one direction only. Every profile targets 1.5 today, but two
 * of them targeted 2.2 and 3 for the first day the bot ran, and nothing
 * records which of those early calls this is valuing. Those wins were worth
 * more than they are credited here, so the seed understates the record and
 * never flatters it — the safe direction for a figure nobody can re-derive.
 */
const seedSums = (stats: TradeStats): TradeStats['sums'] => {
  const perStrategy = STRATEGIES.map((strategy) => {
    const row = stats.byStrategy[strategy] ?? { wins: 0, losses: 0 };
    return {
      r: row.wins * STRATEGY_PROFILES[strategy].rewardRatio - row.losses,
      riskPct: STRATEGY_PROFILES[strategy].baseRiskPct,
    };
  });

  return {
    r: Number(perStrategy.reduce((sum, row) => sum + row.r, 0).toFixed(2)),
    roiPct: Number(perStrategy.reduce((sum, row) => sum + row.r * row.riskPct, 0).toFixed(2)),
    settled: stats.wins + stats.losses,
  };
};

export const loadStats = async (): Promise<TradeStats> => {
  const stats = await getJson<TradeStats>(STATS_KEY, EMPTY_STATS);
  /*
   * Seeded when a field is missing, not merely when `sums` is.
   *
   * `roiPct` was added after `sums` had already been written, so a record with
   * the older shape passed the presence check and served an undefined figure —
   * which JSON drops silently, so the field simply vanished from the response
   * rather than failing anywhere a test would see. Checking the numbers
   * themselves is what makes the next field added here safe.
   */
  const complete =
    typeof stats.sums?.r === 'number' &&
    typeof stats.sums?.roiPct === 'number' &&
    typeof stats.sums?.settled === 'number';

  return complete ? stats : { ...stats, sums: seedSums(stats) };
};
export const loadActive = (): Promise<ActiveTrade[]> => getJson<ActiveTrade[]>(ACTIVE_KEY, []);

const tradeKey = (trade: { symbol: string; strategy: Strategy }): string =>
  `${trade.symbol}:${trade.strategy}`;

/**
 * Closes a trade, settling whatever is still open at one price.
 *
 * The result is position-weighted, which is the change multi-TP forces. A
 * trade that took half off at 1R and gave the rest back at entry did not
 * return what either of those prices says on its own; it returned the blend,
 * and the blend is what the record has to carry or every figure derived from
 * it describes a position nobody held.
 *
 * A trade with no ladder settles the whole position at `exit`, which is the
 * old behaviour exactly — the trades already open when this shipped resolve on
 * the rules they were published under.
 */
const close = (
  trade: ActiveTrade,
  outcome: Outcome,
  exit: number,
  /*
   * How the remainder closed, which is not the same question as how the trade
   * turned out. A call that filled TP1 and came back to entry is a win whose
   * remainder closed at breakeven; labelling that remainder a target fill
   * would credit it with reaching a level it never reached. The caller knows
   * which it was, so the caller says.
   */
  closedBy?: Fill['reason'],
): ClosedTrade => {
  const at = new Date().toISOString();
  const reason: Fill['reason'] =
    closedBy ??
    (outcome === 'win'
      ? 'target'
      : outcome === 'breakeven'
        ? 'breakeven'
        : outcome === 'loss'
          ? 'stop'
          : 'expiry');

  const open = remainingShare(trade.fills ?? []);
  const fills: Fill[] = [
    ...(trade.fills ?? []),
    ...(open > 0 ? [{ level: 0, price: exit, share: open, at, reason }] : []),
  ];

  return {
    ...trade,
    fills,
    outcome,
    closedAt: at,
    resultPct: Number(weighted(fills, (price) => pctAt(trade.side, trade.entry, price)).toFixed(2)),
  };
};

/**
 * Records a call as an open trade.
 *
 * A reversal on the same pair **supersedes** the standing trade rather than
 * being dropped. Refusing the new one left the channel announcing SELL while
 * the ledger still tracked a BUY — two records of the same pair disagreeing,
 * with the stale one later resolving against a call nobody was following.
 */
/**
 * Why a call was not opened.
 *
 * `standing` is not a failure: the same call is already being tracked, and
 * opening a second would put two positions on one setup. It reads as one only
 * because both come back without a trade — which is exactly the ambiguity that
 * had the webhook answering "the ledger refused these levels" to somebody whose
 * levels were fine and whose trade was already running.
 */
export type RefusalReason = 'wait' | 'levels' | 'ladder' | 'standing';

export async function openTrade(
  signal: Signal,
): Promise<{
  opened: boolean;
  trade?: ActiveTrade;
  superseded?: ClosedTrade;
  reason?: RefusalReason;
}> {
  if (signal.verdict === 'wait') return { opened: false, reason: 'wait' };

  /*
   * The engine refuses these upstream now, but the ledger checks too: a trade
   * whose target is not a price is one the record can only ever count against
   * itself, and that is too costly a thing to guard in exactly one place.
   */
  if (
    !(signal.entry > 0 && signal.stopLoss > 0 && signal.takeProfit > 0) ||
    (signal.verdict === 'buy'
      ? !(signal.takeProfit > signal.entry && signal.stopLoss < signal.entry)
      : !(signal.takeProfit < signal.entry && signal.stopLoss > signal.entry))
  ) {
    console.error(`[trades] refused unusable levels for ${signal.symbol}:`, {
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
    });
    return { opened: false, reason: 'levels' };
  }

  const active = await loadActive();
  const key = tradeKey(signal);
  const existing = active.find((trade) => tradeKey(trade) === key);

  // The identical call standing already — nothing to record.
  if (existing && existing.side === signal.verdict) return { opened: false, reason: 'standing' };

  /*
   * The ladder is built here, not in the engine, and from the published levels.
   *
   * Built here because it is a property of how the trade is managed rather
   * than of how the setup was found — the engine's job ends at entry, stop and
   * a reward ratio. Built from the levels rather than recomputed from the ATR
   * so the rungs are exact multiples of the risk the reader was actually
   * shown, not of a risk recalculated a moment later against a moved market.
   *
   * An empty ladder means every rung fell outside the sane band, which the
   * engine's own tradability check should already have caught. Refused rather
   * than published with one improvised target: a call whose first rung is
   * absurd is not a call worth making.
   */
  const targets = buildLadder(signal.strategy, signal.verdict, signal.entry, signal.stopLoss);
  if (!targets.length) {
    console.error(`[trades] no usable target ladder for ${signal.symbol}`, {
      entry: signal.entry,
      stopLoss: signal.stopLoss,
    });
    return { opened: false, reason: 'ladder' };
  }

  const superseded = existing ? close(existing, 'superseded', signal.entry) : undefined;
  const remaining = existing ? active.filter((trade) => trade.id !== existing.id) : active;

  const opened: ActiveTrade = {
    id: `${key}:${Date.now()}`,
    symbol: signal.symbol,
    base: signal.base,
    strategy: signal.strategy,
    side: signal.verdict,
    entry: signal.entry,
    stopLoss: signal.stopLoss,
    initialStopLoss: signal.stopLoss,
    // The last rung is the target, so everything that reads this still works.
    takeProfit: targets[targets.length - 1]!.price,
    targets,
    fills: [],
    confidence: signal.confidence,
    timeframe: signal.timeframe,
    openedAt: new Date().toISOString(),
  };

  remaining.push(opened);

  await setJson(ACTIVE_KEY, remaining);
  if (superseded) await record([superseded]);

  return { opened: true, trade: opened, ...(superseded ? { superseded } : {}) };
}

/**
 * Decides whether a trade finished, by replaying the candles since it opened.
 *
 * Only bars that **opened at or after** entry count. The previous version
 * allowed a minute of slack, which on 5m bars could pull in the bar already
 * running when the call was made and credit a level touched before it existed;
 * on 1h and 4h bars the same slack was meaningless. Excluding the entry bar
 * entirely costs the rare same-bar resolution and buys a record that cannot
 * count a move that happened first.
 *
 * When one bar touched both levels the stop wins: intrabar order is unknowable
 * from candles, and reading it the other way would flatter the engine.
 */
/**
 * Whether a trade's levels are prices, and on the right sides of entry.
 *
 * Cheap, and it has already earned its keep: calls were published with a target
 * below zero, which the exchange can never reach, so they could only ever be
 * stopped out.
 *
 * Judged on the stop the call was **published with**, not the current one. Once
 * a stop moves to breakeven it sits exactly at entry, which this check read as
 * malformed — so every protected trade was silently voided on the run after it
 * was protected. The published levels are what "is this a real trade" asks
 * about; where the stop has since been dragged to is a separate question.
 */
function resolvable(trade: ActiveTrade): boolean {
  // Records written before the stop could move carry no initial level.
  const opened = trade.initialStopLoss ?? trade.stopLoss;

  if (!(trade.entry > 0) || !(opened > 0) || !(trade.takeProfit > 0)) return false;
  if (!(trade.stopLoss > 0)) return false;

  return trade.side === 'buy'
    ? trade.takeProfit > trade.entry && opened < trade.entry
    : trade.takeProfit < trade.entry && opened > trade.entry;
}

/**
 * The point at which the stop is pulled up to entry, as a fraction of the
 * distance from entry to target.
 *
 * Read from `BREAKEVEN_THRESHOLD` at call time rather than captured in a module
 * constant, so a deployment can move it without a rebuild and a test can set it
 * per case.
 */
const breakevenFraction = (): number => env.breakevenThreshold;

export interface Resolution {
  trade: ActiveTrade;
  closed?: ClosedTrade;
  /** Set on the run where the stop moved, so it is announced exactly once. */
  movedToBreakeven?: boolean;
  /**
   * Rungs that filled during this run, in order.
   *
   * Carried out of the resolver rather than derived by comparing before and
   * after, so the announcement cannot drift from what actually happened. Empty
   * on every run where nothing filled, which is almost all of them.
   */
  filled?: Fill[];
}

/**
 * Replays the candles since entry, bar by bar, in order.
 *
 * The order matters now in a way it did not before. This used to ask whether
 * *any* bar touched the stop and whether *any* bar touched the target, which is
 * order-blind — fine while the stop never moved. With a stop that is pulled to
 * entry halfway to target, "did it hit the stop" has no answer until you know
 * *which* stop was in force at the time, and that depends on what happened
 * earlier in the sequence.
 *
 * Within a single bar the order is still unknowable, so the stop in force at
 * the *start* of the bar is the one that applies: a bar that both reached the
 * halfway mark and traded back through the original stop is read as the stop,
 * because that is the reading that flatters least.
 */
async function resolve(trade: ActiveTrade, now: number): Promise<Resolution> {
  const age = now - Date.parse(trade.openedAt);

  // Voided before any candle is fetched: there is nothing this tape could say.
  if (!resolvable(trade)) return { trade, closed: close(trade, 'voided', trade.entry) };

  const set = await getKlines(trade.symbol, INTERVAL[trade.strategy], LOOKBACK[trade.strategy]).catch(
    () => undefined,
  );

  const long = trade.side === 'buy';
  // Signed so a long and a short read identically from here on.
  const trigger = trade.entry + (trade.takeProfit - trade.entry) * breakevenFraction();

  /*
   * Two rulebooks, and which one applies is decided by the trade, not by the
   * deployment.
   *
   * A laddered call protects itself when TP1 fills — a concrete level the
   * reader was shown. A call published before the ladder existed has only the
   * old fractional trigger, and it has to keep it: those trades are open right
   * now, their readers were shown one target, and resolving them under rules
   * they were never published under would be judging them for something else.
   */
  const ladder = trade.targets ?? [];
  const laddered = ladder.length > 0;

  let stop = trade.stopLoss;
  let atBreakeven = Boolean(trade.breakevenAt);
  let moved = false;
  let fills: Fill[] = [...(trade.fills ?? [])];
  const filled: Fill[] = [];

  /*
   * The best the trade ever managed, as a fraction of the distance to target.
   * Measured across the whole walk rather than from the last price, because a
   * trade that ran most of the way and came back is not stagnant — it is a
   * trade that was working and stopped working, which is a different thing.
   */
  let bestProgress = 0;

  if (set) {
    const openedAt = Date.parse(trade.openedAt);

    for (const candle of set.candles) {
      if (candle.openTime < openedAt) continue;

      const hitStop = long ? candle.low <= stop : candle.high >= stop;

      if (hitStop) {
        /*
         * A stop sitting at entry is not a loss — nothing was lost. Recording it
         * as one would be as wrong as recording it as a win, so it gets its own
         * outcome and stays out of the rate.
         *
         * Unless a rung already filled. Then the call was right, whatever the
         * remainder did on the way back: half the position was booked at a
         * profit and cannot be un-booked by what happened after it.
         */
        const settled = { ...trade, stopLoss: stop, fills };
        const outcome: Outcome = anyTargetHit(fills) ? 'win' : atBreakeven ? 'breakeven' : 'loss';
        return {
          trade: settled,
          closed: close(settled, outcome, stop, atBreakeven ? 'breakeven' : 'stop'),
          ...(moved ? { movedToBreakeven: true } : {}),
          ...(filled.length ? { filled } : {}),
        };
      }

      /*
       * Rungs, nearest first, and a single bar can sweep more than one.
       *
       * Ordered, so the first rung that did not fill ends the scan: nothing
       * further out can have filled on a bar that never reached this one.
       * Checked after the stop, so a bar that touched both is read as the stop
       * — intrabar order is unknowable from candles, and that is the reading
       * that flatters least.
       */
      for (const target of pendingTargets(ladder, fills)) {
        const reached = long ? candle.high >= target.price : candle.low <= target.price;
        if (!reached) break;

        const fill: Fill = {
          level: target.level,
          price: target.price,
          share: target.share,
          at: new Date(candle.openTime).toISOString(),
          reason: 'target',
        };
        fills = [...fills, fill];
        filled.push(fill);

        // The first rung pays for the trade, so the trade stops being able to lose.
        if (!atBreakeven) {
          stop = trade.entry;
          atBreakeven = true;
          moved = true;
        }
      }

      if (laddered && remainingShare(fills) <= 0) {
        const settled = { ...trade, stopLoss: stop, fills };
        return {
          trade: settled,
          closed: close(settled, 'win', trade.takeProfit),
          ...(moved ? { movedToBreakeven: true } : {}),
          ...(filled.length ? { filled } : {}),
        };
      }

      // The pre-ladder path: one target, all of it, exactly as before.
      if (!laddered && (long ? candle.high >= trade.takeProfit : candle.low <= trade.takeProfit)) {
        const settled = { ...trade, stopLoss: stop };
        return {
          trade: settled,
          closed: close(settled, 'win', trade.takeProfit),
          ...(moved ? { movedToBreakeven: true } : {}),
        };
      }

      const reach = long ? candle.high : candle.low;
      const span = trade.takeProfit - trade.entry;
      if (span !== 0) bestProgress = Math.max(bestProgress, (reach - trade.entry) / span);

      /*
       * The old trigger, for trades that have no rung to fill. Checked after
       * the levels, so a bar cannot both save and settle itself.
       */
      if (!laddered && !atBreakeven && (long ? candle.high >= trigger : candle.low <= trigger)) {
        stop = trade.entry;
        atBreakeven = true;
        moved = true;
      }
    }
  }

  const updated: ActiveTrade = {
    ...trade,
    stopLoss: stop,
    ...(fills.length ? { fills } : {}),
    ...(atBreakeven && !trade.breakevenAt ? { breakevenAt: new Date().toISOString() } : {}),
  };

  /*
   * Timed out, or going nowhere.
   *
   * The second is the newer of the two: a call that has spent `stagnantAfter` of
   * its horizon without covering `stagnantProgress` of the distance to target is
   * holding a slot it is not using. Closing it early frees the slot and stops
   * the board showing a position the reader abandoned hours ago.
   *
   * Both close at the last price we can see rather than at a level, because
   * neither level was reached — and both stay out of the win rate for the same
   * reason, so this cannot flatter the record.
   */
  const lifetime = MAX_LIFETIME_MS[trade.strategy];
  const stagnant =
    !atBreakeven && age > lifetime * env.stagnantAfterFraction && bestProgress < env.stagnantProgress;

  if (age > lifetime || stagnant) {
    const last = set?.candles[set.candles.length - 1]?.close ?? trade.entry;
    /*
     * A laddered call that ran out of time with a rung already booked is a
     * win, not an expiry. It reached a level it published and paid out there;
     * the remainder simply stopped being interesting.
     */
    const outcome: Outcome = anyTargetHit(fills) ? 'win' : 'expired';
    return {
      trade: updated,
      closed: close(updated, outcome, last, 'expiry'),
      ...(moved ? { movedToBreakeven: true } : {}),
      ...(filled.length ? { filled } : {}),
    };
  }

  return {
    trade: updated,
    ...(moved ? { movedToBreakeven: true } : {}),
    ...(filled.length ? { filled } : {}),
  };
}

/** Folds closed trades into the running statistics and the history log. */
async function record(closed: ClosedTrade[]): Promise<TradeStats> {
  const stats = await loadStats();

  const next: TradeStats = {
    wins: stats.wins + closed.filter((trade) => trade.outcome === 'win').length,
    losses: stats.losses + closed.filter((trade) => trade.outcome === 'loss').length,
    expired: stats.expired + closed.filter((trade) => trade.outcome === 'expired').length,
    superseded: stats.superseded + closed.filter((trade) => trade.outcome === 'superseded').length,
    voided: stats.voided + closed.filter((trade) => trade.outcome === 'voided').length,
    breakeven: stats.breakeven + closed.filter((trade) => trade.outcome === 'breakeven').length,
    byStrategy: { ...stats.byStrategy },
    /*
     * Summed from the trade itself, not from the profile. A stop that trailed
     * before it was hit risked less than the one the call was published with,
     * and `realisedR` reads the levels to see that; the seed above cannot,
     * which is the whole difference between the two.
     */
    sums: {
      r: Number(
        (stats.sums.r + closed.reduce((sum, trade) => sum + realisedR(trade), 0)).toFixed(2),
      ),
      roiPct: Number(
        (
          stats.sums.roiPct +
          closed.reduce(
            (sum, trade) => sum + realisedR(trade) * STRATEGY_PROFILES[trade.strategy].baseRiskPct,
            0,
          )
        ).toFixed(2),
      ),
      settled:
        stats.sums.settled +
        closed.filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss').length,
    },
    updatedAt: new Date().toISOString(),
  };

  for (const trade of closed) {
    if (trade.outcome !== 'win' && trade.outcome !== 'loss') continue;
    const bucket = next.byStrategy[trade.strategy] ?? { wins: 0, losses: 0 };
    if (trade.outcome === 'win') bucket.wins += 1;
    else bucket.losses += 1;
    next.byStrategy[trade.strategy] = bucket;
  }

  // A bounded history makes the record auditable rather than just a percentage.
  const history = await getJson<ClosedTrade[]>(HISTORY_KEY, []);
  await Promise.all([setJson(STATS_KEY, next), setJson(HISTORY_KEY, [...closed, ...history].slice(0, HISTORY_LIMIT))]);

  return next;
}

/**
 * Checks every open trade and settles the ones that reached a level or ran out
 * of time. Returns what closed, so the caller can announce it.
 */
export interface Progress {
  trade: ActiveTrade;
  /** The rungs that filled on this run. Never empty. */
  filled: Fill[];
}

export async function evaluateTrades(now = Date.now()): Promise<{
  closed: ClosedTrade[];
  /** Trades whose stop moved to entry on this run — announced once. */
  movedToBreakeven: ActiveTrade[];
  /**
   * Trades still running that booked a rung on this run.
   *
   * Separate from `closed` because the reader's position changed without the
   * trade ending, which is the state multi-TP introduces and the one the old
   * shape had no way to express.
   */
  progressed: Progress[];
  stats: TradeStats;
  open: number;
}> {
  const active = await loadActive();
  if (!active.length) {
    return { closed: [], movedToBreakeven: [], progressed: [], stats: await loadStats(), open: 0 };
  }

  const resolutions = await Promise.all(active.map((trade) => resolve(trade, now)));

  const closed = resolutions
    .map((resolution) => resolution.closed)
    .filter((trade): trade is ClosedTrade => Boolean(trade));

  const remaining = resolutions.filter((resolution) => !resolution.closed).map((resolution) => resolution.trade);

  const movedToBreakeven = resolutions
    .filter((resolution) => resolution.movedToBreakeven)
    .map((resolution) => resolution.trade);

  const progressed = resolutions
    .filter((resolution) => !resolution.closed && resolution.filled?.length)
    .map((resolution) => ({ trade: resolution.trade, filled: resolution.filled! }));

  /*
   * Written whenever anything changed, and a booked rung is a change.
   *
   * `progressed` belongs in this condition for the same reason the moved stop
   * does: a fill that is not persisted is re-detected on the next run, and the
   * reader is told a second time that TP2 was reached. The failure is silent
   * and repeats forever, which is the worst shape a bug can take in a notifier.
   */
  if (closed.length || movedToBreakeven.length || progressed.length) {
    await setJson(ACTIVE_KEY, remaining);
  }

  const stats = closed.length ? await record(closed) : await loadStats();

  return { closed, movedToBreakeven, progressed, stats, open: remaining.length };
}

export async function tradesStatus() {
  const [active, stats] = await Promise.all([loadActive(), loadStats()]);
  return {
    open: active.length,
    wins: stats.wins,
    losses: stats.losses,
    expired: stats.expired,
    superseded: stats.superseded,
    voided: stats.voided,
    breakeven: stats.breakeven,
    winRate: winRate(stats),
    byStrategy: stats.byStrategy,
  };
}

export const loadHistory = (): Promise<ClosedTrade[]> => getJson<ClosedTrade[]>(HISTORY_KEY, []);
