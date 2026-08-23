import 'i18next';
import type { en } from './locales/en';

/**
 * Gives `t()` full key autocompletion and catches typos at build time.
 * Keys that only exist at runtime (server-supplied `I18nText.key`) go through
 * `resolveI18nText`, which deliberately widens the key type.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
