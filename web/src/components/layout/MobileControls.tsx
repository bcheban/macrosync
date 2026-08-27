import { AnimatePresence, m } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { MarketStatus } from '@/components/layout/MarketStatus';
import { TelegramCta } from '@/components/layout/TelegramCta';
import { AssetPicker } from '@/components/market/AssetPicker';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { MarketContext } from '@/types/domain';

interface MobileControlsProps {
  context?: MarketContext;
  live: boolean;
  streaming?: boolean;
  connecting?: boolean;
  className?: string;
}

/**
 * The mobile navigation surface: everything the desktop header shows inline —
 * market status, the asset universe and the language switcher — collected into
 * one slide-over sheet.
 *
 * Accessibility: it is a real modal dialog. Focus moves into the panel on open
 * and returns to the trigger on close, Tab is trapped inside it, Escape and a
 * backdrop tap dismiss it, and the page behind it is locked from scrolling.
 *
 * It renders through a portal because the header carries `backdrop-filter`,
 * which makes that element the containing block for `position: fixed`
 * descendants — an in-place overlay would be clipped to the height of the bar.
 */
export function MobileControls({
  context,
  live,
  streaming = false,
  connecting = false,
  className,
}: MobileControlsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    focusable()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  const toggle = () => {
    setOpen((value) => {
      if (!value) trackEvent('mobile_controls_open');
      return !value;
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('common.controls')}
        className={cn(
          'glass-soft flex size-9 shrink-0 items-center justify-center rounded-xl text-white/60 transition-all duration-200 hover:border-white/20 hover:bg-white/6 hover:text-white focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none active:scale-95',
          className,
        )}
      >
        <SlidersHorizontal className="size-4" />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-50 md:hidden">
              <m.button
                type="button"
                tabIndex={-1}
                aria-label={t('common.close')}
                onClick={() => setOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 h-full w-full cursor-default bg-black/80 backdrop-blur-md"
              />

              <m.div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 34 }}
                className="glass-overlay absolute inset-y-0 right-0 flex w-[min(21rem,100vw)] flex-col border-y-0 border-r-0"
              >
                <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                  <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold text-white">
                    {t('common.controls')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label={t('common.close')}
                    className="glass-soft flex size-8 shrink-0 items-center justify-center rounded-lg text-white/60 transition-colors duration-200 hover:text-white"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* The sheet itself scrolls; the picker's list scrolls within it. */}
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
                  {/* First thing in the sheet: the one action that turns a
                      dashboard visit into an ongoing subscription. */}
                  <TelegramCta variant="banner" />

                  <section className="space-y-2">
                    <h3 className="text-[10px] tracking-[0.16em] text-white/35 uppercase">{t('topbar.status')}</h3>
                    <MarketStatus
                      context={context}
                      live={live}
                      streaming={streaming}
                      connecting={connecting}
                      variant="stacked"
                    />
                  </section>

                  <section>
                    <AssetPicker listClassName="max-h-[46vh]" />
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-[10px] tracking-[0.16em] text-white/35 uppercase">{t('language.label')}</h3>
                    <LanguageSwitcher className="w-fit" />
                  </section>
                </div>
              </m.div>
            </div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
