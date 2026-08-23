import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CountdownRadar } from '@/components/countdown/CountdownRadar';
import { EventQueue } from '@/components/countdown/EventQueue';
import { InsightsFeed } from '@/components/insights/InsightsFeed';
import { BackgroundFX } from '@/components/layout/BackgroundFX';
import { TopBar } from '@/components/layout/TopBar';
import { TickerStrip } from '@/components/market/TickerStrip';
import { Watchlist } from '@/components/market/Watchlist';
import { SignalsPanel } from '@/components/signals/SignalsPanel';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useDocumentMeta } from '@/hooks/useDocumentMeta';
import { usePolling } from '@/hooks/usePolling';
import { currentLocale } from '@/i18n';
import { api } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { AssetScopeProvider, useAssetScope } from '@/state/AssetScope';

function Dashboard() {
  const { t, i18n } = useTranslation();
  const { selected } = useAssetScope();
  const locale = currentLocale();

  // Owns everything language-dependent in <head>, plus GA4 page views.
  useDocumentMeta();
  useAnalytics();

  const symbolKey = selected.join(',');
  const tickers = usePolling((signal) => api.tickers(selected, signal), 10_000, [symbolKey]);
  const events = usePolling((signal) => api.events(signal), 30_000);
  // Re-fetched on a language switch: model-written insights come back translated.
  const insights = usePolling((signal) => api.insights(locale, signal), 60_000, [i18n.resolvedLanguage]);

  const refreshAll = () => {
    tickers.refresh();
    events.refresh();
    insights.refresh();
  };

  const refreshing = tickers.refreshing || events.refreshing || insights.refreshing;

  return (
    <div className="min-h-screen">
      <BackgroundFX />

      <TopBar
        context={insights.data?.context}
        tickers={tickers.data?.tickers ?? []}
        refreshing={refreshing}
        onRefresh={refreshAll}
      />
      <TickerStrip tickers={tickers.data?.tickers ?? []} />

      <main className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-5 sm:space-y-6 sm:px-6 sm:py-6 lg:space-y-8 lg:py-8">
        <CountdownRadar event={events.data?.headline} loading={events.loading} />

        <div className="grid min-w-0 gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <SignalsPanel />

          <aside className="min-w-0 space-y-5 sm:space-y-6 lg:sticky lg:top-24 lg:self-start">
            <Watchlist tickers={tickers.data?.tickers ?? []} loading={tickers.loading} />
            <EventQueue events={events.data?.events ?? []} loading={events.loading} />
          </aside>
        </div>

        <InsightsFeed
          insights={insights.data?.insights ?? []}
          context={insights.data?.context}
          loading={insights.loading}
          error={insights.error}
        />

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
    <AssetScopeProvider>
      <Dashboard />
    </AssetScopeProvider>
  );
}
