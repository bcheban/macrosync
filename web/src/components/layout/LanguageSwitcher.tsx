import { AnimatePresence, m } from 'framer-motion';
import { Check, Globe } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@/i18n';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Locale } from '@/types/domain';

/**
 * The language picker, as a menu rather than a row.
 *
 * It used to be a segmented control with every language on show, which reads
 * well at three and stops working at five: the header has a fixed budget and a
 * control that grows with the number of languages spends the whole of it on a
 * setting most readers touch once. Collapsed to a globe and two letters, the
 * cost is constant however many locales ship.
 *
 * Closes on outside click, on Escape, and on choosing — the three ways somebody
 * signals they are done with a menu. `Escape` returns focus to the trigger,
 * because a keyboard user who dismisses a menu has nowhere else to be.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const active = (LOCALES.includes(i18n.resolvedLanguage as Locale) ? i18n.resolvedLanguage : 'en') as Locale;

  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };

    /*
     * `pointerdown`, not `click`. A click listener fires after the press has
     * already moved focus, so a tap on another control would close this and
     * then land — which is right — but a press that drags off would not close
     * it at all. Pointerdown makes dismissal follow the press.
     */
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (locale: Locale) => {
    setOpen(false);
    if (locale === active) return;
    trackEvent('language_change', { from: active, to: locale });
    void i18n.changeLanguage(locale);
  };

  return (
    <div ref={holder} className={cn('relative', className)}>
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('language.label')}
        title={t('language.label')}
        className={cn(
          'glass-soft flex h-9 items-center gap-1.5 rounded-xl px-2.5 transition-all duration-200',
          'hover:border-white/20 hover:bg-white/6 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
          open ? 'border-white/20 bg-white/6 text-white' : 'text-white/60',
        )}
      >
        <Globe className="size-4 shrink-0" />
        {/*
          Fixed width on the code. Every label is two characters, so the trigger
          cannot resize on a switch and nudge the controls beside it.
        */}
        <span className="w-5 text-center text-[11px] font-semibold tracking-wide">
          {t(`language.${active}Short`)}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            id={menuId}
            role="menu"
            aria-label={t('language.label')}
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            /*
             * `z-50` puts it above the sticky header's own stacking context and
             * everything the page scrolls under it. Absolutely positioned, so
             * opening the menu cannot reflow the header — a dropdown that
             * pushes the controls beside it is worse than no dropdown.
             */
            className="absolute right-0 z-50 mt-1.5 min-w-[9.5rem] origin-top-right overflow-hidden rounded-xl border border-white/10 bg-[#121824] p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
          >
            {LOCALES.map((locale) => {
              const selected = locale === active;
              return (
                <button
                  key={locale}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  lang={locale}
                  onClick={() => choose(locale)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-colors duration-150',
                    'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
                    selected ? 'bg-white/8 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90',
                  )}
                >
                  {/*
                    Each language names itself. "Ukrainian" is only useful to
                    somebody who already reads English, which is exactly the
                    person who does not need this menu.
                  */}
                  <span>{t(`language.${locale}`)}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wide text-white/30">
                      {t(`language.${locale}Short`)}
                    </span>
                    <Check className={cn('size-3.5 text-accent-soft', selected ? 'opacity-100' : 'opacity-0')} />
                  </span>
                </button>
              );
            })}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
