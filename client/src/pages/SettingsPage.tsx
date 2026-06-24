import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Card, Button, Input } from '../components/ui';
import { setServerUrl } from '../services/serverConfig';
import { useConsentStore } from '../stores/consentStore';

interface AppSettings {
  autostart: boolean;
  default_duration_ms: number;
  default_volume: number;
  server_url: string;
  cache_limit_mb: number;
}

export function SettingsPage() {
  const { globalConsent, isPaused, grant, revoke, resume, loadFromServer } = useConsentStore();
  const [settings, setSettings] = useState<AppSettings>({
    autostart: false,
    default_duration_ms: 5000,
    default_volume: 0.8,
    server_url: 'http://localhost:8080',
    cache_limit_mb: 500,
  });

  useEffect(() => {
    loadFromServer().catch(() => undefined);
    invoke<AppSettings>('get_settings')
      .then(setSettings)
      .catch(() => undefined);
  }, [loadFromServer]);

  const save = async () => {
    await invoke('save_settings', { settings });
    setServerUrl(settings.server_url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">Settings</h1>
        <p className="text-sm text-raid-text-secondary">Configure your ScreenRaid client</p>
      </div>

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
              Example: http://192.168.1.109:8080 — restart app after changing if connection fails.
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
          <Button variant="secondary">Clear Cache</Button>
        </Card>
      </div>

      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
