import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { round } from '../utils/indicators.js';
import { ASSET_GROUPS } from '../data/assets.js';
import { calendarStatus, getUpcomingEvents, getHeadlineEvent } from '../services/calendar.service.js';
import { getNews, newsStatus } from '../services/news/news.service.js';
import { getKlines, getTickers, upstreamStatus, type Interval } from '../services/market.service.js';
import { getInsights, getMarketContext, invalidateInsights } from '../services/insight.service.js';
import { getSignals, isStrategy, STRATEGY_PROFILES } from '../services/signal.engine.js';
import {
  alertsStatus,
  notifyBreakeven,
  notifyProgress,
  publishDailyReport,
  notifyClosed,
  notifySignals,
  notifyWatches,
  sendTestAlert,
} from '../services/telegram/alerts.service.js';
import { botStatus, handleUpdate, type TelegramUpdate } from '../services/telegram/webhook.service.js';
import { getActiveSignals } from '../services/trades/active.service.js';
import { resetStore, type ResetScope } from '../services/admin/reset.service.js';
import { webhooks } from './webhooks.js';
import { maybePublishDailyReport } from '../services/telegram/daily-report.js';
import { analyticsForReader, formatAnalytics, refreshSnapshot } from '../services/admin/analytics.service.js';
import {
  isSelectableSymbol,
  nextBatch,
  radarStatus,
  selectableAssets,
} from '../services/radar/universe.service.js';
import { telegramStatus } from '../services/telegram/telegram.client.js';
import { acquireLock, getJson, releaseLock, setJson, storeKey, storeStatus } from '../services/store/store.js';
import { evaluateTrades, loadHistory, loadStats, tradesStatus, winRate } from '../services/trades/trades.service.js';
import { realisedR } from '../services/trades/confidence.js';

/** Where the scheduled run records that it happened. */
const CRON_KEY = storeKey('cron:last');
import type { Locale, Signal } from '../types/domain.js';

export const api = Router();

/*
 * Inbound alerts from outside the engine, in their own file.
 *
 * Mounted here rather than on the app so it inherits the dual `/api` and `/`
 * mounting: behind the platform rewrite the prefix is already consumed, and a
 * webhook URL that works locally and 404s in production is the worst kind of
 * thing to hand to a third party that logs failures somewhere you do not see.
 */
api.use('/webhooks', webhooks);

/** Wraps an async handler so rejections reach the error middleware. */
const route =
  (handler: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: (error?: unknown) => void) => {
    handler(req, res).catch(next);
  };

const LOCALES: Locale[] = ['en', 'uk'];

/** `?lang=uk` — only ever used to pick the language the LLM writes in. */
const parseLocale = (req: Request): Locale => {
  const raw = typeof req.query.lang === 'string' ? req.query.lang.slice(0, 2).toLowerCase() : '';
  return (LOCALES as string[]).includes(raw) ? (raw as Locale) : 'en';
};

/**
 * `?symbols=BTCUSDT,ETHUSDT` — unknown tickers are dropped rather than passed
 * upstream, and the list is capped because each symbol costs one kline fetch.
 */
const parseSymbols = async (req: Request): Promise<string[] | undefined> => {
  const raw = req.query.symbols;
  if (typeof raw !== 'string' || !raw.trim()) return undefined;

  const requested = raw.split(',').map((symbol) => symbol.trim().toUpperCase());
  /*
   * Validated against the curated catalogue *and* the radar. The dashboard can
   * now select a pair the scan found, and rejecting it here would have made
   * those coins un-chartable on the very site that announced them — while still
   * refusing anything the exchange does not list.
   */
  const checked = await Promise.all(requested.map(async (symbol) => [symbol, await isSelectableSymbol(symbol)] as const));

  const symbols = checked
    .filter(([, allowed]) => allowed)
    .map(([symbol]) => symbol)
    .slice(0, env.maxSymbolsPerRequest);
  /*
   * `undefined`, never an empty array: the caller reads this as "no preference"
   * and falls back to the default watchlist. Returning `[]` would ask the
   * services for nothing and hand the dashboard an empty grid.
   */
  return symbols.length ? symbols : undefined;
};

