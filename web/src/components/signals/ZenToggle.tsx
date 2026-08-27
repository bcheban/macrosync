import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';

const STORAGE_KEY = 'ayanox.zen';

const readStored = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // A private window, or storage the browser refuses. Off is the safe default.
    return false;
  }
};

/**
 * Hides everything the engine is not actually calling.
 *
 * The board publishes a card per asset per strategy whether or not there is a
 * trade in it, because "no edge here" is a real answer and a reader scanning
 * for one deserves it. But that is the answer for most assets most of the time,
 * so on a wide selection the actionable calls end up outnumbered several to one
 * by cards that exist to say nothing is happening.
 *
 * Persisted, because it is a way of working rather than a momentary filter. A
 * reader who wants only live calls wants that on their next visit too.
 *
 * Deliberately not a filter chip beside the strategy tabs: those narrow *which*
 * signals are shown, and this changes what the panel is for. Grouping it with
 * them would suggest it composes with them in the same way.
 */
export function useZenMode(): [boolean, (next: boolean) => void] {
  const [zen, setZen] = useState<boolean>(readStored);

  useEffect(() => {
    try {
      if (zen) window.localStorage.setItem(STORAGE_KEY, '1');
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* The mode still works; it just will not be remembered. */
    }
  }, [zen]);

  return [zen, setZen];
}

export function ZenToggle({
  value,
  onChange,
  hidden,
  className,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  /** How many cards the mode is currently keeping off screen. */
  hidden: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = value ? EyeOff : Eye;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={t(value ? 'signals.zenOn' : 'signals.zenOff')}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px] font-medium transition-colors duration-200',
        'focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none',
        value
          ? 'border-accent/40 bg-accent/12 text-white'
          : 'border-white/10 bg-white/3 text-white/45 hover:border-white/20 hover:text-white/80',
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="hidden sm:inline">{t('signals.zen')}</span>
      {/*
        The count is what makes the mode honest: it says how much is being kept
        from you, so a quiet board reads as "nothing is happening" rather than
        as "the panel is broken".
      */}
      {value && hidden > 0 && <span className="tnum font-mono text-white/50">{hidden}</span>}
    </button>
  );
}
