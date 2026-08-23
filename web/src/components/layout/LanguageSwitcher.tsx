import { m } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { LOCALES } from '@/i18n';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Locale } from '@/types/domain';

/**
 * EN / UA segmented control.
 *
 * Same material and motion as the strategy tabs: the active pill is one shared
 * element animated with `layoutId`, so the switch glides rather than cuts. The
 * choice is persisted by the language detector, so a reload keeps it.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const active = (LOCALES.includes(i18n.resolvedLanguage as Locale) ? i18n.resolvedLanguage : 'en') as Locale;

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className={cn('glass-soft flex items-center gap-0.5 rounded-xl p-0.5', className)}
    >
      <Languages className="ml-1.5 size-3.5 shrink-0 text-white/30" aria-hidden />
      {LOCALES.map((locale) => {
        const selected = locale === active;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={selected}
            title={t(`language.${locale}`)}
            onClick={() => {
              if (selected) return;
              trackEvent('language_change', { from: active, to: locale });
              void i18n.changeLanguage(locale);
            }}
            className={cn(
              // Fixed width: both labels are two characters, so the pill cannot
              // resize and nudge the header when the language changes.
              'relative w-9 rounded-lg py-1 text-center text-[11px] font-semibold tracking-wide transition-colors duration-200',
              selected ? 'text-white' : 'text-white/40 hover:text-white/75',
            )}
          >
            {selected && (
              <m.span
                layoutId="language-pill"
                className="absolute inset-0 rounded-lg border border-accent/30 bg-linear-to-b from-accent/25 to-accent/10 shadow-[0_0_18px_-8px] shadow-accent/80"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{t(`language.${locale}Short`)}</span>
          </button>
        );
      })}
    </div>
  );
}
