import { useEffect, useState } from 'react';
import { Activity, DoorOpen, Users, Wifi, WifiOff, Zap } from 'lucide-react';
import { Card, Badge } from '../components/ui';
import { checkServerHealth } from '../services/api';
import { listFriends } from '../services/friends';
import { listRooms } from '../services/rooms';
import { useConsentStore } from '../stores/consentStore';
import { useWsConnection } from '../hooks/useWsConnection';

export function DashboardPage() {
  const [serverOk, setServerOk] = useState(false);
  const [roomCount, setRoomCount] = useState(0);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const { globalConsent, isPaused } = useConsentStore();
  const wsConnected = useWsConnection();

  useEffect(() => {
    checkServerHealth().then(setServerOk);
    listRooms().then((r) => setRoomCount(r.rooms.length)).catch(() => undefined);
    listFriends()
      .then((f) => setFriendsOnline(f.friends.filter((x) => x.status === 'online').length))
      .catch(() => undefined);
  }, []);

  const displayStats = [
    { label: 'Active Rooms', value: String(roomCount), icon: DoorOpen },
    { label: 'Friends Online', value: String(friendsOnline), icon: Users },
    { label: 'Pranks Today', value: '0', icon: Zap },
    { label: 'Server Status', value: serverOk ? 'Online' : 'Offline', icon: Activity },
    { label: 'Live Connection', value: wsConnected ? 'Connected' : 'Disconnected', icon: wsConnected ? Wifi : WifiOff },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Dashboard</h1>
          <p className="text-sm text-raid-text-secondary">Overview of your ScreenRaid activity</p>
        </div>
        <div className="flex gap-2">
          {wsConnected ? (
            <Badge variant="success">Live</Badge>
          ) : (
            <Badge variant="warning">WS offline</Badge>
          )}
          {isPaused ? (
            <Badge variant="warning">Paused</Badge>
          ) : globalConsent ? (
            <Badge variant="success">Receiving</Badge>
          ) : (
            <Badge variant="neutral">Not consented</Badge>
          )}
        </div>
      </div>

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
                <strong>Consent not granted</strong> — go to Settings and enable receiving overlays.
              </>
            )}
            {globalConsent && isPaused && (
              <>
                <strong>Receiving paused</strong> — resume in Settings to see pranks.
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
              <div className="rounded-xl bg-raid-surface p-2.5">
                <Icon size={20} className="text-raid-accent" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Recent Pranks</h2>
          <p className="text-sm text-raid-text-secondary">
            No pranks yet. Join a room and send your first overlay.
          </p>
        </Card>
        <Card accentHeader>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Quick Actions</h2>
          <ul className="space-y-2 text-sm text-raid-text-secondary">
            <li>• Create or join a private room</li>
            <li>• Grant consent (web or desktop receiver)</li>
            <li>• Upload media to your library</li>
            <li>• Run the ScreenRaid Receiver app on your PC to display overlays</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
