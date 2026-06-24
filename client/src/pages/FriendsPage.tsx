import { useCallback, useEffect, useState } from 'react';
import { UserPlus, UserCheck, UserX } from 'lucide-react';
import { Card, Button, Input, Badge } from '../components/ui';
import { ApiError } from '../services/api';
import {
  acceptFriendRequest,
  declineFriendRequest,
  listFriendRequests,
  listFriends,
  sendFriendRequest,
} from '../services/friends';
import type { FriendRequestItem, FriendSummary } from '../types/friend';

export function FriendsPage() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([listFriends(), listFriendRequests()]);
      setFriends(f.friends);
      setIncoming(r.incoming);
      setOutgoing(r.outgoing);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('screenraid:friends', handler);
    return () => window.removeEventListener('screenraid:friends', handler);
  }, [load]);

  const handleSend = async () => {
    try {
      await sendFriendRequest(userId.trim());
      setUserId('');
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Request failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">Friends</h1>
          <p className="text-sm text-raid-text-secondary">Manage your connections</p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-raid-danger/30 bg-raid-danger/10 px-3 py-2 text-sm text-raid-danger">{error}</p>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-raid-text">Add friend by user ID</h2>
        <div className="flex gap-2">
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="User UUID" className="flex-1 font-mono text-xs" />
          <Button onClick={handleSend} disabled={!userId.trim()}>
            <UserPlus size={18} /> Send
          </Button>
        </div>
      </Card>

      {incoming.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-raid-text">Incoming requests</h2>
          <div className="space-y-3">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-raid-surface px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-raid-text">{r.user.display_name}</p>
                  <p className="text-xs text-raid-text-secondary">@{r.user.username}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="!px-3" onClick={() => acceptFriendRequest(r.id).then(load)}>
                    <UserCheck size={16} />
                  </Button>
                  <Button variant="ghost" className="!px-3" onClick={() => declineFriendRequest(r.id).then(load)}>
                    <UserX size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-raid-text">
          Friends {loading ? '' : `(${friends.length})`}
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-raid-text-secondary">No friends yet.</p>
        ) : (
          <div className="divide-y divide-raid-border">
            {friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${f.status === 'online' ? 'bg-raid-success' : 'bg-raid-disabled'}`} />
                  <div>
                    <p className="text-sm font-medium text-raid-text">{f.display_name}</p>
                    <p className="text-xs text-raid-text-secondary">@{f.username}</p>
                  </div>
                </div>
                <Badge variant={f.status === 'online' ? 'success' : 'neutral'}>{f.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {outgoing.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-raid-text">Pending sent</h2>
          {outgoing.map((r) => (
            <p key={r.id} className="text-sm text-raid-text-secondary">@{r.user.username} — pending</p>
          ))}
        </Card>
      )}
    </div>
  );
}
