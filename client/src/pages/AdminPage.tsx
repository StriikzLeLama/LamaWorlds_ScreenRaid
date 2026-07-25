import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Radio,
  DoorOpen,
  KeyRound,
  LogOut,
  ShieldOff,
  Search,
  Copy,
  RefreshCw,
} from 'lucide-react';
import { Card, Button, Badge, Input } from '../components/ui';
import {
  deactivateUser,
  deleteAdminMedia,
  forceDeleteRoom,
  listAdminAudit,
  listAdminMedia,
  listAdminPresence,
  listAdminRooms,
  listAdminStats,
  listAdminUsers,
  reactivateUser,
  adminSetPassword,
  adminRevokeSessions,
  adminDisable2fa,
  type AdminAuditItem,
  type AdminMediaItem,
  type AdminPresenceUser,
  type AdminRoomItem,
  type AdminStats,
  type AdminUserItem,
} from '../services/admin';
import { formatBytes } from '../services/media';
import { useAuthStore } from '../stores/authStore';
import { generateTempPassword } from '../lib/authErrors';
import { useT } from '../hooks/useT';

type Tab = 'overview' | 'users' | 'rooms' | 'media' | 'audit';

export function AdminPage() {
  const t = useT();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [tab, setTab] = useState<Tab>('overview');
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [media, setMedia] = useState<AdminMediaItem[]>([]);
  const [rooms, setRooms] = useState<AdminRoomItem[]>([]);
  const [online, setOnline] = useState<AdminPresenceUser[]>([]);
  const [audit, setAudit] = useState<AdminAuditItem[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [userQuery, setUserQuery] = useState('');
  const [auditFilter, setAuditFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, mediaRes, roomsRes, presenceRes, auditRes, statsRes] = await Promise.all([
        listAdminUsers(1, 200),
        listAdminMedia(1, 100),
        listAdminRooms(1, 100),
        listAdminPresence(),
        listAdminAudit(1, 80),
        listAdminStats(),
      ]);
      setUsers(usersRes.users);
      setMedia(mediaRes.items);
      setRooms(roomsRes.rooms);
      setOnline(presenceRes.online);
      setAudit(auditRes.items);
      setStats(statsRes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = window.setInterval(() => {
      void listAdminPresence()
        .then((r) => setOnline(r.online))
        .catch(() => undefined);
      void listAdminStats()
        .then(setStats)
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [isAdmin]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, userQuery]);

  const filteredAudit = useMemo(() => {
    const q = auditFilter.trim().toLowerCase();
    if (!q) return audit;
    return audit.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        (a.actor_username ?? '').toLowerCase().includes(q) ||
        JSON.stringify(a.metadata ?? {}).toLowerCase().includes(q),
    );
  }, [audit, auditFilter]);

  const flash = (msg: string) => {
    setOkMsg(msg);
    setError('');
    window.setTimeout(() => setOkMsg(''), 4000);
  };

  const resetPassword = async (user: AdminUserItem) => {
    const generated = generateTempPassword();
    const pwd =
      prompt(
        t('admin.newPasswordPrompt', { user: user.username, generated }),
        generated,
      ) ?? '';
    if (!pwd.trim()) return;
    try {
      await adminSetPassword(user.id, pwd.trim());
      flash(`Password reset @${user.username} → ${pwd.trim()}`);
      await navigator.clipboard.writeText(pwd.trim()).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Password reset failed');
    }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-raid-text">Admin</h1>
        <Card>
          <p className="text-sm text-raid-text-secondary">
            Ton compte n’est pas dans <code>ADMIN_USERNAMES</code> sur le server.
          </p>
        </Card>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: `Users (${users.length})` },
    { id: 'rooms', label: `Rooms (${rooms.length})` },
    { id: 'media', label: `Media (${media.length})` },
    { id: 'audit', label: 'Audit' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Shield className="text-raid-accent" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-raid-text">Admin Panel</h1>
            <p className="text-sm text-raid-text-secondary">
              Ops · users · sessions · audit
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-raid-danger/40 bg-raid-danger/10">
          <p className="text-sm text-raid-danger">{error}</p>
        </Card>
      )}
      {okMsg && (
        <Card className="border-raid-success/40 bg-raid-success/10">
          <p className="text-sm text-raid-success">{okMsg}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-raid-accent text-raid-bg'
                : 'bg-raid-surface text-raid-text-secondary hover:text-raid-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: 'Online', value: stats?.online_count ?? online.length },
            { label: 'Users', value: stats?.users_total ?? users.length },
            { label: 'Active rooms', value: stats?.rooms_active ?? rooms.filter((r) => r.is_active).length },
            { label: 'Media', value: stats?.media_total ?? media.length },
            { label: 'Inactive users', value: stats?.users_inactive ?? '—' },
            { label: 'Login OK 24h', value: stats?.login_success_24h ?? '—' },
            { label: 'Login fail 24h', value: stats?.login_failed_24h ?? '—' },
          ].map((s) => (
            <Card key={s.label}>
              <p className="text-xs text-raid-text-secondary">{s.label}</p>
              <p className="mt-1 text-2xl font-bold text-raid-text">{s.value}</p>
            </Card>
          ))}

          <Card className="col-span-2 lg:col-span-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-raid-text">
              <Radio size={18} /> Live now ({online.length})
            </h2>
            {loading && online.length === 0 ? (
              <p className="text-sm text-raid-text-secondary">Loading…</p>
            ) : online.length === 0 ? (
              <p className="text-sm text-raid-text-secondary">Nobody connected via WebSocket.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {online.map((u) => (
                  <li
                    key={u.user_id}
                    className="flex justify-between rounded-xl bg-raid-surface px-3 py-2 text-sm"
                  >
                    <span className="text-raid-text">
                      {u.display_name}{' '}
                      <span className="text-raid-text-secondary">@{u.username}</span>
                    </span>
                    <Badge variant="success">{u.session_count} sess</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'users' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-raid-text">Users</h2>
            <div className="relative min-w-[200px] flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-raid-text-secondary"
              />
              <input
                className="w-full rounded-xl border border-raid-border bg-raid-card py-2 pl-9 pr-3 text-sm text-raid-text"
                placeholder="Search username, name, email…"
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
            </div>
          </div>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const isOnline = online.some((o) => o.user_id === user.id);
                return (
                  <div
                    key={user.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-raid-surface px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-raid-text">
                        {user.display_name}{' '}
                        <span className="text-raid-text-secondary">@{user.username}</span>
                        {isOnline && (
                          <span className="ml-2">
                            <Badge variant="success">online</Badge>
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-raid-text-secondary">
                        {user.email} · since {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={user.is_active ? 'success' : 'danger'}>
                        {user.is_active ? 'active' : 'inactive'}
                      </Badge>
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => void resetPassword(user)}
                        title="Reset password"
                      >
                        <KeyRound size={14} /> Reset pwd
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          if (!confirm(`Revoke all sessions for @${user.username}?`)) return;
                          void adminRevokeSessions(user.id)
                            .then(() => flash(`Sessions revoked @${user.username}`))
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Revoke failed'),
                            );
                        }}
                      >
                        <LogOut size={14} /> Kick sessions
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-1.5 text-xs"
                        onClick={() => {
                          if (!confirm(`Disable 2FA for @${user.username}?`)) return;
                          void adminDisable2fa(user.id)
                            .then(() => flash(`2FA disabled @${user.username}`))
                            .catch((e) =>
                              setError(e instanceof Error ? e.message : 'Disable 2FA failed'),
                            );
                        }}
                      >
                        <ShieldOff size={14} /> Disable 2FA
                      </Button>
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
                          <UserX size={14} /> Deactivate
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
                          <UserCheck size={14} /> Reactivate
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'rooms' && (
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-raid-text">
            <DoorOpen size={18} /> Rooms
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
                      @{room.owner_username} · {room.member_count} members ·{' '}
                      <code className="text-raid-accent">{room.invite_code}</code>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={room.is_active ? 'success' : 'danger'}>
                      {room.is_active ? 'active' : 'deleted'}
                    </Badge>
                    <Button
                      variant="ghost"
                      className="px-3 py-1.5 text-xs"
                      onClick={() =>
                        void navigator.clipboard.writeText(room.invite_code).then(() =>
                          flash(`Copied ${room.invite_code}`),
                        )
                      }
                    >
                      <Copy size={14} /> Code
                    </Button>
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
      )}

      {tab === 'media' && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Media quarantine</h2>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : media.length === 0 ? (
            <p className="text-sm text-raid-text-secondary">No media.</p>
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
                    <Trash2 size={16} /> Quarantine
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-raid-text">Audit</h2>
            <Input
              placeholder="Filter action / user / reason…"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {loading ? (
            <p className="text-sm text-raid-text-secondary">Loading…</p>
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
              {filteredAudit.map((a) => {
                const reason =
                  a.metadata && typeof a.metadata.reason === 'string'
                    ? String(a.metadata.reason)
                    : null;
                return (
                  <li
                    key={a.id}
                    className="border-b border-raid-border pb-2 text-sm last:border-0"
                  >
                    <p className="text-raid-text">
                      {a.actor_username ? `@${a.actor_username}` : 'system'} · {a.action}
                      {reason && (
                        <span className="ml-2 inline-block">
                          <Badge
                            variant={
                              reason === 'bad_password' || reason === 'unknown_user'
                                ? 'danger'
                                : 'neutral'
                            }
                          >
                            {reason}
                          </Badge>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-raid-text-secondary">
                      {new Date(a.created_at).toLocaleString()}
                      {a.ip_address ? ` · ${a.ip_address}` : ''}
                    </p>
                    {a.metadata && (
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-raid-surface px-2 py-1 text-[10px] text-raid-text-secondary">
                        {JSON.stringify(a.metadata)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
