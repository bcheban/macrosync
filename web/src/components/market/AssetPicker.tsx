import { Check, RotateCcw, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTx } from '@/i18n/useTx';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { useAssetScope } from '@/state/AssetScope';
import type { AssetGroup } from '@/types/domain';

const GROUP_TONE: Record<AssetGroup, string> = {
  majors: 'text-accent-soft',
  layer1: 'text-cyber',
  layer2: 'text-cyber',
  defi: 'text-bull',
  meme: 'text-warn',
  ai: 'text-accent-soft',
  // Pairs the scanner reaches that the curated catalogue never categorised.
  radar: 'text-white/45',
};

interface AssetPickerProps {
  /** Tailwind height for the scrollable list — differs between popover and sheet. */
  listClassName?: string;
  className?: string;
}

/**
 * The asset universe UI: search, group filters and a multi-select list.
 *
 * Extracted from the dropdown so the desktop popover and the mobile control
 * sheet render exactly the same component — there is no second implementation
 * to keep in sync, and behaviour cannot drift between breakpoints.
 */
export function AssetPicker({ listClassName = 'max-h-72', className }: AssetPickerProps) {
  const { t, assetName } = useTx();
  const { universe, shortlist, groups, selected, maxSelected, isSelected, toggle, selectGroup, reset } =
    useAssetScope();

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<AssetGroup | 'all'>('all');
  const atLimit = selected.length >= maxSelected;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    /*
     * The shortlist is what the list opens on — merging the radar into the
     * catalogue took it from twenty-eight names to a hundred and fifty, most of
     * which mean nothing to a reader scanning for one.
     *
     * Searching or picking a group escapes it, because at that point the reader
     * has said what they are looking for and hiding a match would be wrong.
     */
    const pool = needle || group !== 'all' ? universe : shortlist;

    return pool.filter((asset) => {
      if (group !== 'all' && asset.group !== group) return false;
      if (!needle) return true;
      return (
        asset.base.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle) ||
        assetName(asset).toLowerCase().includes(needle)
      );
    });
  }, [universe, shortlist, query, group, assetName]);

  /** How many names the shortlist is holding back, for the hint under the list. */
  const hidden = query.trim() || group !== 'all' ? 0 : universe.length - shortlist.length;

  const onToggle = (symbol: string) => {
    toggle(symbol);
    trackEvent('asset_toggle', { symbol, selected: isSelected(symbol) ? 'remove' : 'add' });
  };

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-white">{t('assets.title')}</p>
        <span className="tnum shrink-0 font-mono text-[10px] text-white/35">
          {t('assets.selected', { count: selected.length, max: String(maxSelected) })}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-white/40">{t('assets.subtitle')}</p>

      <label className="glass-soft mt-3 flex items-center gap-2 rounded-xl px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-white/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('assets.searchPlaceholder')}
          aria-label={t('common.search')}
          // 16px on mobile: anything smaller makes iOS Safari zoom the viewport.
          className="w-full min-w-0 bg-transparent text-base text-white placeholder:text-white/25 focus:outline-none sm:text-[12px]"
        />
      </label>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        {(['all', ...groups] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            onClick={() => setGroup(entry)}
            className={cn(
              'rounded-lg border px-2 py-1 text-[10.5px] font-medium whitespace-nowrap transition-colors duration-200',
              entry === group
                ? 'border-accent/30 bg-accent/12 text-accent-soft'
                : 'border-white/8 bg-white/2 text-white/45 hover:text-white/75',
            )}
          >
            {t(`assets.groups.${entry}`)}
          </button>
        ))}

        {/* Swaps the entire selection to the group currently being filtered. */}
        <button
          type="button"
          onClick={() => {
            selectGroup(group);
            trackEvent('asset_group_select', { group });
          }}
          className="ml-auto rounded-lg border border-white/8 bg-white/2 px-2 py-1 text-[10.5px] font-medium whitespace-nowrap text-white/45 transition-colors duration-200 hover:border-accent/25 hover:text-accent-soft"
        >
          {t('assets.selectGroup')}
        </button>
      </div>

      <ul
        role="listbox"
        aria-multiselectable
        aria-label={t('assets.title')}
        className={cn('mt-2.5 space-y-0.5 overflow-y-auto overscroll-contain pr-1', listClassName)}
      >
        {visible.map((asset) => {
          const active = isSelected(asset.symbol);
          // At the cap, unselected rows are disabled rather than silently ignored.
          const blocked = !active && atLimit;
          return (
            <li key={asset.symbol}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={blocked}
                onClick={() => onToggle(asset.symbol)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none sm:py-1.5',
                  active ? 'bg-white/6' : 'hover:bg-white/4',
                  blocked && 'cursor-not-allowed opacity-35 hover:bg-transparent',
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors duration-200',
                    active ? 'border-accent/50 bg-accent/25 text-white' : 'border-white/15',
                  )}
                >
                  {active && <Check className="size-3" strokeWidth={3} />}
                </span>

                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0 text-[12.5px] font-semibold text-white/90">{asset.base}</span>
                  <span className="min-w-0 truncate text-[11px] text-white/35">{assetName(asset)}</span>
                </span>

                <span
                  className={cn(
                    'shrink-0 text-[9.5px] tracking-wider whitespace-nowrap uppercase',
                    GROUP_TONE[asset.group],
                  )}
                >
                  {t(`assets.groups.${asset.group}`)}
                </span>
              </button>
            </li>
          );
        })}

        {!visible.length && (
          <li className="px-2 py-6 text-center text-[11.5px] break-words text-white/35">
            {t('assets.empty', { query })}
          </li>
        )}

        {/* Said plainly, because a list that quietly hides most of itself lies. */}
        {hidden > 0 && (
          <li className="px-2 pt-2 pb-1 text-center text-[10.5px] text-white/25">
            {t('assets.hidden', { n: String(hidden) })}
          </li>
        )}
      </ul>

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/6 pt-2.5">
        <p
          className={cn(
            'min-w-0 text-[10.5px] leading-snug transition-colors duration-200',
            atLimit ? 'text-warn/70' : 'text-white/30',
          )}
        >
          {t('assets.limit', { max: String(maxSelected) })}
        </p>
        <button
          type="button"
          onClick={reset}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] whitespace-nowrap text-white/45 transition-colors duration-200 hover:bg-white/5 hover:text-white/80"
        >
          <RotateCcw className="size-3" />
          {t('assets.reset')}
        </button>
      </div>
    </div>
  );
}
