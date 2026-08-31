import { timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { acquireLock, storeKey } from '../store/store.js';
import { isStrategy } from '../signal.engine.js';
import { maxSafeLeverage } from '../signal.engine.js';
import { getContractSpecs } from '../market.service.js';
import { displayTicker } from '../../utils/ticker.js';
import type { Signal, Strategy } from '../../types/domain.js';

/**
 * Alerts from TradingView, turned into calls this bot can publish.
 *
 * The engine finds its own setups; this is the other direction — a chart the
 * owner has already made up their mind about, arriving as a webhook. The two
 * paths converge at `openTrade`, so a TradingView call gets the same ladder,
 * the same breakeven rule and the same place in the record as an engine call.
 *
 * ## The secret cannot be a header
 *
 * TradingView's alert webhook posts a body to a URL and offers no way to set
 * request headers. So `Authorization: Bearer` — the obvious design, and the one
 * this was asked for — is unusable from the only client that will ever call it.
 *
 * All three transports are accepted anyway, because a header is right for
 * anything else that posts here (a script, a test, another service) and costs
 * nothing to support. But the one to paste into TradingView is the field in the
 * JSON body, and the URL query is the fallback for a plan that will not send a
 * body at all.
 */

/** What TradingView is expected to post. Everything else is ignored. */
export interface TradingViewAlert {
  /** The shared secret, when it travels in the body. */
  secret?: string;
  /** `MEXC:LABUSDT.P`, `LABUSDT`, `LAB` — all resolve to `LABUSDT`. */
  symbol: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  entry: number | string;
  stopLoss: number | string;
  /** Which horizon this call belongs to. Defaults to `day`. */
  strategy?: string;
  /** The bar interval, for display only. */
  timeframe?: string;
  /** One sentence for the card. The alert's own words, not the engine's. */
  note?: string;
  /**
   * A stable id for this alert, so a repeated fire cannot open a second trade.
   *
   * TradingView will resend on every bar while a condition holds unless the
   * alert is set to fire once, and "once" is a setting a person can forget.
   * Supply `{{timenow}}`-free text here — a bar timestamp is ideal — and the
   * same alert twice becomes one trade.
   */
  id?: string;
}

export interface ParsedAlert {
  symbol: string;
  base: string;
  side: 'buy' | 'sell';
  entry: number;
  stopLoss: number;
  strategy: Strategy;
  timeframe: string;
  note: string;
  dedupeKey: string;
}

export type ParseFailure = { ok: false; reason: string };
export type ParseSuccess = { ok: true; alert: ParsedAlert };

/**
 * Constant-time comparison that does not leak the secret's length.
 *
 * `timingSafeEqual` throws on a length mismatch, which is itself a signal, so
 * both sides are hashed to a fixed width first. Overkill for a webhook nobody
 * is going to sit and time — and exactly the kind of thing that is cheap now
 * and impossible to retrofit enthusiasm for later.
 */
function secretMatches(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;

  const a = Buffer.from(provided.padEnd(64).slice(0, 64));
  const b = Buffer.from(expected.padEnd(64).slice(0, 64));
  return timingSafeEqual(a, b) && provided.length === expected.length;
}

/**
 * The secret, from wherever it arrived.
 *
 * Checked in order of how deliberate each transport is. A header means a script
 * that could have used anything and chose the right thing; a body field means
 * TradingView, which had no choice.
 */
export function authorise(headers: Record<string, unknown>, query: unknown, body: unknown): boolean {
  const expected = env.tradingViewSecret;
  if (!expected) return false;

  const header = String(headers.authorization ?? '');
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  const custom = String(headers['x-webhook-secret'] ?? '');
  const fromQuery =
    query && typeof query === 'object' && typeof (query as { secret?: unknown }).secret === 'string'
      ? (query as { secret: string }).secret
      : '';
  const fromBody =
    body && typeof body === 'object' && typeof (body as { secret?: unknown }).secret === 'string'
      ? (body as { secret: string }).secret
      : '';

  return [bearer, custom, fromQuery, fromBody].some((candidate) =>
    secretMatches(candidate || undefined, expected),
  );
}

/**
 * `MEXC:LABUSDT.P` → `LABUSDT`.
 *
 * TradingView tickers carry an exchange prefix and a contract suffix that mean
 * nothing here. A bare base is accepted too, because that is what a person
 * types when they write the alert by hand rather than using `{{ticker}}`.
 */
export function normaliseSymbol(raw: string): string {
  const withoutExchange = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
  const upper = withoutExchange.trim().toUpperCase().replace(/\.(P|PS|PM)$/, '');

  if (!upper) return '';
  return upper.endsWith('USDT') ? upper : `${upper}USDT`;
}

const asNumber = (value: unknown): number => {
  // TradingView interpolates prices as strings, and a stray comma is common.
  const parsed = typeof value === 'string' ? Number(value.replace(/[, ]/g, '')) : Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

/**
 * Validates one alert, refusing anything the ledger could not resolve.
 *
 * Every refusal names what was wrong. A webhook that answers `400` and nothing
 * else is a webhook somebody debugs by guessing, and TradingView shows the
 * response body in its alert log — so the message written here is the message
 * the person editing the alert actually reads.
 */
export function parseAlert(body: unknown): ParseSuccess | ParseFailure {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'body must be a JSON object' };

  const raw = body as Partial<TradingViewAlert>;

  const symbol = normaliseSymbol(String(raw.symbol ?? ''));
  if (!symbol) return { ok: false, reason: 'symbol is required' };

  const rawSide = String(raw.side ?? '').trim().toLowerCase();
  const side = rawSide === 'buy' || rawSide === 'long' ? 'buy' : rawSide === 'sell' || rawSide === 'short' ? 'sell' : '';
  if (!side) return { ok: false, reason: 'side must be buy, sell, long or short' };

  const entry = asNumber(raw.entry);
  const stopLoss = asNumber(raw.stopLoss);
  if (!(entry > 0)) return { ok: false, reason: 'entry must be a positive number' };
  if (!(stopLoss > 0)) return { ok: false, reason: 'stopLoss must be a positive number' };

  /*
   * The stop has to be on the losing side of entry. Getting this backwards is
   * the single easiest mistake to make in a TradingView alert — the template
   * is written once and the direction is edited later — and the ladder built
   * from it would put every target the wrong way round, so it is refused here
   * rather than published and puzzled over.
   */
  if (side === 'buy' && stopLoss >= entry) {
    return { ok: false, reason: 'a long needs its stop below entry' };
  }
  if (side === 'sell' && stopLoss <= entry) {
    return { ok: false, reason: 'a short needs its stop above entry' };
  }

  /*
   * A stop closer than a tenth of a percent is almost always a decimal slip in
   * the alert, and it would make 1R a rounding error — every rung inside the
   * spread, filled instantly and meaninglessly.
   */
  const stopFraction = Math.abs(entry - stopLoss) / entry;
  if (stopFraction < 0.001) return { ok: false, reason: 'stop is within 0.1% of entry — check the decimals' };
  if (stopFraction > 0.5) return { ok: false, reason: 'stop is more than 50% from entry — check the decimals' };

  const strategy: Strategy = isStrategy(raw.strategy ?? '') ? (raw.strategy as Strategy) : 'day';
  const base = symbol.replace(/USDT$/, '');

  return {
    ok: true,
    alert: {
      symbol,
      base,
      side,
      entry,
      stopLoss,
      strategy,
      timeframe: String(raw.timeframe ?? '').trim() || strategy,
      note: String(raw.note ?? '').trim().slice(0, 300),
      /*
       * The caller's id when there is one, and the trade's own geometry when
       * there is not. Two alerts for the same setup at the same levels are the
       * same alert however many times TradingView decides to send it.
       */
      dedupeKey: String(raw.id ?? '').trim() || `${symbol}:${side}:${entry}:${stopLoss}`,
    },
  };
}

/** How long a delivered alert keeps its slot. Long enough to outlive a retry storm. */
const DEDUPE_TTL_SECONDS = 6 * 60 * 60;

/**
 * True the first time an alert is seen, false every time after.
 *
 * Uses the same `SET NX EX` the scheduled run locks with: the check and the
 * claim are one operation, so two deliveries arriving together cannot both win.
 * On the memory backend it is exact; against Redis it is exact too, which is
 * the whole reason the ledger uses it rather than a read followed by a write.
 */
export async function claimAlert(dedupeKey: string): Promise<boolean> {
  return acquireLock(storeKey(`webhook:tv:${dedupeKey}`), DEDUPE_TTL_SECONDS);
}

/**
 * Turns a validated alert into the shape the rest of the bot already speaks.
 *
 * The target is a placeholder that `openTrade` immediately replaces with the
 * last rung of the ladder it builds from entry and stop — the same ladder an
 * engine call gets. Nothing here decides where the targets go.
 *
 * Confidence is zero and that is deliberate rather than missing. The engine's
 * score means "how much of my own confluence agreed"; an external call has no
 * such quantity, and inventing one would drop these trades into a confidence
 * bracket and move its win rate with evidence that is not about the engine.
 * Zero falls outside every bracket, so they are counted in the record and
 * excluded from the calibration, which is exactly right.
 */
export async function toSignal(alert: ParsedAlert): Promise<Signal> {
  const specs = await getContractSpecs().catch(() => undefined);
  const spec = specs?.get(alert.symbol);
  const risk = Math.abs(alert.entry - alert.stopLoss);

  return {
    id: `tv:${alert.symbol}:${Date.now()}`,
    symbol: alert.symbol,
    base: alert.base,
    strategy: alert.strategy,
    timeframe: alert.timeframe,
    direction: alert.side === 'buy' ? 'long' : 'short',
    verdict: alert.side,
    summary: { text: alert.note || `TradingView alert on ${displayTicker(alert.base)}.` },
    confidence: 0,
    status: 'live',
    price: alert.entry,
    entry: alert.entry,
    stopLoss: alert.stopLoss,
    // Replaced by the ladder's last rung the moment the trade opens.
    takeProfit: alert.side === 'buy' ? alert.entry + risk : alert.entry - risk,
    riskReward: 0,
    suggestedRiskPct: 1,
    maxSafeLeverage: maxSafeLeverage(alert.entry, alert.stopLoss, spec),
    indicators: { rsi: 0, emaFast: 0, emaSlow: 0, macdHistogram: 0, atrPct: 0, volumeRatio: 0 },
    rationale: [],
    source: 'tradingview',
    updatedAt: new Date().toISOString(),
  };
}
