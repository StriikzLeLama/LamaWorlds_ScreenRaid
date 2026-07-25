import { useCallback } from 'react';
import { translate } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

type Vars = Record<string, string | number>;

/** Reactive translator bound to the current locale (re-renders on language change). */
export function useT() {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback((key: string, vars?: Vars) => translate(locale, key, vars), [locale]);
}
