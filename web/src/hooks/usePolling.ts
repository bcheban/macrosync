import { useCallback, useEffect, useRef, useState } from 'react';

interface PollingState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** True while a background refresh is in flight over existing data. */
  refreshing: boolean;
  lastUpdated: number | undefined;
  refresh: () => void;
}

/**
 * Fetch-on-mount + interval refresh, with the previous payload kept on screen
 * during a refresh so the dashboard never flashes empty.
 * Polling pauses while the tab is hidden.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: unknown[] = [],
  /**
   * Holds the first request until the browser is idle. Used for panels below
   * the fold, whose payload would otherwise compete for bandwidth and parse
   * time with the app's own boot.
   */
  options: { deferUntilIdle?: boolean } = {},
): PollingState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number>();
  const [nonce, setNonce] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  const { deferUntilIdle = false } = options;
  const [ready, setReady] = useState(!deferUntilIdle);

  useEffect(() => {
    if (ready) return;
    const start = () => setReady(true);
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(start, { timeout: 2500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(start, 1200);
    return () => window.clearTimeout(timer);
  }, [ready]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let cancelled = false;

    const run = async () => {
      /*
       * Polling pauses while the tab is hidden — but a first load in a
       * background tab must not leave the skeletons up forever, so the loading
       * flag is released even when the fetch itself is skipped.
       */
      if (document.hidden) {
        if (!hasData.current) setLoading(false);
        return;
      }
      if (hasData.current) setRefreshing(true);
      try {
        const result = await fetcherRef.current(controller.signal);
        if (cancelled) return;
        hasData.current = true;
        setData(result);
        setError(undefined);
        setLastUpdated(Date.now());
      } catch (caught) {
        if (cancelled || (caught as Error).name === 'AbortError') return;
        setError(caught as Error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void run();
    timer = window.setInterval(run, intervalMs);
    const onVisible = () => {
      if (!document.hidden) void run();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, nonce, ready, ...deps]);

  return { data, error, loading, refreshing, lastUpdated, refresh };
}
