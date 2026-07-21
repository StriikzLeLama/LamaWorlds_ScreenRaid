import { useCallback, useEffect, useState } from 'react';
import { Shield, Trash2, UserCheck, UserX, Radio, DoorOpen } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import {
  deactivateUser,
  deleteAdminMedia,
  forceDeleteRoom,
  listAdminAudit,
  listAdminMedia,
  listAdminPresence,
  listAdminRooms,
  listAdminUsers,
  reactivateUser,
  type AdminAuditItem,
  type AdminMediaItem,
  type AdminPresenceUser,
  type AdminRoomItem,
  type AdminUserItem,
} from '../services/admin';
import { formatBytes } from '../services/media';
import { useAuthStore } from '../stores/authStore';

export function AdminPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [media, setMedia] = useState<AdminMediaItem[]>([]);
  const [rooms, setRooms] = useState<AdminRoomItem[]>([]);
  const [online, setOnline] = useState<AdminPresenceUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, mediaRes, roomsRes, presenceRes, auditRes] = await Promise.all([
        listAdminUsers(1, 100),
        listAdminMedia(1, 100),
        listAdminRooms(1, 100),
        listAdminPresence(),
        listAdminAudit(1, 40),
      ]);
      setUsers(usersRes.users);
      setMedia(mediaRes.items);
      setRooms(roomsRes.rooms);
      setOnline(presenceRes.online);
      setAudit(auditRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-raid-text">Admin</h1>
        <Card>
          <p className="text-sm text-raid-text-secondary">
            Your account is not in <code>ADMIN_USERNAMES</code> on the server.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="text-raid-accent" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-raid-text">Admin Panel</h1>
            <p className="text-sm text-raid-text-secondary">
              Users, rooms, live presence, media, audit
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-raid-danger/40 bg-raid-danger/10">
          <p className="text-sm text-raid-danger">{error}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-raid-text">
            <Radio size={18} /> Live ({online.length})
          </h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : online.length === 0 ? (
            <p className="text-sm text-raid-text-secondary">Nobody connected via WebSocket.</p>
          ) : (
            <ul className="space-y-2">
              {online.map((u) => (
                <li
                  key={u.user_id}
                  className="flex justify-between rounded-xl bg-raid-surface px-3 py-2 text-sm"
                >
                  <span className="text-raid-text">
                    {u.display_name} <span className="text-raid-text-secondary">@{u.username}</span>
                  </span>
                  <Badge variant="success">{u.session_count} sess</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Audit récent</h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {audit.map((a) => (
                <li key={a.id} className="border-b border-raid-border pb-2 text-sm last:border-0">
                  <p className="text-raid-text">
                    {a.actor_username ? `@${a.actor_username}` : 'system'} · {a.action}
                  </p>
                  <p className="text-xs text-raid-text-secondary">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-raid-text">
            <DoorOpen size={18} /> Rooms ({rooms.length})
          </h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-raid-surface px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-raid-text">{room.name}</p>
                    <p className="text-xs text-raid-text-secondary">
                      @{room.owner_username} · {room.member_count} members · {room.invite_code}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={room.is_active ? 'success' : 'danger'}>
                      {room.is_active ? 'active' : 'deleted'}
                    </Badge>
                    {room.is_active && (
                      <Button
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          if (!confirm(`Force-delete room "${room.name}"?`)) return;
                          void forceDeleteRoom(room.id)
                            .then(load)
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Delete failed'),
                            );
                        }}
                      >
                        <Trash2 size={14} /> Force delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Users ({users.length})</h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-raid-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-raid-text">
                      {user.display_name}{' '}
                      <span className="text-raid-text-secondary">@{user.username}</span>
                    </p>
                    <p className="truncate text-xs text-raid-text-secondary">{user.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.is_active ? 'success' : 'danger'}>
                      {user.is_active ? 'active' : 'inactive'}
                    </Badge>
                    {user.is_active ? (
                      <Button
                        variant="danger"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          if (!confirm(`Deactivate @${user.username}?`)) return;
                          void deactivateUser(user.id)
                            .then(load)
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Deactivate failed'),
                            );
                        }}
                      >
                        <UserX size={16} />
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          void reactivateUser(user.id)
                            .then(load)
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Reactivate failed'),
                            );
                        }}
                      >
                        <UserCheck size={16} />
                        Reactivate
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Media ({media.length})</h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <div className="space-y-2">
              {media.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-raid-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-raid-text">{item.original_name}</p>
                    <p className="text-xs text-raid-text-secondary">
                      @{item.uploader_username} · {item.media_type} · {formatBytes(item.size_bytes)}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    className="px-3 py-1.5 text-xs"
                    onClick={() => {
                      if (!confirm(`Delete "${item.original_name}"?`)) return;
                      void deleteAdminMedia(item.id)
                        .then(load)
                        .catch((e) =>
                          setError(e instanceof Error ? e.message : 'Delete failed'),
                        );
                    }}
                  >
                    <Trash2 size={16} />
                    Quarantine
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
