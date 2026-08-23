import { useEffect, useRef, useState } from 'react';

/** One symbol's live book, as reported by Binance's `miniTicker` stream. */
export interface LiveQuote {
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  /** Epoch ms of the last tick — used to decide whether the stream is healthy. */
  at: number;
}

/** Raw `<symbol>@miniTicker` payload. */
interface MiniTicker {
  s: string; // symbol
  c: string; // close (last price)
  o: string; // open, 24h ago
  h: string; // high
  l: string; // low
  q: string; // quote volume
}

const STREAM_HOST = 'wss://stream.binance.com:9443/stream';
const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribes to Binance's public market stream straight from the browser.
 *
 * Why client-side: the REST feed behind our API is fetched from the server, so
 * it is one poll interval behind at best — and when the API runs somewhere
 * whose IP the exchange geo-blocks, it silently degrades to the simulator. The
 * browser has neither problem, so quotes here are the exact live rate and stay
 * correct even when the backend is serving fallback data.
 *
 * The socket is best-effort: any failure just leaves the REST values in place,
 * and the UI marks a quote live only while ticks are actually arriving.
 */
export function useLivePrices(symbols: string[]): Record<string, LiveQuote> {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});

  // Sorted + joined so a re-render with the same set does not reconnect.
  const streamKey = symbols.map((symbol) => symbol.toLowerCase()).sort().join('/');

  /*
   * Ticking assets on and off in the picker changes the key on every click.
   * Reconnecting per click would burn through the exchange's connection rate
   * limit, so the key is settled first and only the final set is subscribed.
   */
  const [settledKey, setSettledKey] = useState(streamKey);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledKey(streamKey), 600);
    return () => window.clearTimeout(timer);
  }, [streamKey]);

  const pending = useRef<Record<string, LiveQuote>>({});

  useEffect(() => {
    if (!settledKey) return;

    let socket: WebSocket | undefined;
    let retry = 0;
    let reconnectTimer: number | undefined;
    let closed = false;

    /*
     * Ticks arrive several times a second per symbol. Committing each one to
     * React state would re-render the whole tape continuously, so they are
     * buffered and flushed on a fixed cadence — fast enough to read as live,
     * cheap enough not to fight the animations.
     */
    const flushTimer = window.setInterval(() => {
      if (!Object.keys(pending.current).length) return;
      const batch = pending.current;
      pending.current = {};
      setQuotes((current) => ({ ...current, ...batch }));
    }, 1000);

    const connect = () => {
      if (closed) return;
      const streams = settledKey
        .split('/')
        .map((symbol) => `${symbol}@miniTicker`)
        .join('/');

      socket = new WebSocket(`${STREAM_HOST}?streams=${streams}`);

      socket.onopen = () => {
        retry = 0;
      };

      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string) as { data?: MiniTicker };
          const tick = frame.data;
          if (!tick?.s) return;

          const price = Number(tick.c);
          const open = Number(tick.o);
          if (!Number.isFinite(price) || price <= 0) return;

          pending.current[tick.s] = {
            price,
            changePct24h: open > 0 ? ((price - open) / open) * 100 : 0,
            high24h: Number(tick.h),
            low24h: Number(tick.l),
            quoteVolume24h: Number(tick.q),
            at: Date.now(),
          };
        } catch {
          /* A malformed frame is not worth tearing the stream down for. */
        }
      };

      socket.onclose = () => {
        if (closed) return;
        // Exponential backoff so a blocked network does not spin the socket.
        retry += 1;
        const delay = Math.min(1000 * 2 ** (retry - 1), MAX_BACKOFF_MS);
        reconnectTimer = window.setTimeout(connect, delay);
      };

      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      closed = true;
      window.clearInterval(flushTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [settledKey]);

  return quotes;
}

/** A quote counts as live only while ticks are still arriving. */
export const LIVE_QUOTE_TTL_MS = 15_000;

export const isFresh = (quote: LiveQuote | undefined, now = Date.now()): boolean =>
  Boolean(quote && now - quote.at < LIVE_QUOTE_TTL_MS);
