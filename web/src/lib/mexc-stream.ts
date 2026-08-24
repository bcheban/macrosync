/**
 * MEXC's public perpetual-contract stream.
 *
 * This file used to be a hand-rolled protobuf reader. Spot retired its JSON
 * websocket channels — only the `.pb` variants still push — so reading the live
 * price meant walking the wire format by field number. The contract socket has
 * no such restriction: `wss://contract.mexc.com/edge` speaks plain JSON, and
 * migrating the backend to perpetuals removed the reason that decoder existed.
 *
 * Keeping it would have been worse than dead code. The dashboard would have gone
 * on streaming *spot* prices over signals computed from *futures* candles, and
 * the two are close enough that the disagreement would look like rounding rather
 * than like two different instruments.
 */

/** One symbol's book, as `push.ticker` reports it. */
export interface MexcTick {
  /** Internal form — `BTCUSDT`, not the socket's `BTC_USDT`. */
  symbol: string;
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
}

export const MEXC_WS_URL = 'wss://contract.mexc.com/edge';

/** Perpetuals are quoted `BTC_USDT`; everything else here uses `BTCUSDT`. */
const toContract = (symbol: string): string =>
  symbol.includes('_') ? symbol : symbol.replace(/(USDT|USDC)$/, '_$1');

const fromContract = (symbol: string): string => symbol.replace('_', '');

/** One subscription frame per symbol — the contract socket has no batch form. */
export const subscribeFrame = (symbol: string): string =>
  JSON.stringify({ method: 'sub.ticker', param: { symbol: toContract(symbol) } });

/** The socket closes an idle connection at 60s; this keeps it open. */
export const PING_FRAME = JSON.stringify({ method: 'ping' });
export const PING_INTERVAL_MS = 20_000;

/**
 * How many symbols to stream at once.
 *
 * The asset picker caps a selection at 16, so this is headroom rather than a
 * limit anyone reaches.
 */
export const MAX_CHANNELS = 30;

interface PushTicker {
  channel?: string;
  data?: {
    symbol?: string;
    lastPrice?: number;
    /** A FRACTION: 0.0027 is +0.27%, matching the REST field. */
    riseFallRate?: number;
    high24Price?: number;
    lower24Price?: number;
    /** Turnover in USDT. `volume24` counts contracts and is not comparable. */
    amount24?: number;
  };
}

/**
 * Reads one frame, or returns null for anything that is not market data.
 *
 * Subscription acks (`rs.sub.ticker`) and `pong` arrive on the same socket, so
 * the channel check is what separates them — not the shape, which for an ack is
 * a bare string where a tick is an object.
 */
export function decodeTicker(frame: string): MexcTick | null {
  let message: PushTicker;
  try {
    message = JSON.parse(frame) as PushTicker;
  } catch {
    return null;
  }

  if (message.channel !== 'push.ticker') return null;

  const data = message.data;
  const symbol = data?.symbol;
  const price = data?.lastPrice;

  // A frame without these two says nothing worth rendering.
  if (!symbol || typeof price !== 'number') return null;

  return {
    symbol: fromContract(symbol),
    price,
    changePct24h: (data?.riseFallRate ?? 0) * 100,
    high24h: data?.high24Price ?? 0,
    low24h: data?.lower24Price ?? 0,
    quoteVolume24h: data?.amount24 ?? 0,
  };
}
