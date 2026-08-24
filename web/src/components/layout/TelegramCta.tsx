import { useTranslation } from 'react-i18next';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/cn';

/** Telegram's own blue — the one colour in the app that is not ours. */
const TELEGRAM_BLUE = '#229ED9';

const BOT_URL = import.meta.env.VITE_TELEGRAM_BOT_URL ?? '';

/** The paper plane, drawn inline: lucide has no Telegram glyph. */
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M21.94 4.3c.24-1.11-.5-1.6-1.24-1.33L2.9 9.9c-1.1.44-1.08 1.06-.19 1.34l4.57 1.43 10.6-6.7c.5-.3.96-.14.58.19l-8.58 7.76-.33 4.72c.43 0 .62-.19.84-.41l2.02-1.95 4.2 3.1c.77.43 1.33.21 1.52-.71l2.8-13.17Z" />
    </svg>
  );
}

interface TelegramCtaProps {
  /** `compact` for the header, `banner` for a panel or the mobile sheet. */
  variant?: 'compact' | 'banner';
  className?: string;
}

/**
 * Link to the alert bot.
 *
 * Deliberately the loudest control in the interface: it is the one action that
 * takes a visitor from reading a dashboard to being told when something
 * happens, and it borrows Telegram's own blue so it reads as an external
 * destination rather than another panel.
 *
 * Renders nothing when `VITE_TELEGRAM_BOT_URL` is unset — a dead call to action
 * is worse than none.
 */
export function TelegramCta({ variant = 'compact', className }: TelegramCtaProps) {
  const { t } = useTranslation();
  if (!BOT_URL) return null;

  const onClick = () => trackEvent('telegram_cta_click', { variant });

  if (variant === 'banner') {
    return (
      <a
        href={BOT_URL}
        target="_blank"
        rel="noreferrer noopener"
        onClick={onClick}
        style={{ backgroundColor: TELEGRAM_BLUE }}
        className={cn(
          'group flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-[0_0_28px_-8px] shadow-[#229ED9]/80 transition-all duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none active:scale-[0.99]',
          className,
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <TelegramIcon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] leading-tight font-semibold">{t('telegram.title')}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-white/80">{t('telegram.subtitle')}</span>
        </span>
      </a>
    );
  }

  return (
    <a
      href={BOT_URL}
      target="_blank"
      rel="noreferrer noopener"
      onClick={onClick}
      style={{ backgroundColor: TELEGRAM_BLUE }}
      className={cn(
        'flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold whitespace-nowrap text-white shadow-[0_0_22px_-8px] shadow-[#229ED9]/90 transition-all duration-200 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none active:scale-95',
        className,
      )}
    >
      <TelegramIcon className="size-4 shrink-0" />
      <span className="hidden lg:inline">{t('telegram.cta')}</span>
      <span className="lg:hidden">{t('telegram.ctaShort')}</span>
    </a>
  );
}
