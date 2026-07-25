import { LOCALES, type Locale } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';
import { useT } from '../hooks/useT';

interface Props {
  /** Compact inline control (e.g. sidebar). */
  compact?: boolean;
}

/** English / French language switcher. */
export function LanguageSelector({ compact = false }: Props) {
  const t = useT();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  if (compact) {
    return (
      <div className="flex items-center gap-1 rounded-lg border border-raid-border bg-raid-surface p-0.5">
        {LOCALES.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setLocale(opt.id)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
              locale === opt.id
                ? 'bg-raid-accent text-white'
                : 'text-raid-text-secondary hover:text-raid-text'
            }`}
            aria-pressed={locale === opt.id}
          >
            {opt.id}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="mb-1 block text-xs text-raid-text-secondary" htmlFor="locale-select">
        {t('common.language')}
      </label>
      <select
        id="locale-select"
        className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {LOCALES.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-raid-text-secondary">{t('common.languageHint')}</p>
    </div>
  );
}
