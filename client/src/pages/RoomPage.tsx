import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, LogOut, Send, Trash2, Users } from 'lucide-react';
import { Card, Button, Badge, Input } from '../components/ui';
import { ApiError } from '../services/api';
import { listMedia, type Media } from '../services/media';
import {
  defaultOverlayConfig,
  listPrankHistory,
  sendPrank,
  type OverlayType,
  type PrankHistoryItem,
} from '../services/pranks';
import { deleteRoom, getRoom, leaveRoom } from '../services/rooms';
import { getUserMonitors, type MonitorDescriptor } from '../services/monitors';
import { subscribeRoom, unsubscribeRoom } from '../services/websocket';
import { MonitorCanvas, type PlacementPosition } from '../components/placement/MonitorCanvas';
import { useAuthStore } from '../stores/authStore';
import type { RoomDetail, RoomMember } from '../types/room';

export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [history, setHistory] = useState<PrankHistoryItem[]>([]);
  const [sending, setSending] = useState(false);

  const [overlayType, setOverlayType] = useState<OverlayType>('text');
  const [targetId, setTargetId] = useState<string>('');
  const [textContent, setTextContent] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [durationMs, setDurationMs] = useState(5000);
  const [placement, setPlacement] = useState<PlacementPosition>({
    monitor_index: 0,
    x: 0.5,
    y: 0.5,
  });
  const [targetMonitors, setTargetMonitors] = useState<MonitorDescriptor[]>([]);

  const loadRoom = () => {
    if (!id) return;
    getRoom(id).then(setRoom).catch(() => undefined);
    listPrankHistory(id).then(setHistory).catch(() => undefined);
  };

  useEffect(() => {
    if (!id) return;
    getRoom(id)
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load room'));
    listMedia({ page: 1, limit: 50 }).then((r) => setMediaItems(r.items)).catch(() => undefined);
    listPrankHistory(id).then(setHistory).catch(() => undefined);
    subscribeRoom(id);

    const handler = () => loadRoom();
    window.addEventListener('screenraid:room', handler);
    return () => {
      unsubscribeRoom(id);
      window.removeEventListener('screenraid:room', handler);
    };
  }, [id]);

  useEffect(() => {
    if (!targetId) {
      setTargetMonitors([]);
      return;
    }
    const refresh = () => {
      getUserMonitors(targetId)
        .then((layout) => setTargetMonitors(layout?.monitors ?? []))
        .catch(() => setTargetMonitors([]));
    };
    refresh();
    const onMonitorsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ user_id?: string }>).detail;
      if (detail?.user_id === targetId) {
        refresh();
      }
    };
    window.addEventListener('screenraid:monitors', onMonitorsChanged);
    return () => window.removeEventListener('screenraid:monitors', onMonitorsChanged);
  }, [targetId]);

  const copyCode = () => {
    if (room) {
      navigator.clipboard.writeText(room.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLeave = async () => {
    if (!id) return;
    try {
      await leaveRoom(id);
      navigate('/rooms');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Leave failed');
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteRoom(id);
      navigate('/rooms');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Delete failed');
    }
  };

  const handleSend = async () => {
    if (!id) return;
    setSending(true);
    setError('');
    try {
      const config = defaultOverlayConfig();
      config.position = {
        monitor_index: placement.monitor_index,
        x: placement.x,
        y: placement.y,
        preset: 'exact',
      };
      await sendPrank(id, {
        target_id: targetId || null,
        media_id: overlayType === 'text' ? null : mediaId || null,
        overlay_type: overlayType,
        text_content: overlayType === 'text' ? textContent : null,
        duration_ms: durationMs,
        config,
      });
      setTextContent('');
      listPrankHistory(id).then(setHistory).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  if (!room) {
    return <Card><p className="text-sm text-raid-text-secondary">{error || 'Loading room…'}</p></Card>;
  }

  const myRole = room.members.find((m) => m.user_id === currentUserId)?.role;
  const isOwner = myRole === 'owner';
  const canSend = myRole !== 'guest';
  const otherMembers = room.members.filter((m) => m.user_id !== currentUserId);
  const imageMedia = mediaItems.filter((m) => m.media_type === 'image' || m.media_type === 'gif');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">{room.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <code className="rounded-lg bg-raid-surface px-2 py-1 text-sm text-raid-accent">{room.invite_code}</code>
            <Button variant="ghost" className="!p-2" onClick={copyCode}>
              <Copy size={16} />
            </Button>
            {copied && <span className="text-xs text-raid-success">Copied!</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleLeave}>
            <LogOut size={16} /> Leave
          </Button>
          {isOwner && (
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 size={16} /> Delete
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-raid-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-raid-text">
            <Users size={20} /> Members ({room.members.length}/{room.max_members})
          </h2>
          <div className="divide-y divide-raid-border">
            {room.members.map((m: RoomMember) => (
              <div key={m.user_id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${m.presence === 'online' ? 'bg-raid-success' : 'bg-raid-disabled'}`} />
                  <div>
                    <p className="text-sm font-medium text-raid-text">{m.display_name}</p>
                    <p className="text-xs text-raid-text-secondary">@{m.username}</p>
                  </div>
                </div>
                <Badge variant={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card accentHeader>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Prank composer</h2>
          {!canSend ? (
            <p className="text-sm text-raid-text-secondary">Guests cannot send pranks.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs text-raid-text-secondary">Target</label>
                <select
                  className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">Everyone in room</option>
                  {otherMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                {(['text', 'image'] as OverlayType[]).map((t) => (
                  <Button
                    key={t}
                    variant={overlayType === t ? 'primary' : 'secondary'}
                    onClick={() => setOverlayType(t)}
                  >
                    {t}
                  </Button>
                ))}
              </div>

              {overlayType === 'text' ? (
                <Input
                  label="Message"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Overlay text…"
                />
              ) : (
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">Media</label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={mediaId}
                    onChange={(e) => setMediaId(e.target.value)}
                  >
                    <option value="">Select from library…</option>
                    {imageMedia.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.original_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-raid-text-secondary">
                  Duration: {durationMs / 1000}s
                </label>
                <input
                  type="range"
                  min={1000}
                  max={30000}
                  step={1000}
                  value={durationMs}
                  onChange={(e) => setDurationMs(Number(e.target.value))}
                  className="w-full accent-raid-accent"
                />
              </div>

              {targetId && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-raid-text-secondary">
                    Visual placement
                  </label>
                  <MonitorCanvas
                    monitors={targetMonitors}
                    position={placement}
                    onChange={setPlacement}
                    previewLabel={overlayType === 'text' ? 'TXT' : 'IMG'}
                  />
                </div>
              )}

              <Button disabled={sending} onClick={() => void handleSend()}>
                <Send size={16} />
                {sending ? 'Sending…' : 'Send prank'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Prank history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-raid-text-secondary">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-raid-border">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2 pr-4 capitalize text-raid-text">{h.overlay_type}</td>
                    <td className="py-2 pr-4">
                      <Badge>{h.status}</Badge>
                    </td>
                    <td className="py-2 text-raid-text-secondary">
                      {new Date(h.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
