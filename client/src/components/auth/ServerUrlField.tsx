import { useEffect, useState } from 'react';
import { Button, Input } from './ui';
import { checkServerHealth } from '../services/api';
import { getServerUrl, persistServerUrl } from '../services/serverConfig';

interface Props {
  /** Called after URL is saved (e.g. before login submit). */
  onChange?: (url: string) => void;
}

export function ServerUrlField({ onChange }: Props) {
  const [url, setUrl] = useState(getServerUrl());
  const [hint, setHint] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    setUrl(getServerUrl());
  }, []);

  const apply = async (): Promise<boolean> => {
    setChecking(true);
    setHint('');
    try {
      const next = await persistServerUrl(url);
      setUrl(next);
      onChange?.(next);
      const ok = await checkServerHealth();
      if (ok) {
        setHint('Server reachable');
        return true;
      }
      setHint('URL saved, but server is not responding — check IP and that Docker is running.');
      return false;
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Invalid server URL');
      return false;
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-raid-border bg-raid-surface/50 p-3">
      <Input
        label="Server URL"
        value={url}
        onChange={(e) => {
          const value = e.target.value;
          setUrl(value);
          onChange?.(value);
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-raid-text-secondary">
          Current: <span className="text-raid-accent">{getServerUrl()}</span>
        </p>
        <Button type="button" variant="secondary" disabled={checking} onClick={() => void apply()}>
          {checking ? 'Checking…' : 'Test'}
        </Button>
      </div>
      {hint && (
        <p
          className={`text-xs ${hint.includes('reachable') ? 'text-raid-success' : 'text-raid-danger'}`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/** Validate + persist server URL; use before auth API calls. */
export async function ensureServerUrl(url: string): Promise<void> {
  await persistServerUrl(url);
  const ok = await checkServerHealth();
  if (!ok) {
    throw new Error(
      `Cannot reach server at ${getServerUrl()}. Use Test on the Server URL field (is Docker running on the CT?).`,
    );
  }
}
