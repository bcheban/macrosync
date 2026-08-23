import type {
  AssetsResponse,
  EventsResponse,
  InsightsResponse,
  Locale,
  SignalsResponse,
  Strategy,
  TickersResponse,
} from '@/types/domain';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${path}`);
  return (await response.json()) as T;
}

/** `?symbols=…` is omitted entirely when nothing is selected, so the API falls back to its defaults. */
const symbolsParam = (symbols: string[]): string => (symbols.length ? `symbols=${symbols.join(',')}` : '');

const query = (...parts: string[]): string => {
  const joined = parts.filter(Boolean).join('&');
  return joined ? `?${joined}` : '';
};

export const api = {
  assets: (signal?: AbortSignal) => get<AssetsResponse>('/assets', signal),

  tickers: (symbols: string[], signal?: AbortSignal) =>
    get<TickersResponse>(`/market/tickers${query(symbolsParam(symbols))}`, signal),

  signals: (strategy: Strategy, symbols: string[], signal?: AbortSignal) =>
    get<SignalsResponse>(`/signals${query(`strategy=${strategy}`, symbolsParam(symbols))}`, signal),

  events: (signal?: AbortSignal) => get<EventsResponse>('/events?limit=6', signal),

  /** `lang` only reaches the LLM layer — deterministic copy is translated client-side. */
  insights: (locale: Locale, signal?: AbortSignal) =>
    get<InsightsResponse>(`/insights?limit=6&lang=${locale}`, signal),
};
