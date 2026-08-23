import { useEffect, useRef, useState } from 'react';
import {
  MAX_CHANNELS,
  MEXC_WS_URL,
  PING_FRAME,
  PING_INTERVAL_MS,
  decodeMiniTicker,
  miniTickerChannel,
} from '@/lib/mexc-stream';

/** One symbol's live book, as pushed by MEXC's miniTicker stream. */
export interface LiveQuote {
  price: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  quoteVolume24h: number;
  /** Epoch ms of the last tick — used to decide whether the stream is healthy. */
  at: number;
}

const MAX_BACKOFF_MS = 30_000;

/**
 * Subscribes to MEXC's public market stream straight from the browser.
 *
 * The exchange is the source of truth for price, and this is the shortest path
 * to it: the REST snapshot behind our own API is a cache interval old by
 * definition, while these ticks arrive as the book moves. It also means the
 * number on screen is what MEXC itself shows, to the last decimal.
 *
 * The socket is best-effort. Any failure leaves the REST values in place and
 * the header stops claiming a live stream, rather than freezing a stale number
 * on screen and calling it live.
 */
export function useLivePrices(symbols: string[]): Record<string, LiveQuote> {
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});

  // Sorted + joined so a re-render with the same set does not reconnect.
  const streamKey = symbols.map((symbol) => symbol.toUpperCase()).sort().join(',');

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

    const tracked = settledKey.split(',').slice(0, MAX_CHANNELS);
    let socket: WebSocket | undefined;
    let retry = 0;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let closed = false;

    // Ticks buffered against the previous subscription are not ours any more.
    pending.current = {};

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
      const keep = new Set(tracked);
      setQuotes((current) => {
        const next = { ...current, ...batch };
        // Prune de-selected symbols so the map cannot grow without bound.
        for (const symbol of Object.keys(next)) {
          if (!keep.has(symbol)) delete next[symbol];
        }
        return next;
      });
    }, 1000);

    const connect = () => {
      if (closed) return;

      socket = new WebSocket(MEXC_WS_URL);
      socket.binaryType = 'arraybuffer';

      socket.onopen = () => {
        retry = 0;
        socket?.send(
          JSON.stringify({ method: 'SUBSCRIPTION', params: tracked.map(miniTickerChannel) }),
        );
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send(PING_FRAME);
        }, PING_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        // Subscription acks and PONGs arrive as text; market data is binary.
        if (typeof event.data === 'string') return;

        const tick = decodeMiniTicker(event.data as ArrayBuffer);
        if (!tick) return;

        pending.current[tick.symbol] = {
          price: tick.price,
          changePct24h: tick.changePct24h,
          high24h: tick.high24h,
          low24h: tick.low24h,
          quoteVolume24h: tick.quoteVolume24h,
          at: Date.now(),
        };
      };

      socket.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
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
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [settledKey]);

  return quotes;
}

/** A quote counts as live only while ticks are still arriving. */
export const LIVE_QUOTE_TTL_MS = 20_000;

export const isFresh = (quote: LiveQuote | undefined, now = Date.now()): boolean =>
  Boolean(quote && now - quote.at < LIVE_QUOTE_TTL_MS);
