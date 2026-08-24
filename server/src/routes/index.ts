import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { ASSET_GROUPS } from '../data/assets.js';
import { calendarStatus, getUpcomingEvents, getHeadlineEvent } from '../services/calendar.service.js';
import { getNews, newsStatus } from '../services/news/news.service.js';
import { getTickers, upstreamStatus } from '../services/market.service.js';
import { getInsights, getMarketContext, invalidateInsights } from '../services/insight.service.js';
import { getSignals, isStrategy, STRATEGY_PROFILES } from '../services/signal.engine.js';
import { alertsStatus, notifyClosed, notifySignals, sendTestAlert } from '../services/telegram/alerts.service.js';
import { botStatus, handleUpdate, type TelegramUpdate } from '../services/telegram/webhook.service.js';
import { getActiveSignals } from '../services/trades/active.service.js';
import { resetStore, type ResetScope } from '../services/admin/reset.service.js';
import {
  isSelectableSymbol,
  nextBatch,
  radarStatus,
  selectableAssets,
} from '../services/radar/universe.service.js';
import { telegramStatus } from '../services/telegram/telegram.client.js';
import { acquireLock, getJson, releaseLock, setJson, storeKey, storeStatus } from '../services/store/store.js';
import { evaluateTrades, tradesStatus, winRate } from '../services/trades/trades.service.js';

/** Where the scheduled run records that it happened. */
const CRON_KEY = storeKey('cron:last');
import type { Locale, Signal } from '../types/domain.js';

export const api = Router();

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

    const { closed, stats, open } = await evaluateTrades();
    const announced = await notifyClosed(closed, stats);

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
      closed: closed.map((trade) => ({ base: trade.base, strategy: trade.strategy, outcome: trade.outcome })),
      announced,
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
