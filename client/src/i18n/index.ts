import en from './en';
import fr from './fr';
import type { Locale, TranslationDict } from './types';

export type { Locale, TranslationDict };
export { en, fr };

const dictionaries: Record<Locale, TranslationDict> = { en, fr };

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

export const DEFAULT_LOCALE: Locale = 'en';

type Vars = Record<string, string | number>;

/** Resolve a dotted key like `settings.title` from a dictionary. */
export function lookup(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(locale: Locale, key: string, vars?: Vars): string {
  const raw = lookup(dictionaries[locale], key) ?? lookup(en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function getDictionary(locale: Locale): TranslationDict {
  return dictionaries[locale] ?? en;
}
