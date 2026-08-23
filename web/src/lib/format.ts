import i18n, { currentIntlLocale } from '@/i18n';

/**
 * Formatting helpers.
 *
 * Numbers follow the active locale's grouping and decimal separators, and the
 * relative-time strings come from the `time.*` translation keys. Components
 * that render these already subscribe to `useTranslation()`, so a language
 * switch re-renders them with the new formatting.
 */

/** Prices keep Latin digit grouping so a tape stays scannable across locales. */
export function formatPrice(value: number): string {
  const decimals = value >= 1000 ? 2 : value >= 1 ? 3 : value >= 0.01 ? 5 : 8;
  return value.toLocaleString(currentIntlLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const formatUsd = (value: number): string => `$${formatPrice(value)}`;

export function formatCompact(value: number): string {
  return new Intl.NumberFormat(currentIntlLocale(), {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export const formatPct = (value: number, digits = 2): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;

export const pad2 = (value: number): string => value.toString().padStart(2, '0');

const tr = (key: string, options?: Record<string, unknown>): string =>
  i18n.t(key as never, options as never) as unknown as string;

/** "3m ago", "2h ago", "4d ago" — localized. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return tr('time.secondsAgo', { count: seconds });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tr('time.minutesAgo', { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tr('time.hoursAgo', { count: hours });
  return tr('time.daysAgo', { count: Math.round(hours / 24) });
}

/** Absolute event timestamp, always in UTC — traders read the calendar in UTC. */
export const formatClock = (iso: string): string =>
  `${new Date(iso).toLocaleString(currentIntlLocale(), {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })} UTC`;

/** Rough "in 2d 4h" style label for calendar rows. */
export function formatDistance(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((Date.parse(iso) - now) / 60_000));
  if (minutes < 60) return tr('time.inMinutes', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return tr('time.inHours', { hours, minutes: pad2(minutes % 60) });
  return tr('time.inDays', { days: Math.floor(hours / 24), hours: hours % 24 });
}
