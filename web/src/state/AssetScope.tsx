import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { AssetGroup, AssetMeta } from '@/types/domain';

const STORAGE_KEY = 'macrosync.assets';

interface AssetScopeValue {
  /** Everything the API can price — the catalogue behind the switcher. */
  universe: AssetMeta[];
  groups: AssetGroup[];
  bySymbol: Map<string, AssetMeta>;
  /** Currently tracked symbols, ordered as they appear in the catalogue. */
  selected: string[];
  maxSelected: number;
  loading: boolean;
  isSelected: (symbol: string) => boolean;
  toggle: (symbol: string) => void;
  selectOnly: (symbols: string[]) => void;
  selectGroup: (group: AssetGroup | 'all') => void;
  reset: () => void;
}

const AssetScopeContext = createContext<AssetScopeValue | undefined>(undefined);

const readStored = (): string[] | undefined => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : undefined;
  } catch {
    return undefined;
  }
};

const writeStored = (symbols: string[]): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    /* private mode / quota — the selection simply will not persist. */
  }
};

/**
 * Holds the asset universe and the user's slice of it.
 *
 * Every data panel reads `selected` from here, so switching assets in the
 * header re-scopes the ticker tape, the watchlist and the signal grid at once.
 * The choice survives a reload; it is validated against the live catalogue on
 * load so a retired ticker cannot get stuck in local storage.
 */
export function AssetScopeProvider({ children }: { children: ReactNode }) {
  const [universe, setUniverse] = useState<AssetMeta[]>([]);
  const [groups, setGroups] = useState<AssetGroup[]>([]);
  const [defaults, setDefaults] = useState<string[]>([]);
  const [maxSelected, setMaxSelected] = useState(16);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    api
      .assets(controller.signal)
      .then((payload) => {
        const known = new Set(payload.assets.map((asset) => asset.symbol));
        const stored = readStored()?.filter((symbol) => known.has(symbol));

        setUniverse(payload.assets);
        setGroups(payload.groups);
        setDefaults(payload.defaults);
        setMaxSelected(payload.maxPerRequest);
        setSelected(stored?.length ? stored : payload.defaults.filter((symbol) => known.has(symbol)));
      })
      .catch(() => {
        /* The panels keep working: an empty selection makes the API use its defaults. */
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const order = useMemo(
    () => new Map(universe.map((asset, index) => [asset.symbol, index])),
    [universe],
  );

  const commit = useCallback(
    (symbols: string[]) => {
      const unique = [...new Set(symbols)]
        .slice(0, maxSelected)
        .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
      setSelected(unique);
      writeStored(unique);
    },
    [maxSelected, order],
  );

  const toggle = useCallback(
    (symbol: string) =>
      setSelected((current) => {
        const next = current.includes(symbol)
          ? current.filter((entry) => entry !== symbol)
          : [...current, symbol].slice(0, maxSelected);
        // Never let the selection empty out — the dashboard would have nothing to show.
        const resolved = next.length ? next : current;
        const ordered = resolved.slice().sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
        writeStored(ordered);
        return ordered;
      }),
    [maxSelected, order],
  );

  const selectGroup = useCallback(
    (group: AssetGroup | 'all') =>
      commit(
        universe.filter((asset) => group === 'all' || asset.group === group).map((asset) => asset.symbol),
      ),
    [commit, universe],
  );

  const value = useMemo<AssetScopeValue>(
    () => ({
      universe,
      groups,
      bySymbol: new Map(universe.map((asset) => [asset.symbol, asset])),
      selected,
      maxSelected,
      loading,
      isSelected: (symbol) => selected.includes(symbol),
      toggle,
      selectOnly: commit,
      selectGroup,
      reset: () => commit(defaults),
    }),
    [universe, groups, selected, maxSelected, loading, toggle, commit, selectGroup, defaults],
  );

  return <AssetScopeContext.Provider value={value}>{children}</AssetScopeContext.Provider>;
}

export function useAssetScope(): AssetScopeValue {
  const context = useContext(AssetScopeContext);
  if (!context) throw new Error('useAssetScope must be used inside <AssetScopeProvider>');
  return context;
}
