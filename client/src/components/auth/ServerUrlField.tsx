import { useEffect, useState } from 'react';
import { Button, Input } from '../ui';
import { checkServerHealth } from '../../services/api';
import { getServerUrl, persistServerUrl } from '../../services/serverConfig';
import { useT } from '../../hooks/useT';
import { translate } from '../../i18n';
import { useLocaleStore } from '../../stores/localeStore';

interface Props {
  /** Called when the URL text changes (before Test / persist). */
  onChange?: (url: string) => void;
  /** Called after Test with the health result (so login can re-enable Sign in). */
  onHealthChange?: (ok: boolean) => void;
}

export function ServerUrlField({ onChange, onHealthChange }: Props) {
  const t = useT();
  const [url, setUrl] = useState(getServerUrl());
  const [hint, setHint] = useState('');
  const [hintOk, setHintOk] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setUrl(getServerUrl());
  }, []);

  const apply = async (): Promise<boolean> => {
    setChecking(true);
    setHint('');
    setHintOk(false);
    try {
      const next = await persistServerUrl(url);
      setUrl(next);
      onChange?.(next);
      const ok = await checkServerHealth();
      onHealthChange?.(ok);
      if (ok) {
        setHint(t('serverUrl.reachable'));
        setHintOk(true);
        return true;
      }
      setHint(t('serverUrl.savedButDown'));
      return false;
    } catch (e) {
      onHealthChange?.(false);
      setHint(e instanceof Error ? e.message : t('serverUrl.invalid'));
      return false;
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-raid-border bg-raid-surface/50 p-3">
      <Input
        label={t('serverUrl.label')}
        value={url}
        placeholder="http://192.168.1.109:8080"
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const value = e.target.value;
          setUrl(value);
          // Parent should clear "server unreachable" so Sign in is not stuck disabled.
          onChange?.(value);
          onHealthChange?.(false);
          setHint('');
          setHintOk(false);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-raid-text-secondary">
          {t('serverUrl.current')}{' '}
          <span className="text-raid-accent">{getServerUrl() || '—'}</span>
        </p>
        <Button type="button" variant="secondary" disabled={checking} onClick={() => void apply()}>
          {checking ? t('serverUrl.checking') : t('serverUrl.test')}
        </Button>
      </div>
      {hint && (
        <p className={`text-xs ${hintOk ? 'text-raid-success' : 'text-raid-danger'}`}>{hint}</p>
      )}
    </div>
  );
}

/** Validate + persist server URL; use before auth API calls. */
export async function ensureServerUrl(url: string): Promise<void> {
  await persistServerUrl(url);
  const ok = await checkServerHealth();
  if (!ok) {
    const locale = useLocaleStore.getState().locale;
    throw new Error(
      translate(locale, 'serverUrl.unreachable', { url: getServerUrl() || '—' }),
    );
  }
}
