import { useCallback, useEffect, useState } from 'react';
import { Shield, Trash2, UserX } from 'lucide-react';
import { Card, Button, Badge } from '../components/ui';
import {
  deactivateUser,
  deleteAdminMedia,
  listAdminMedia,
  listAdminUsers,
  type AdminMediaItem,
  type AdminUserItem,
} from '../services/admin';
import { formatBytes } from '../services/media';
import { useAuthStore } from '../stores/authStore';

export function AdminPage() {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [media, setMedia] = useState<AdminMediaItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, mediaRes] = await Promise.all([
        listAdminUsers(1, 100),
        listAdminMedia(1, 100),
      ]);
      setUsers(usersRes.users);
      setMedia(mediaRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void load();
    }
  }, [isAdmin, load]);

  const handleDeactivate = async (user: AdminUserItem) => {
    if (!confirm(`Deactivate @${user.username}?`)) return;
    try {
      await deactivateUser(user.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  };

  const handleDeleteMedia = async (item: AdminMediaItem) => {
    if (!confirm(`Delete "${item.original_name}"?`)) return;
    try {
      await deleteAdminMedia(item.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

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
      <div className="flex items-center gap-3">
        <Shield className="text-raid-accent" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Admin Panel</h1>
          <p className="text-sm text-raid-text-secondary">Moderate users and uploaded media</p>
        </div>
      </div>

      {error && (
        <Card className="border-raid-danger/40 bg-raid-danger/10">
          <p className="text-sm text-raid-danger">{error}</p>
        </Card>
      )}

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
                  {user.is_active && (
                    <Button
                      variant="danger"
                      className="px-3 py-1.5 text-xs"
                      onClick={() => void handleDeactivate(user)}
                    >
                      <UserX size={16} />
                      Deactivate
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
                  onClick={() => void handleDeleteMedia(item)}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