api.get(
  '/health',
  route(async (_req, res) => {
    res.json({
    status: 'ok',
    market: upstreamStatus(),
    news: newsStatus(),
    calendar: calendarStatus(),
    telegram: { ...(await telegramStatus()), ...alertsStatus() },
    store: storeStatus(),
    marketTimeoutMs: env.marketTimeoutMs,
    maxSymbolsPerRequest: env.maxSymbolsPerRequest,
    symbols: env.symbols,
    /** What the dashboard may select: the curated list plus the radar's pairs. */
    selectable: (await selectableAssets()).length,
    locales: LOCALES,
      radar: await radarStatus(),
      bot: await botStatus(),
      trades: await tradesStatus(),
      cron: await getJson<{ runs: number; lastRunAt?: string }>(CRON_KEY, { runs: 0 }),
      time: new Date().toISOString(),
    });
  }),
);

/** The tradable universe the dashboard's asset switcher is built from. */
api.get(
  '/assets',
  route(async (_req, res) => {
    res.json({
      assets: await selectableAssets(),
      groups: ASSET_GROUPS,
      defaults: env.symbols,
      maxPerRequest: env.maxSymbolsPerRequest,
    });
  }),
);

api.get(
  '/market/tickers',
  route(async (req, res) => {
    res.json({ tickers: await getTickers((await parseSymbols(req)) ?? [...env.symbols]) });
  }),
);

api.get('/strategies', (_req, res) => {
  res.json({
    strategies: Object.values(STRATEGY_PROFILES).map(({ strategy, label, timeframe, rewardRatio, stopAtr }) => ({
      strategy,
      label,
      timeframe,
      rewardRatio,
      stopAtr,
    })),
  });
});

api.get(
  '/signals',
  route(async (req, res) => {
    const raw = typeof req.query.strategy === 'string' ? req.query.strategy : '';
    if (raw && !isStrategy(raw)) {
      res.status(400).json({ error: `Unknown strategy "${raw}"` });
      return;
    }
    const strategy = isStrategy(raw) ? raw : undefined;
    res.json({ signals: await getSignals(strategy, (await parseSymbols(req)) ?? [...env.symbols]) });
  }),
);

api.get(
  '/events',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 8);
    // Low-impact prints are hidden unless asked for; see calendar.service.ts.
    const includeLow = req.query.includeLow === 'true';

    const [page, headline] = await Promise.all([
      getUpcomingEvents({ limit: Number.isFinite(limit) ? limit : 8, includeLow }),
      getHeadlineEvent(),
    ]);

    // `headline` is absent when the feed's week has run out — the dashboard
    // renders that as "nothing scheduled" instead of an empty countdown.
    res.json({ events: page.events, counts: page.counts, ...(headline ? { headline } : {}) });
  }),
);

api.get(
  '/news',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 8);
    res.json({ news: await getNews(Number.isFinite(limit) ? limit : 8) });
  }),
);

api.get(
  '/insights',
  route(async (req, res) => {
    const limit = Number(req.query.limit ?? 6);
    res.json({
      insights: await getInsights(Number.isFinite(limit) ? limit : 6, parseLocale(req)),
      context: await getMarketContext(),
    });
  }),
);

/** Forces a fresh pass through the LLM layer (handy while tuning prompts). */
api.post(
  '/insights/refresh',
  route(async (req, res) => {
    invalidateInsights();
    res.json({ insights: await getInsights(6, parseLocale(req)), context: await getMarketContext() });
  }),
);

/**
 * The autonomous run.
 *
 * Everything the bot needs to work without a visitor: recompute every tracked
 * strategy, alert on calls that just confirmed, then check whether any open
 * trade reached its target or its stop and announce the ones that did.
 *
 * Meant to be called by an external scheduler every few minutes. It is
 * deliberately idempotent — running it twice in a row sends nothing the second
 * time, because the alert guards and the trade ledger both live in the store.
 */
/**
 * The end-of-day summary, on its own trigger.
 *
 * Exists so a scheduler can be pointed at 23:59 UTC directly, but the scan also
 * calls the same function every five minutes — so the report goes out whether
 * or not anybody sets this up, and setting it up cannot produce two.
 * Idempotence lives in the service, not in the schedule.
 */
