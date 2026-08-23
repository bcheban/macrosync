import { useTranslation } from 'react-i18next';
import { useCallback, useMemo } from 'react';
import type { AssetMeta, I18nText, MacroEvent } from '@/types/domain';

/**
 * A translate function that accepts runtime keys.
 *
 * `t()` is strongly typed against the English bundle, which is exactly what we
 * want for hand-written UI copy — but server payloads carry keys that only
 * exist as strings at build time. This is the one place where the key type is
 * widened, so the rest of the app keeps its autocompletion.
 */
export type LooseT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Renders an `I18nText` coming from the API.
 *
 * - no `key` → the producer was an LLM already writing in the active language,
 *   so its `text` is used verbatim;
 * - a `key` → translated with `text` as the fallback, and any param named
 *   `<name>Key` is resolved as a nested translation key for `<name>` first.
 */
export function renderI18nText(t: LooseT, node: I18nText | undefined): string {
  if (!node) return '';
  if (!node.key) return node.text;

  const source = node.params ?? {};
  const params: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(source)) {
    if (name.endsWith('Key')) continue;
    const nestedKey = source[`${name}Key`];
    params[name] =
      typeof nestedKey === 'string' ? t(nestedKey, { defaultValue: String(value) }) : value;
  }

  return t(node.key, { ...params, defaultValue: node.text });
}

/**
 * Translation helpers for everything the API sends: `I18nText` nodes plus the
 * fixtures that are translated by id (macro events, news headlines, assets).
 */
export function useTx() {
  const { t: typedT, i18n } = useTranslation();
  const t = typedT as unknown as LooseT;

  const text = useCallback((node: I18nText | undefined) => renderI18nText(t, node), [t]);

  /**
   * Event names come from the calendar feed in English. A locale may translate
   * the common indicators by slug (`events.cpi-m-m.title`); anything it has no
   * entry for falls back to what the feed published.
   */
  const eventTitle = useCallback(
    (event: Pick<MacroEvent, 'id' | 'title'>) => t(`events.${event.id}.title`, { defaultValue: event.title }),
    [t],
  );

  /** Project names are proper nouns; a locale may still override well-known ones. */
  const assetName = useCallback(
    (asset: Pick<AssetMeta, 'base' | 'name'>) => t(`assets.names.${asset.base}`, { defaultValue: asset.name }),
    [t],
  );

  return useMemo(
    () => ({ t: typedT, tx: t, i18n, text, eventTitle, assetName }),
    [typedT, t, i18n, text, eventTitle, assetName],
  );
}
