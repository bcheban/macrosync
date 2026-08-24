import { m } from 'framer-motion';
import { Info } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface InfoTipProps {
  /** Plain-language explanation. Kept short — this is a hint, not documentation. */
  children: ReactNode;
  /** Accessible name for the trigger, e.g. "What is ATR?". */
  label: string;
  className?: string;
  align?: 'start' | 'center' | 'end';
}

const MARGIN = 8;
const WIDTH = 260;

/**
 * A hint attached to a term the interface cannot afford to explain inline.
 *
 * Rendered through a portal because every card in this app is
 * `overflow-hidden` — a tooltip positioned inside one would simply be clipped.
 * Position is measured from the trigger and flipped above when there is no room
 * below.
 *
 * Works for all three input kinds: hover for a mouse, focus for a keyboard,
 * tap for touch (where hover does not exist). Escape and scrolling dismiss it.
 */
export function InfoTip({ children, label, className, align = 'center' }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, flipped: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tipId = useId();

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const flipped = rect.bottom + 120 > window.innerHeight;

    const anchor =
      align === 'start' ? rect.left : align === 'end' ? rect.right - WIDTH : rect.left + rect.width / 2 - WIDTH / 2;

    setPosition({
      top: flipped ? rect.top - MARGIN : rect.bottom + MARGIN,
      // Never let the bubble hang off either edge on a phone.
      left: Math.min(Math.max(MARGIN, anchor), window.innerWidth - WIDTH - MARGIN),
      flipped,
    });
  };

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const show = () => {
    place();
    setOpen(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          event.preventDefault();
          open ? setOpen(false) : show();
        }}
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-white/40 transition-colors duration-200 hover:bg-white/8 hover:text-accent-soft focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:text-accent-soft focus-visible:outline-none',
          open && 'text-accent-soft',
          className,
        )}
      >
        <Info className="size-3.5" strokeWidth={2.4} />
      </button>

      {/*
        The portal is mounted only while the tip is open. A signal grid carries
        two of these per card, so keeping thirty-odd idle portals and presence
        wrappers alive cost real blocking time on a phone for markup nobody was
        looking at.
      */}
      {open &&
        createPortal(
          <m.div
            id={tipId}
            role="tooltip"
            initial={{ opacity: 0, y: position.flipped ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              top: position.top,
              left: position.left,
              width: WIDTH,
              transform: position.flipped ? 'translateY(-100%)' : undefined,
            }}
            className="glass-overlay pointer-events-none fixed z-[60] rounded-xl px-3 py-2 text-[11.5px] leading-relaxed text-white/75"
          >
            {children}
          </m.div>,
          document.body,
        )}
    </>
  );
}
