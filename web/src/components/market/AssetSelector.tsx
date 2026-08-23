import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Coins } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useAssetScope } from '@/state/AssetScope';
import { AssetPicker } from './AssetPicker';

/**
 * Desktop asset switcher: a trigger plus a popover around {@link AssetPicker}.
 *
 * Below `md` the same picker is presented inside the mobile control sheet, so
 * this component is hidden there rather than trying to be a popover on a phone.
 */
export function AssetSelector({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { selected } = useAssetScope();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          'glass-soft flex h-9 items-center gap-2 rounded-xl px-2.5 text-[12px] font-medium whitespace-nowrap transition-all duration-200 hover:text-white',
          open ? 'border-accent/30 text-white' : 'text-white/60',
        )}
      >
        <Coins className="size-3.5 shrink-0 text-accent-soft" />
        <span className="tnum">{t('assets.trigger', { count: selected.length })}</span>
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform duration-300', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t('assets.title')}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass rounded-card absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] p-3"
          >
            <AssetPicker />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