api.all(
  '/cron/daily-report',
  route(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const provided = bearer || (typeof req.query.secret === 'string' ? req.query.secret : '');

    if (!env.cronSecret || provided !== env.cronSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const result = await maybePublishDailyReport(publishDailyReport);
    res.json({ ok: true, ...result });
  }),
);

api.all(
  '/cron/signals',
  route(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const provided = bearer || (typeof req.query.secret === 'string' ? req.query.secret : '');

    if (!env.cronSecret || provided !== env.cronSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    /*
     * One run at a time. Two overlapping runs would both read the trade ledger,
     * both write it, and the second would erase the first — losing a settled
     * trade along with its win or loss.
     */
    const lock = storeKey('cron:lock');
    if (!(await acquireLock(lock, 120))) {
      res.json({ ok: true, skipped: 'another run is in progress' });
      return;
    }

    const startedAt = Date.now();
    const strategies = env.cronStrategies.filter(isStrategy);
    const headline = await getHeadlineEvent();

    /*
     * The scan is a global radar, not a mirror of somebody's dashboard. It takes
     * the next slice of the volume-ranked exchange listing and advances a cursor,
     * so consecutive runs sweep the whole board instead of re-checking the same
     * handful of coins until the per-pair cooldown silences all of them.
     */
    const batch = env.radarEnabled
      ? await nextBatch()
      : { symbols: [...env.symbols], offset: 0, universeSize: env.symbols.length, runsPerSweep: 1 };

    const scanned = batch.symbols.length ? batch.symbols : [...env.symbols];

    // Sequential across strategies on purpose: every strategy in parallel over a
    // whole batch is exactly the burst the exchange rate limits.
    const evaluated: Record<string, number> = {};
    const board: Signal[] = [];
    for (const strategy of strategies) {
      const signals = await getSignals(strategy, scanned);
      evaluated[strategy] = signals.length;
      board.push(...signals);
    }

    /*
     * Alerting happens once over the whole board rather than once per strategy.
     * Per-strategy calls made the per-run cap a per-strategy cap — three times
     * the messages intended — and left the strategies ranking their calls in
     * isolation, so a marginal scalp could go out ahead of a far stronger swing.
     */
    const alerts = await notifySignals(board, headline);

    /*
     * Watches are answered from the same board, after the broadcast.
     *
     * After, so somebody who both subscribes to a strategy and watched one of
     * its setups gets the ordinary call first and the "you asked about this"
     * note second — which is the order that reads. Failures here are counted,
     * never thrown: a scan that alerted forty people must not be marked failed
     * because one watch could not be delivered.
     */
    const watches = await notifyWatches(board, headline);

    const { closed, movedToBreakeven, progressed, stats, open } = await evaluateTrades();
    /*
     * Cards first. A rung booked and a trade settled are both news about a
     * message the reader already has, so the card is brought up to date before
     * anything decides whether a separate message is still worth sending.
     */
    const updated = await notifyProgress(progressed, closed);
    // Announced before the closes, so a stop that moved is known before it fills.
    const protectedCount = await notifyBreakeven(movedToBreakeven);
    const announced = await notifyClosed(closed, stats);

    /*
     * Checked on every run, published at most once a day. Riding the scan means
     * the report cannot quietly stop while the bot is still alerting — there is
     * no second schedule to fail on its own.
     */
    const report = await maybePublishDailyReport(publishDailyReport);

    /*
     * Recomputed when something settled, and only then. `/stats_deep` is open to
     * every subscriber now, so the replay cost belongs on the schedule rather
     * than on whoever taps the button.
     */
    if (closed.length) await refreshSnapshot(env.breakevenThreshold).catch(() => undefined);

    // Recorded so `/health` can answer "is my scheduler actually running?".
    const history = await getJson<{ runs: number }>(CRON_KEY, { runs: 0 });
    await setJson(CRON_KEY, { runs: history.runs + 1, lastRunAt: new Date().toISOString() });
    await releaseLock(lock);

    res.json({
      ok: true,
      scanned: scanned.map((symbol) => symbol.replace(/USDT$/, '')),
      radar: { offset: batch.offset, universeSize: batch.universeSize, runsPerSweep: batch.runsPerSweep },
      evaluated,
      alerts,
      watches,
      closed: closed.map((trade) => ({ base: trade.base, strategy: trade.strategy, outcome: trade.outcome })),
      announced,
      breakeven: protectedCount,
      // Cards rewritten in place, as against messages newly sent.
      cardsUpdated: updated,
      dailyReport: report.published ? report.date : null,
      open,
      winRate: winRate(stats),
      tookMs: Date.now() - startedAt,
    });
  }),
);

