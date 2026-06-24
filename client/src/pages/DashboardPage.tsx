import { useEffect, useState } from 'react';
import { Activity, DoorOpen, Users, Zap } from 'lucide-react';
import { Card, Badge } from '../components/ui';
import { checkServerHealth } from '../services/api';
import { listFriends } from '../services/friends';
import { listRooms } from '../services/rooms';
import { useConsentStore } from '../stores/consentStore';

export function DashboardPage() {
  const [serverOk, setServerOk] = useState(false);
  const [roomCount, setRoomCount] = useState(0);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const { globalConsent, isPaused } = useConsentStore();

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
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Dashboard</h1>
          <p className="text-sm text-raid-text-secondary">Overview of your ScreenRaid activity</p>
        </div>
        <div className="flex gap-2">
          {isPaused ? (
            <Badge variant="warning">Paused</Badge>
          ) : globalConsent ? (
            <Badge variant="success">Receiving</Badge>
          ) : (
            <Badge variant="neutral">Not consented</Badge>
          )}
        </div>
      </div>

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
            <li>• Grant consent to receive overlays</li>
            <li>• Upload media to your library</li>
            <li>• Use Panic to hide all overlays instantly</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
