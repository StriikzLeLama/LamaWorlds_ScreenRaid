import { useEffect, useState } from 'react';
import { Activity, DoorOpen, Users, Wifi, WifiOff, Zap } from 'lucide-react';
import { Card, Badge, Button } from '../components/ui';
import { checkServerHealth } from '../services/api';
import { listFriends } from '../services/friends';
import { listRooms } from '../services/rooms';
import { defaultOverlayConfig, selfTestPrank } from '../services/pranks';
import { useConsentStore } from '../stores/consentStore';
import { WsLatencyBadge } from '../components/WsLatencyBadge';
import { useWsConnection } from '../hooks/useWsConnection';
import { isTauriRuntime } from '../lib/platform';

export function DashboardPage() {
  const [serverOk, setServerOk] = useState(false);
  const [roomCount, setRoomCount] = useState(0);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const [selfTestMsg, setSelfTestMsg] = useState('');
  const [selfTesting, setSelfTesting] = useState(false);
  const { globalConsent, isPaused } = useConsentStore();
  const { connected: wsConnected, rttMs } = useWsConnection();

  useEffect(() => {
    checkServerHealth().then(setServerOk);
    listRooms().then((r) => setRoomCount(r.rooms.length)).catch(() => undefined);
    listFriends()
      .then((f) => setFriendsOnline(f.friends.filter((x) => x.status === 'online').length))
      .catch(() => undefined);
  }, []);

  const runSelfTest = async () => {
    setSelfTesting(true);
    setSelfTestMsg('');
    try {
      await selfTestPrank({
        media_id: null,
        overlay_type: 'text',
        text_content: 'Self-test OK — no room needed',
        duration_ms: 4000,
        config: {
          ...defaultOverlayConfig(),
          animation: 'pop',
          sfx: 'pop',
        },
      });
      setSelfTestMsg(
        isTauriRuntime()
          ? 'Sent — check your screen overlay (receiver must be running).'
          : 'Sent via WebSocket. Open the desktop receiver to see the overlay.',
      );
    } catch (e) {
      setSelfTestMsg(e instanceof Error ? e.message : 'Self-test failed');
    } finally {
      setSelfTesting(false);
    }
  };

  const displayStats = [
    { label: 'Active Rooms', value: String(roomCount), icon: DoorOpen },
    { label: 'Friends Online', value: String(friendsOnline), icon: Users },
    { label: 'Pranks Today', value: '0', icon: Zap },
    { label: 'Server Status', value: serverOk ? 'Online' : 'Offline', icon: Activity },
    {
      label: 'Live Connection',
      value: wsConnected ? (rttMs != null ? `${rttMs}ms` : 'Connected') : 'Disconnected',
      icon: wsConnected ? Wifi : WifiOff,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Dashboard</h1>
          <p className="text-sm text-raid-text-secondary">Overview of your ScreenRaid activity</p>
        </div>
        <div className="flex gap-2">
          <WsLatencyBadge />
          {isPaused ? (
            <Badge variant="warning">Paused</Badge>
          ) : globalConsent ? (
            <Badge variant="success">Receiving</Badge>
          ) : (
            <Badge variant="neutral">Not consented</Badge>
          )}
        </div>
      </div>

      <Card accentHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-raid-text">Test on yourself</h2>
            <p className="text-sm text-raid-text-secondary">
              Send a quick overlay to your own receiver — no room required.
            </p>
          </div>
          <Button onClick={() => void runSelfTest()} disabled={selfTesting || !wsConnected}>
            {selfTesting ? 'Sending…' : 'Self-test overlay'}
          </Button>
        </div>
        {!wsConnected && (
          <p className="mt-2 text-xs text-raid-warning">
            Connect WebSocket first (sign in again if needed).
          </p>
        )}
        {selfTestMsg && <p className="mt-2 text-sm text-raid-text-secondary">{selfTestMsg}</p>}
      </Card>

      {(!wsConnected || !globalConsent || isPaused) && (
        <Card className="border-raid-warning/40 bg-raid-warning/10">
          <p className="text-sm text-raid-text">
            {!wsConnected && (
              <>
                <strong>WebSocket disconnected</strong> — overlays will not appear until the live
                connection is restored. Try logging out and back in after a server rebuild.
              </>
            )}
            {!wsConnected && (!globalConsent || isPaused) && ' '}
            {!globalConsent && (
              <>
                <strong>Consent not granted</strong> — go to Settings and enable receiving overlays
                (self-test still works without consent).
              </>
            )}
            {globalConsent && isPaused && (
              <>
                <strong>Receiving paused</strong> — resume in Settings to see pranks from others
                (self-test still works).
              </>
            )}
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {displayStats.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-raid-text-secondary">{label}</p>
                <p className="mt-1 text-2xl font-bold text-raid-text">{value}</p>
              </div>
              <Icon className="text-raid-accent" size={22} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
