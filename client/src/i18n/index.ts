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

/** Default UI language for public builds. */
export const DEFAULT_LOCALE: Locale = 'en';

type Vars = Record<string, string | number>;

/** Resolve a dotted key like `settings.title` from a dictionary. */
export function lookup(dict: TranslationDict | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Translate `key` for `locale`, falling back to English then the raw key.
 * Placeholders use `{name}` (e.g. `Hello {user}` + `{ user: 'a' }` → `Hello a`).
 * Templates may prefix with `@` literally: `@{user}` → `@alice`.
 */
export function translate(locale: Locale | string, key: string, vars?: Vars): string {
  const dict = dictionaries[locale as Locale] ?? en;
  const raw = lookup(dict, key) ?? lookup(en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : `{${name}}`,
  );
}

export function getDictionary(locale: Locale): TranslationDict {
  return dictionaries[locale] ?? en;
}
