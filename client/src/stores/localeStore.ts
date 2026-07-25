import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../i18n';

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const LOCALE_IDS = new Set(LOCALES.map((l) => l.id));

/** Coerce unknown/persisted values to a supported locale (default English). */
export function normalizeLocale(value: unknown): Locale {
  return typeof value === 'string' && LOCALE_IDS.has(value as Locale)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}

/**
 * UI language preference. Persisted in localStorage (`screenraid-locale`).
 * Invalid values from older builds are normalized on read/write.
 */
export const useLocaleStore = create<LocaleStore>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale: normalizeLocale(locale) }),
    }),
    {
      name: 'screenraid-locale',
      // Guard against corrupted or unknown locale strings in storage.
      merge: (persisted, current) => {
        const raw = persisted as Partial<LocaleStore> | undefined;
        return {
          ...current,
          ...raw,
          locale: normalizeLocale(raw?.locale ?? current.locale),
        };
      },
    },
  ),
);
