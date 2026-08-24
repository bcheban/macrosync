import { BrainCircuit } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/Badge';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { AiInsight, MarketContext } from '@/types/domain';
import { InsightCard } from './InsightCard';

interface InsightsFeedProps {
  insights: AiInsight[];
  context?: MarketContext;
  loading: boolean;
  error?: Error;
}

/**
 * The AI layer: news in, risk-management scenarios out. Deliberately never a
 * buy/sell call — the prompt and the fallback engine both enforce that.
 *
 * Model-written prose arrives already in the active language (the API is asked
 * for it); rule-engine output arrives as translation keys resolved here.
 */
export function InsightsFeed({ insights, context, loading, error }: InsightsFeedProps) {
  const { t } = useTranslation();
  const provider = insights[0]?.generatedBy;

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={BrainCircuit}
        title={t('insights.title')}
        subtitle={t('insights.subtitle')}
        tip={t('glossary.insights')}
        tipLabel={t('glossary.insightsLabel')}
        actions={
          <div className="flex items-center gap-2">
            {context && <Badge tone="cyber">{t('topbar.atr', { value: String(context.avgAtrPct) })}</Badge>}
            {provider && <Badge tone="accent">{t(`insights.provider.${provider}`)}</Badge>}
          </div>
        }
      />

      {error && !insights.length && (
        <div className="rounded-card text-safe border border-bear/20 bg-bear/6 p-4 text-sm text-bear/90">
          {t('insights.error', { message: error.message })}
        </div>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-2 2xl:grid-cols-3">
        {loading && !insights.length
          ? Array.from({ length: 4 }).map((_, index) => <CardSkeleton key={index} />)
          : insights.map((insight, index) => (
              <InsightCard key={insight.id} insight={insight} index={index} />
            ))}
      </div>
    </section>
  );
}
