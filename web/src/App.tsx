import { LazyMotion } from 'framer-motion';
import { ShieldAlert } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CountdownRadar } from '@/components/countdown/CountdownRadar';
import { EventQueue } from '@/components/countdown/EventQueue';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { BackgroundFX } from '@/components/layout/BackgroundFX';
import { TopBar } from '@/components/layout/TopBar';
import { TickerStrip } from '@/components/market/TickerStrip';
import { Watchlist } from '@/components/market/Watchlist';
import { LiveTrades } from '@/components/signals/LiveTrades';
import { SignalsPanel } from '@/components/signals/SignalsPanel';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { useMarketTickers } from '@/hooks/useMarketTickers';
import { usePolling } from '@/hooks/usePolling';
import { currentLocale } from '@/i18n';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { AssetScopeProvider, useAssetScope } from '@/state/AssetScope';

/*
 * The AI feed sits below the fold and is the heaviest panel in the app — it is
 * the only consumer of the expand/collapse machinery and the insight card tree.
 * Splitting it out keeps that code off the critical path for first paint.
 */
const InsightsFeed = lazy(() =>
  import('@/components/insights/InsightsFeed').then((module) => ({ default: module.InsightsFeed })),
);

/*
 * Framer's feature set is loaded after the first paint instead of being bundled
 * into the entry chunk. Components use `m.*`, which carries no animation
 * features on its own, so nothing here blocks the initial render; `domMax` is
 * required because the tab pills and the signal grid use shared-layout
 * animations.
 */
const loadMotionFeatures = () => import('framer-motion').then((mod) => mod.domMax);

function Dashboard() {
  const { t, i18n } = useTranslation();
  const { selected, setWithTrades } = useAssetScope();
  const locale = currentLocale();

  // Owns everything language-dependent in <head>, plus GA4 page views.
  useDocumentMeta();
  useAnalytics();

  const symbolKey = selected.join(',');
  const tickers = usePolling((signal) => api.tickers(selected, signal), 10_000, [symbolKey]);
  // REST snapshot overlaid with the exchange's live socket, so prices are exact.
  const market = useMarketTickers(tickers.data?.tickers ?? []);
  // Low-impact calendar noise is hidden by default; the queue can reveal it.
  const [showLowImpact, setShowLowImpact] = useState(false);
  const events = usePolling((signal) => api.events(showLowImpact, signal), 30_000, [showLowImpact]);
  // Re-fetched on a language switch: model-written insights come back translated.
  /*
   * The ledger the Telegram bot writes. Polled on its own clock rather than with
   * the signal grid: it changes when the scheduled scan runs, not when the user
   * changes their asset selection, so it must not re-fetch on every toggle.
   */
  const active = usePolling((signal) => api.activeSignals(signal), 30_000, []);

  /*
   * An asset the bot has an open trade on is never filtered out of the picker,
   * however far down the volume ranking it has drifted since the call.
   */
  const tradedSymbols = active.data?.signals.map((signal) => signal.symbol).join(',') ?? '';
  useEffect(() => {
    setWithTrades(tradedSymbols ? tradedSymbols.split(',') : []);
  }, [tradedSymbols, setWithTrades]);
  const insights = usePolling((signal) => api.insights(locale, signal), 60_000, [i18n.resolvedLanguage], {
    // Below the fold and the heaviest response of the three — it can wait.
    deferUntilIdle: true,
  });

  const refreshAll = () => {
    tickers.refresh();
    events.refresh();
    active.refresh();
    insights.refresh();
  };

  const refreshing = tickers.refreshing || events.refreshing || active.refreshing || insights.refreshing;

  return (
    <div className="min-h-screen">
      <BackgroundFX />

      <TopBar
        context={insights.data?.context}
        tickers={market.tickers}
        streaming={market.streaming}
        /*
         * The first ticker request, still open. `loading` alone is not enough:
         * it is also true on the refresh that follows a tab coming back into
         * view, and the header should not re-announce "connecting" over data
         * that is already on screen.
         */
        connecting={tickers.loading && !tickers.data}
        refreshing={refreshing}
        onRefresh={refreshAll}
      />
      <TickerStrip tickers={market.tickers} />

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:space-y-8 lg:py-8">
        <CountdownRadar event={events.data?.headline} loading={events.loading} />

        {/*
          Full width, above the fold's second screen. Thirty open trades in a
          340px sidebar was a scroll; three strategy columns need the page.
        */}
        <LiveTrades data={active.data} loading={active.loading} />

        <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SignalsPanel />

          <aside className="min-w-0 space-y-5 sm:space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Watchlist tickers={market.tickers} loading={tickers.loading} expected={selected.length || 8} />
            <EventQueue
              events={events.data?.events ?? []}
              counts={events.data?.counts}
              loading={events.loading}
              showLow={showLowImpact}
              onToggleLow={setShowLowImpact}
            />
          </aside>
        </div>

        <Suspense
          fallback={
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <CardSkeleton key={index} />
              ))}
            </div>
          }
        >
          <InsightsFeed
            insights={insights.data?.insights ?? []}
            context={insights.data?.context}
            loading={insights.loading}
            error={insights.error}
          />
        </Suspense>

        <footer className="glass rounded-card flex flex-col gap-2.5 p-4 sm:flex-row sm:items-start sm:gap-4">
          <ShieldAlert className="size-4 shrink-0 text-white/30 sm:mt-0.5" />
          <p className="min-w-0 text-[11.5px] leading-relaxed text-white/35">
            <span className="text-white/55">{t('footer.lead', { brand: BRAND.name })}</span>{' '}
            {t('footer.body')}
          </p>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <AssetScopeProvider>
        <Dashboard />
      </AssetScopeProvider>
    </LazyMotion>
  );
}
