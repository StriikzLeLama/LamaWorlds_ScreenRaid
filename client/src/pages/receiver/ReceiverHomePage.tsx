import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ExternalLink, ShieldAlert, Wifi, WifiOff } from 'lucide-react';
import { Card, Button, Badge } from '../../components/ui';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { getServerUrl } from '../../services/serverConfig';
import { useConsentStore } from '../../stores/consentStore';
import { useAuthStore } from '../../stores/authStore';
import { useWsConnection } from '../../hooks/useWsConnection';
import { isTauriRuntime } from '../../lib/platform';
import { log } from '../../lib/log';

export function ReceiverHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const wsConnected = useWsConnection();
  const { globalConsent, isPaused, grant, revoke, resume, pause } = useConsentStore();
  const [webUrl, setWebUrl] = useState(getServerUrl());
  const [statusMsg, setStatusMsg] = useState('');
  const inTauri = isTauriRuntime();

  useEffect(() => {
    setWebUrl(getServerUrl());
    log.info('ReceiverHomePage mount', {
      inTauri,
      wsConnected,
      globalConsent,
      isPaused,
      serverUrl: getServerUrl(),
    });
  }, []);

  const handlePanic = async () => {
    setStatusMsg('');
    log.info('panic button clicked');
    try {
      await invoke('panic_hide_all');
      log.info('panic_hide_all ok');
      await pause();
      setStatusMsg('Panic triggered — all overlays hidden.');
    } catch (e) {
      log.error('panic_hide_all failed', e);
      setStatusMsg(`Panic failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handleConsent = async (action: 'grant' | 'revoke' | 'resume') => {
    setStatusMsg('');
    log.info('consent action', action);
    try {
      if (action === 'grant') await grant();
      if (action === 'revoke') await revoke();
      if (action === 'resume') await resume();
    } catch (e) {
      log.error('consent failed', e);
      setStatusMsg(`Consent update failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const handleTestOverlay = async () => {
    setStatusMsg('');
    log.info('test overlay button clicked, inTauri=', inTauri);
    try {
      // Ensure consent is on so a follow-up real prank also works.
      if (!globalConsent) {
        await grant().catch(() => undefined);
      }
      if (isPaused) {
        await resume().catch(() => undefined);
      }

      await invoke('show_overlay', {
        payload: {
          id: `test-overlay-${Date.now()}`,
          overlay_type: 'text',
          media_url: null,
          local_path: null,
          text: 'ScreenRaid OK — overlays work!',
          duration_ms: 8000,
          animation: 'bounce',
          sender_name: 'Test',
          monitor_index: 0,
          position_x: 0.5,
          position_y: 0.5,
          scale: 1.15,
          opacity: 1,
          volume: 0.8,
        },
      });
      log.info('test overlay invoke ok');
      setStatusMsg(
        'Test overlay sent for 8s — look at the center of your primary screen. If nothing appears, check the tauri:dev terminal for [overlay] / [SR] logs.',
      );
    } catch (e) {
      log.error('test overlay invoke failed', e);
      setStatusMsg(`Test overlay failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">ScreenRaid Receiver</h1>
        <p className="text-sm text-raid-text-secondary">
          This app displays overlays on your screen. Manage rooms and send pranks in the web dashboard.
        </p>
      </div>

      {!inTauri && (
        <Card className="border-raid-warning/40 bg-raid-warning/10">
          <p className="text-sm text-raid-text">
            <strong>Browser mode detected.</strong> Overlays and the panic button only work inside the
            desktop receiver. Stop the Vite dev server and run{' '}
            <code className="text-raid-accent">npm run tauri:dev</code> to launch the real app window.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-raid-text-secondary">Live connection</p>
              <p className="mt-1 text-lg font-semibold text-raid-text">
                {wsConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            {wsConnected ? (
              <Wifi className="text-raid-success" size={24} />
            ) : (
              <WifiOff className="text-raid-warning" size={24} />
            )}
          </div>
          {!wsConnected && (
            <p className="mt-3 text-xs text-raid-text-secondary">
              Check server URL in Settings, then sign out and sign in again.
            </p>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-raid-text-secondary">Receiving overlays</p>
              <p className="mt-1 text-lg font-semibold text-raid-text">
                {isPaused ? 'Paused' : globalConsent ? 'Active' : 'Not consented'}
              </p>
            </div>
            <Activity className="text-raid-accent" size={24} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!globalConsent ? (
              <Button className="text-xs" onClick={() => void handleConsent('grant')}>
                Grant consent
              </Button>
            ) : (
              <Button variant="secondary" className="text-xs" onClick={() => void handleConsent('revoke')}>
                Revoke
              </Button>
            )}
            {isPaused && (
              <Button variant="secondary" className="text-xs" onClick={() => void handleConsent('resume')}>
                Resume
              </Button>
            )}
          </div>
        </Card>
      </div>

      <Card accentHeader>
        <h2 className="mb-2 text-lg font-semibold text-raid-text">Web dashboard</h2>
        <p className="mb-4 text-sm text-raid-text-secondary">
          Create rooms, upload media, and send pranks from your browser — signed in as{' '}
          <strong>@{user?.username}</strong>.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded-lg bg-raid-surface px-2 py-1 text-sm text-raid-accent">{webUrl}</code>
          <Button variant="secondary" onClick={() => void open(webUrl).catch(() => undefined)}>
            <ExternalLink size={16} />
            Open dashboard
          </Button>
        </div>
      </Card>

      {statusMsg && (
        <p className="rounded-xl border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text-secondary">
          {statusMsg}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="danger" onClick={() => void handlePanic()} disabled={!inTauri}>
          <ShieldAlert size={18} />
          Panic — hide all overlays
        </Button>
        <Button variant="secondary" onClick={() => void handleTestOverlay()} disabled={!inTauri}>
          Test overlay
        </Button>
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          Receiver settings
        </Button>
      </div>

      <div className="flex gap-2">
        {wsConnected ? <Badge variant="success">Live</Badge> : <Badge variant="warning">WS offline</Badge>}
        {globalConsent && !isPaused ? (
          <Badge variant="success">Ready to receive</Badge>
        ) : (
          <Badge variant="neutral">Not receiving</Badge>
        )}
      </div>
    </div>
  );
}