/**
 * Proves the alert path without waiting for the market. Disabled entirely
 * unless `ALERTS_TEST_SECRET` is configured.
 */
api.post(
  '/alerts/test',
  route(async (req, res) => {
    const provided = typeof req.query.secret === 'string' ? req.query.secret : '';
    if (!env.alertsTestSecret || provided !== env.alertsTestSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const [signals, headline] = await Promise.all([
      getSignals('day', [...env.symbols]),
      getHeadlineEvent(),
    ]);
    res.json(await sendTestAlert(signals, headline));
  }),
);

api.get(
  '/context',
  route(async (_req, res) => {
    res.json(await getMarketContext());
  }),
);

/**
 * Telegram's webhook.
 *
 * Answers 200 to anything it accepts, whatever happened inside: Telegram
 * redelivers a non-200, and an update that fails once fails identically every
 * time, so an error here becomes an infinite retry loop rather than a fix.
 *
 * The guard is `secret_token`, which Telegram echoes on every call. This is a
 * public URL — without the header check, anyone could forge a subscription or a
 * button press. The route 404s while the secret is unset rather than running
 * open, so a half-configured deploy accepts nothing.
 */
api.post(
  '/telegram/webhook',
  route(async (req, res) => {
    const provided = req.headers['x-telegram-bot-api-secret-token'];

    if (!env.telegramWebhookSecret || provided !== env.telegramWebhookSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const result = await handleUpdate((req.body ?? {}) as TelegramUpdate);
    res.json({ ok: true, ...result });
  }),
);

/**
 * The settled record, trade by trade.
 *
 * Open, unlike `/admin/analytics`, because nothing here is expensive or
 * private: it is a bounded read of a list the ledger already keeps, and every
 * number in it is one the dashboard publishes in aggregate anyway. A record
 * quoted as a single percentage is a claim; the same record trade by trade is
 * something a reader can check.
 *
 * `r` is what each trade actually returned in units of the risk it was opened
 * with, computed from the levels rather than from the reward ratio the engine
 * advertised — a trade that closed at breakeven returned zero however generous
 * its target was, and a trade whose stop had moved risked less than its
 * published stop implied. That distinction is the whole point of an equity
 * curve: summing advertised ratios would draw the curve the strategy was
 * supposed to have.
 */
api.get(
  '/trades/history',
  route(async (_req, res) => {
    const [history, stats] = await Promise.all([loadHistory(), loadStats()]);

    const trades = history
      .filter((trade) => trade.outcome === 'win' || trade.outcome === 'loss' || trade.outcome === 'breakeven')
      .map((trade) => {
        return {
          id: trade.id,
          base: trade.base,
          strategy: trade.strategy,
          side: trade.side,
          outcome: trade.outcome,
          openedAt: trade.openedAt,
          closedAt: trade.closedAt,
          resultPct: trade.resultPct,
          /*
           * The engine's confluence reading at the moment the call was made,
           * carried through so a reader can ask what the record looks like at
           * each level of it rather than only in aggregate.
           *
           * Optional because trades opened before the ledger stored it have
           * none. Reported as `null` rather than a default: a made-up
           * confidence would land in whichever band it was invented into and
           * quietly bias that band's win rate.
           */
          confidence: typeof trade.confidence === 'number' ? trade.confidence : null,
          // The same function the bot's /stats sums, so the two cannot
          // quote different returns for the same bracket.
          r: round(realisedR(trade), 3),
        };
      })
      // Oldest first: an equity curve is read left to right.
      .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));

    /*
     * The whole record beside the part of it that can be drawn. `sums.r`
     * accumulates at close and outlives the log, so the panel can name what
     * every decided trade is worth while the curve covers what it still holds.
     */
    const record = {
      wins: stats.wins,
      losses: stats.losses,
      settled: stats.wins + stats.losses,
      r: stats.sums.r,
      roiPct: stats.sums.roiPct,
    };

    res.json({ trades, stats, record, count: trades.length });
  }),
);

