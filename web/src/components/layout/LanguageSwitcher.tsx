import { AnimatePresence, m } from 'framer-motion';
import { Check, Globe } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@/i18n';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import type { Locale } from '@/types/domain';

/**
 * The language picker, in two shapes.
 *
 * `menu` is the header control: a globe and two letters that open a dropdown.
 * It used to be a segmented row showing every language at once, which reads
 * well at three and stops working at five — the header has a fixed budget and a
 * control that grows with the locale count spends all of it on a setting most
 * readers touch once.
 *
 * `list` is the same choice laid out flat, for the mobile sheet. A dropdown
 * inside a slide-over is a menu inside a menu, and the sheet's scroll container
 * clips it besides: the language section is the last block in there, so the
 * dropdown opened downward into the bottom edge and was cut off by an
 * `overflow-y-auto` ancestor. Nothing about that is fixable with alignment —
 * the right answer in a panel is to show the three options.
 */

/**
 * The floor for anything meant to be tapped.
 *
 * 44 is the number both platforms' guidelines land on, and the options were
 * 35: comfortable with a cursor, a coin-flip with a thumb. Applied to the rows
 * in both shapes, because the header control is reachable on a tablet too.
 */
const TAP = 'min-h-11';

function Option({
  locale,
  selected,
  onChoose,
  role,
}: {
  locale: Locale;
  selected: boolean;
  onChoose: () => void;
  role: 'menuitemradio' | 'radio';
}) {
  const { t } = useTranslation();

  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      lang={locale}
      onClick={onChoose}
      className={cn(
        TAP,
        'flex w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[13px] transition-colors duration-150',
        'focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none',
        selected ? 'bg-white/8 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white/90',
      )}
    >
      {/*
        Each language names itself. "Ukrainian" is only useful to somebody who
        already reads English — exactly the person who does not need this.
      */}
      <span>{t(`language.${locale}`)}</span>
      <span className="flex items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wide text-white/30">
          {t(`language.${locale}Short`)}
        </span>
        <Check className={cn('size-4 shrink-0 text-accent-soft', selected ? 'opacity-100' : 'opacity-0')} />
      </span>
    </button>
  );
}

export function LanguageSwitcher({
  variant = 'menu',
  className,
}: {
  variant?: 'menu' | 'list';
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const active = (LOCALES.includes(i18n.resolvedLanguage as Locale) ? i18n.resolvedLanguage : 'en') as Locale;

  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (variant !== 'menu' || !open) return;

    const onPointer = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };

    /*
     * `pointerdown`, not `click`, and it covers touch as well as mouse — a
     * pointer event fires for a finger too. The trigger sits inside `holder`,
     * so a tap on it is not treated as an outside press and the toggle that
     * follows on `click` is the only thing that acts: one tap to open, one to
     * close, never two.
     */
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, variant]);

  const choose = (locale: Locale) => {
    setOpen(false);
    if (locale === active) return;
    trackEvent('language_change', { from: active, to: locale });
    void i18n.changeLanguage(locale);
  };

  if (variant === 'list') {
    return (
      <div role="radiogroup" aria-label={t('language.label')} className={cn('flex flex-col gap-0.5', className)}>
        {LOCALES.map((locale) => (
          <Option
            key={locale}
            locale={locale}
            role="radio"
            selected={locale === active}
            onChoose={() => choose(locale)}
          />
        ))}
      </div>
    );
  }

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
             * `right-0` anchors it to the trigger's right edge, which is itself
             * near the right of the header — so it grows leftward and cannot
             * run off that side. `max-w-[calc(100vw-2rem)]` is the other side's
             * guard: on a narrow viewport the menu stops at the screen rather
             * than sliding under it.
             *
             * `z-50` clears the sticky header's own stacking context, and
             * absolute positioning means opening it cannot reflow the row — a
             * dropdown that pushes the controls beside it is worse than none.
             */
            className="absolute right-0 z-50 mt-1.5 max-w-[calc(100vw-2rem)] min-w-42 origin-top-right overflow-hidden rounded-xl border border-white/10 bg-[#121824] p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
          >
            {LOCALES.map((locale) => (
              <Option
                key={locale}
                locale={locale}
                role="menuitemradio"
                selected={locale === active}
                onChoose={() => choose(locale)}
              />
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
