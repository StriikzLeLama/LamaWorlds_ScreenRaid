import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { Card, Button, Input, Toggle } from '../../components/ui';
import { ReceiveRaidsToggle } from '../../components/ReceiveRaidsToggle';
import { checkServerHealth } from '../../services/api';
import { clearMediaCache } from '../../services/mediaCache';
import { clearLocalSession } from '../../services/session';
import { getServerUrl, setServerUrl } from '../../services/serverConfig';
import { useAuthStore } from '../../stores/authStore';
import { useConsentStore } from '../../stores/consentStore';
import { isTauriRuntime } from '../../lib/platform';
import { log } from '../../lib/log';
import { getMySecurityPrefs, updateMySecurityPrefs } from '../../services/security';
import type { UserSecurityPrefs } from '../../types/security';
import { ANIMATION_OPTIONS, type Animation } from '../../services/pranks';

interface AppSettings {
  autostart: boolean;
  default_duration_ms: number;
  default_volume: number;
  default_animation: string;
  cache_limit_mb: number;
  panic_hotkey: string;
  server_url: string;
  selected_monitor: string;
  soft_mode: boolean;
  max_opacity: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  autostart: false,
  default_duration_ms: 5000,
  default_volume: 0.8,
  default_animation: 'fade',
  cache_limit_mb: 500,
  panic_hotkey: 'Ctrl+Shift+Escape',
  server_url: getServerUrl(),
  selected_monitor: 'primary',
  soft_mode: false,
  max_opacity: 0.55,
};

/** Tauri receiver — server URL, cache, autostart, overlay defaults. */
export function ReceiverSettingsPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const loadConsent = useConsentStore((s) => s.loadFromServer);
  const [securityPrefs, setSecurityPrefs] = useState<UserSecurityPrefs | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);

  useEffect(() => {
    log.info('ReceiverSettingsPage mount, isTauriRuntime=', isTauriRuntime());
    if (isAuthenticated) {
      loadConsent().catch(() => undefined);
      if (accessToken) {
        getMySecurityPrefs(accessToken)
          .then(setSecurityPrefs)
          .catch(() => undefined);
      }
    }
    if (!isTauriRuntime()) {
      log.warn('ReceiverSettingsPage: not in Tauri runtime');
      setLoadError(
        'Receiver settings are only available inside the desktop app. Run "npm run tauri:dev" (or the installed app), not in a browser.',
      );
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    let cancelled = false;
    log.info('ReceiverSettingsPage: invoking get_settings');
    invoke<AppSettings>('get_settings')
      .then((s) => {
        log.info('ReceiverSettingsPage: get_settings ok', s);
        if (!cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...s });
          setLoadError('');
        }
      })
      .catch((e) => {
        log.error('ReceiverSettingsPage: get_settings failed', e);
        if (cancelled) return;
        setLoadError(`Could not load settings: ${e instanceof Error ? e.message : String(e)}`);
        setSettings(DEFAULT_SETTINGS);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, loadConsent, accessToken]);

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
      if (isTauriRuntime()) {
        await invoke('save_settings', { settings: nextSettings });
      }
      setServerUrl(normalized);
      setSettings(nextSettings);

      if (previousUrl !== normalized) {
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
        <h1 className="text-2xl font-bold text-raid-text">Receiver settings</h1>
        <p className="text-sm text-raid-text-secondary">Loading settings…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">Receiver settings</h1>
        <p className="text-sm text-raid-text-secondary">
          Server connection, cache, and overlay defaults for the desktop receiver.
        </p>
      </div>

      {loadError && (
        <Card className="border-raid-warning/40 bg-raid-warning/10">
          <p className="text-sm text-raid-text">{loadError}</p>
        </Card>
      )}
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
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Raids</h2>
          <ReceiveRaidsToggle />
          <div className="mt-4 space-y-3 border-t border-raid-border pt-4">
            <Toggle
              checked={settings.soft_mode}
              onChange={(v) => setSettings({ ...settings, soft_mode: v })}
              label="Mode soft"
              description="Plafonne l’opacité des overlays pour des raids plus discrets."
            />
            {settings.soft_mode && (
              <Input
                label={`Opacité max (${Math.round(settings.max_opacity * 100)}%)`}
                type="number"
                min={0.2}
                max={1}
                step={0.05}
                value={settings.max_opacity}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_opacity: Math.min(1, Math.max(0.2, Number(e.target.value))),
                  })
                }
              />
            )}
          </div>
        </Card>

        {securityPrefs && accessToken && (
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-raid-text">Raid filters</h2>
            <p className="mb-4 text-xs text-raid-text-secondary">
              Synced with your account. Preset: {securityPrefs.preset}
            </p>
            <div className="space-y-3">
              <Toggle
                checked={securityPrefs.allow_sound}
                onChange={(v) => setSecurityPrefs({ ...securityPrefs, allow_sound: v })}
                label="Accept sound raids"
              />
              <Toggle
                checked={securityPrefs.allow_video}
                onChange={(v) => setSecurityPrefs({ ...securityPrefs, allow_video: v })}
                label="Accept video raids"
              />
              <Toggle
                checked={securityPrefs.allow_fullscreen}
                onChange={(v) => setSecurityPrefs({ ...securityPrefs, allow_fullscreen: v })}
                label="Accept fullscreen raids"
              />
              <Input
                label="Local cooldown (ms)"
                type="number"
                min={0}
                max={30000}
                value={securityPrefs.local_cooldown_ms}
                onChange={(e) =>
                  setSecurityPrefs({
                    ...securityPrefs,
                    local_cooldown_ms: Number(e.target.value),
                  })
                }
              />
              <Button
                variant="secondary"
                onClick={() =>
                  void updateMySecurityPrefs(accessToken, {
                    preset: 'custom',
                    allow_sound: securityPrefs.allow_sound,
                    allow_video: securityPrefs.allow_video,
                    allow_fullscreen: securityPrefs.allow_fullscreen,
                    local_cooldown_ms: securityPrefs.local_cooldown_ms,
                  }).then((next) => {
                    setSecurityPrefs(next);
                    setMessage('Raid filters saved.');
                  })
                }
              >
                Save raid filters
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Server</h2>
          <Input
            label="Server URL"
            value={settings.server_url}
            onChange={(e) => setSettings({ ...settings, server_url: e.target.value })}
          />
          <p className="mt-2 text-xs text-raid-text-secondary">
            Web dashboard: {getServerUrl()} — changing URL signs you out.
          </p>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Overlay defaults</h2>
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
            <div>
              <label className="mb-1 block text-xs text-raid-text-secondary">Default animation</label>
              <select
                className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                value={settings.default_animation}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    default_animation: e.target.value as Animation,
                  })
                }
              >
                {ANIMATION_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">System</h2>
          <div className="space-y-4">
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