/**
 * The trades the bot is currently tracking.
 *
 * Priced from the exchange-wide ticker feed rather than per symbol: one request
 * covers every open trade no matter how many there are, where nineteen separate
 * lookups would be nineteen round trips and a rate-limit risk for a panel that
 * polls.
 */
api.get(
  '/signals/active',
  route(async (_req, res) => {
    res.json(await getActiveSignals());
  }),
);

/**
 * Clears the trading record.
 *
 * Three separate things have to line up before anything is deleted: the secret
 * must be configured, it must match, and the caller must spell out `confirm=RESET`.
 * The last one is not security — anyone holding the secret can send it — it is
 * there so that a half-remembered curl from shell history cannot wipe the ledger.
 *
 * `scope=ledger` (the default) clears trades, statistics and alert state.
 * `scope=all` additionally drops every subscriber, their preferences and their
 * mutes — unrecoverable, since nobody would know to press start again.
 */
api.post(
  '/admin/reset',
  route(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const provided = bearer || (typeof req.query.secret === 'string' ? req.query.secret : '');

    if (!env.adminSecret || provided !== env.adminSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    if (req.query.confirm !== 'RESET') {
      res.status(400).json({
        error: 'Add ?confirm=RESET to proceed',
        wouldDelete: 'open trades, win/loss/expired/voided counters, history, alert state',
        scopes: { ledger: 'the trading record (default)', all: 'also every subscriber and their settings' },
      });
      return;
    }

    const scope: ResetScope = req.query.scope === 'all' ? 'all' : 'ledger';
    const result = await resetStore(scope);

    console.warn(`[admin] store reset (${scope}): ${result.deleted} key(s) deleted`);
    res.json({ ok: true, ...result });
  }),
);

/**
 * Candles for one symbol, for the chart behind a live trade.
 *
 * The dashboard could have embedded a third-party chart widget instead, but then
 * the picture and the call would come from different places — and the levels are
 * the whole point of looking. These are the same bars the signal was computed
 * from, so what is drawn and what was decided cannot disagree.
 */
api.get(
  '/market/candles',
  route(async (req, res) => {
    const raw = typeof req.query.symbol === 'string' ? req.query.symbol.trim().toUpperCase() : '';
    if (!raw || !(await isSelectableSymbol(raw))) {
      res.status(404).json({ error: 'Unknown symbol' });
      return;
    }

    const asked = typeof req.query.interval === 'string' ? req.query.interval : '1h';
    const interval: Interval = asked === '5m' || asked === '4h' ? asked : '1h';
    const limit = Math.min(Math.max(Number(req.query.limit) || 180, 30), 500);

    const set = await getKlines(raw, interval, limit);
    res.json({ symbol: set.symbol, interval: set.interval, candles: set.candles });
  }),
);

/**
 * What the record says once you stop looking only at the headline percentage.
 *
 * Behind the same secret as the reset, and for a related reason: it replays
 * candles for every scratched trade, so an open endpoint would be a way to make
 * the server do unbounded upstream work on request.
 *
 * `?format=text` returns the Telegram summary instead of JSON, which is what
 * makes `/stats_deep` and this endpoint the same answer rather than two
 * implementations that can disagree.
 */
api.get(
  '/admin/analytics',
  route(async (req, res) => {
    const header = req.headers.authorization ?? '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const provided = bearer || (typeof req.query.secret === 'string' ? req.query.secret : '');

    if (!env.adminSecret || provided !== env.adminSecret) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const analytics = await analyticsForReader(env.breakevenThreshold);

    if (req.query.format === 'text') {
      res.type('text/plain').send(formatAnalytics(analytics).replace(/<[^>]+>/g, ''));
      return;
    }

    res.json(analytics);
  }),
);
