import { m } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatPrice, timeAgo } from '@/lib/format';
import { useAssetScope } from '@/state/AssetScope';
import type { ActiveSignal, ActiveSignalsResponse, Strategy } from '@/types/domain';

interface LiveTradesProps {
  data?: ActiveSignalsResponse;
  loading: boolean;
}

/** Fixed order, so the groups do not reshuffle as counts change. */
const ORDER: Strategy[] = ['scalping', 'day', 'swing'];

/**
 * How far a trade has travelled, as a bar.
 *
 * Reads from entry: filling right is progress toward the target, filling left is
 * drift toward the stop. Clamped for display only — the number beside it is
 * unclamped, because a trade 130% of the way to its stop is worth seeing as
 * exactly that rather than as a full bar.
 */
function ProgressBar({ pct }: { pct: number }) {
  /*
   * `pct` is already signed toward the target, so the side of the trade does not
   * come into it — a short moving down is positive progress just as a long
   * moving up is. Positive fills from the left, negative from the right.
   */
  const toward = pct >= 0;
  const width = Math.min(Math.abs(pct), 100);

  return (
    <div className="relative mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/8">
      <div
        className={cn(
          'absolute inset-y-0 rounded-full transition-[width] duration-500',
          toward ? 'bg-bull/70' : 'bg-bear/70',
        )}
        style={toward ? { width: `${width}%`, left: 0 } : { width: `${width}%`, right: 0 }}
      />
    </div>
  );
}

function TradeRow({ trade, index }: { trade: ActiveSignal; index: number }) {
  const { t } = useTranslation();
  const { isSelected, toggle } = useAssetScope();

  const selected = isSelected(trade.symbol);
  const long = trade.side === 'buy';
  const move = trade.unrealisedPct;

  return (
    <m.button
      type="button"
      onClick={() => toggle(trade.symbol)}
      aria-pressed={selected}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index, 6) * 0.04, duration: 0.3 }}
      className={cn(
        'block w-full rounded-xl px-2.5 py-2 text-left transition-colors duration-200',
        'hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
        selected && 'bg-white/6 ring-1 ring-inset ring-white/12',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold text-white">{trade.base}</span>
          <span
            className={cn(
              'shrink-0 rounded px-1 py-px text-[9.5px] font-semibold tracking-wider uppercase',
              long ? 'bg-bull/15 text-bull' : 'bg-bear/15 text-bear',
            )}
          >
            {t(long ? 'liveTrades.long' : 'liveTrades.short')}
          </span>
        </div>

        {move !== null && (
          <span className={cn('tnum shrink-0 font-mono text-xs', move >= 0 ? 'text-bull' : 'text-bear')}>
            {move >= 0 ? '+' : ''}
            {move.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="tnum truncate font-mono text-white/45">
          {t('liveTrades.entry')} {formatPrice(trade.entry)}
          {trade.price !== null && <span className="text-white/30"> · {formatPrice(trade.price)}</span>}
        </span>
        <span className="shrink-0 text-white/30">{timeAgo(trade.openedAt)}</span>
      </div>

      {trade.progressPct !== null && <ProgressBar pct={trade.progressPct} />}
    </m.button>
  );
}

/**
 * What the bot is tracking, on the site that publishes it.
 *
 * The ledger behind the Telegram alerts was invisible here: the channel knew
 * which calls were open and the dashboard did not, so the two could describe the
 * same moment differently. Every row selects that asset, which is the point —
 * a call arrives on the phone and its chart is one tap away.
 */
export function LiveTrades({ data, loading }: LiveTradesProps) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const signals = data?.signals ?? [];
    return ORDER.map((strategy) => ({
      strategy,
      trades: signals.filter((signal) => signal.strategy === strategy),
    })).filter((group) => group.trades.length > 0);
  }, [data]);

  const total = data?.signals.length ?? 0;

  return (
    <GlassCard className="p-4 sm:p-5">
      <SectionHeader
        icon={Radio}
        title={t('liveTrades.title')}
        subtitle={t('liveTrades.subtitle')}
        tip={t('glossary.liveTrades')}
        tipLabel={t('liveTrades.title')}
        actions={
          data && data.decided > 0 ? (
            <span className="glass-soft tnum rounded-lg px-2 py-1 font-mono text-[10.5px] text-white/60">
              {t('liveTrades.record', { rate: String(data.winRate), decided: String(data.decided) })}
            </span>
          ) : undefined
        }
      />

      <div className="mt-4 max-h-104 space-y-3 overflow-y-auto pr-1">
        {loading && !total ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />)
        ) : !total ? (
          <p className="px-1 py-3 text-[11.5px] leading-relaxed text-white/40">{t('liveTrades.empty')}</p>
        ) : (
          groups.map((group) => (
            <section key={group.strategy}>
              <h3 className="px-1 pb-1 text-[10px] font-semibold tracking-[0.14em] text-white/30 uppercase">
                {t(`signals.strategies.${group.strategy}`)}
                <span className="ml-1.5 text-white/20">{group.trades.length}</span>
              </h3>
              <div className="space-y-0.5">
                {group.trades.map((trade, index) => (
                  <TradeRow key={trade.id} trade={trade} index={index} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </GlassCard>
  );
}
