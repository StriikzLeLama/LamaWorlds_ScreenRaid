import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Card, Button, Input } from '../components/ui';
import { checkServerHealth } from '../services/api';
import { clearMediaCache } from '../services/mediaCache';
import { clearLocalSession } from '../services/session';
import { getServerUrl, setServerUrl } from '../services/serverConfig';
import { useConsentStore } from '../stores/consentStore';
import { useAuthStore } from '../stores/authStore';

interface AppSettings {
  autostart: boolean;
  default_duration_ms: number;
  default_volume: number;
  default_animation: string;
  cache_limit_mb: number;
  panic_hotkey: string;
  server_url: string;
  selected_monitor: string;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { globalConsent, isPaused, grant, revoke, resume, loadFromServer } = useConsentStore();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer().catch(() => undefined);
    }
    invoke<AppSettings>('get_settings')
      .then(setSettings)
      .catch(() => setSettings(null));
  }, [loadFromServer, isAuthenticated]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const previousUrl = getServerUrl();
      const normalized = settings.server_url.trim().replace(/\/$/, '');
      if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
        setError('Server URL must start with http:// or https://');
        return;
      }

      const nextSettings = { ...settings, server_url: normalized };
      await invoke('save_settings', { settings: nextSettings });
      setServerUrl(normalized);
      setSettings(nextSettings);

      const urlChanged = previousUrl !== normalized;
      if (urlChanged) {
        clearLocalSession();
        setMessage('Server URL updated. Sign in again to connect to the new server.');
        navigate('/login', { replace: true });
        return;
      }

      const ok = await checkServerHealth();
      setMessage(ok ? 'Settings saved. Server is reachable.' : 'Settings saved, but server is unreachable.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const clearCache = async () => {
    setCacheClearing(true);
    setError('');
    try {
      const removed = await clearMediaCache();
      setMessage(`Cache cleared (${removed} file${removed === 1 ? '' : 's'} removed).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear cache');
    } finally {
      setCacheClearing(false);
    }
  };

  if (!settings) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-raid-text">Settings</h1>
        <p className="text-sm text-raid-text-secondary">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">Settings</h1>
        <p className="text-sm text-raid-text-secondary">Configure your ScreenRaid client</p>
      </div>

      {error && (
        <Card className="border-raid-danger/40 bg-raid-danger/10">
          <p className="text-sm text-raid-danger">{error}</p>
        </Card>
      )}
      {message && (
        <Card className="border-raid-success/40 bg-raid-success/10">
          <p className="text-sm text-raid-success">{message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Consent</h2>
          <p className="mb-4 text-sm text-raid-text-secondary">
            You must grant consent before receiving overlays from friends.
          </p>
          <div className="flex flex-wrap gap-3">
            {!globalConsent ? (
              <Button onClick={() => void grant()}>Grant Consent</Button>
            ) : (
              <Button variant="secondary" onClick={() => void revoke()}>
                Revoke Consent
              </Button>
            )}
            {isPaused && (
              <Button variant="secondary" onClick={() => void resume()}>
                Resume Receiving
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Overlay Defaults</h2>
          <div className="space-y-4">
            <Input
              label="Default duration (ms)"
              type="number"
              value={settings.default_duration_ms}
              onChange={(e) =>
                setSettings({ ...settings, default_duration_ms: Number(e.target.value) })
              }
            />
            <Input
              label="Default volume (0–1)"
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={settings.default_volume}
              onChange={(e) =>
                setSettings({ ...settings, default_volume: Number(e.target.value) })
              }
            />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">System</h2>
          <div className="space-y-4">
            <Input
              label="Server URL"
              value={settings.server_url}
              onChange={(e) => setSettings({ ...settings, server_url: e.target.value })}
            />
            <p className="text-xs text-raid-text-secondary">
              Current: {getServerUrl()} — changing URL signs you out and requires login again.
            </p>
            <Input
              label="Cache limit (MB)"
              type="number"
              value={settings.cache_limit_mb}
              onChange={(e) =>
                setSettings({ ...settings, cache_limit_mb: Number(e.target.value) })
              }
            />
            <label className="flex items-center gap-3 text-sm text-raid-text">
              <input
                type="checkbox"
                checked={settings.autostart}
                onChange={(e) => setSettings({ ...settings, autostart: e.target.checked })}
                className="h-4 w-4 rounded border-raid-border accent-raid-accent"
              />
              Start with Windows
            </label>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Cache</h2>
          <p className="mb-4 text-sm text-raid-text-secondary">
            Local media cache for faster overlay rendering.
          </p>
          <Button variant="secondary" disabled={cacheClearing} onClick={() => void clearCache()}>
            {cacheClearing ? 'Clearing…' : 'Clear Cache'}
          </Button>
        </Card>
      </div>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}
