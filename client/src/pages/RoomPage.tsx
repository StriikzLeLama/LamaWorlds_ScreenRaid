import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LogOut, Send, Trash2, Clock } from 'lucide-react';
import { Card, Button, Badge, Input } from '../components/ui';
import { GifSelector } from '../components/GifSelector';
import { AnimationPreview } from '../components/AnimationPreview';
import { MediaPicker } from '../components/MediaPicker';
import { MediaThumb } from '../components/MediaThumb';
import { ApiError } from '../services/api';
import { listMedia, type Media } from '../services/media';
import {
  ANIMATION_OPTIONS,
  defaultOverlayConfig,
  listPrankHistory,
  sendPrank,
  type Animation,
  type OverlayConfig,
  type OverlayType,
  type PrankHistoryItem,
} from '../services/pranks';
import {
  deleteRoom,
  getRoom,
  leaveRoom,
} from '../services/rooms';
import { getUserMonitors, type MonitorDescriptor } from '../services/monitors';
import { subscribeRoom, unsubscribeRoom } from '../services/websocket';
import { MonitorCanvas, type PlacementPosition } from '../components/placement/MonitorCanvas';
import { RAID_PACKS, type RaidPack } from '../lib/raidPacks';
import { RoomSecurityPanel } from '../components/settings/RoomSecurityPanel';
import { RoomMembersPanel } from '../components/room/RoomMembersPanel';
import {
  deleteRaidTemplate,
  loadRaidTemplates,
  saveRaidTemplate,
  type RaidTemplate,
} from '../services/raidTemplates';
import {
  cancelScheduled,
  listScheduled,
  schedulePrank,
  type ScheduledPrankItem,
} from '../services/scheduled';
import { listRoomActivity, type ActivityItem } from '../services/activity';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { useWsConnection } from '../hooks/useWsConnection';
import { isTauriRuntime } from '../lib/platform';
import { MOTION_OPTIONS, type MotionPreset } from '../lib/cursorMotion';
import type { RoomDetail } from '../types/room';
import type { MediaType } from '../types';

const OVERLAY_TYPES: OverlayType[] = ['text', 'image', 'gif', 'video', 'sound'];

type SfxOption = NonNullable<OverlayConfig['sfx']>;

const SFX_OPTIONS: { value: SfxOption; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'pop', label: 'Pop' },
  { value: 'whoosh', label: 'Whoosh' },
];

const TEXT_COLOR_PRESETS = [
  { value: '#f1f5f9', label: 'Blanc' },
  { value: '#ffffff', label: 'Blanc pur' },
  { value: '#2dd4bf', label: 'Teal' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#7dd3fc', label: 'Cyan' },
];

const BG_COLOR_PRESETS = [
  { value: 'rgba(11,17,29,0.94)', label: 'Navy' },
  { value: 'rgba(0,0,0,0.85)', label: 'Noir' },
  { value: 'rgba(45,212,191,0.88)', label: 'Teal' },
  { value: 'rgba(30,58,138,0.92)', label: 'Bleu' },
  { value: 'rgba(245,158,11,0.9)', label: 'Ambre' },
];

const ACCENT_COLOR_PRESETS = [
  { value: '#2dd4bf', label: 'Teal' },
  { value: '#f59e0b', label: 'Ambre' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#7dd3fc', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ef4444', label: 'Rouge' },
];

const FONT_FAMILY_PRESETS = [
  { value: 'system-ui, sans-serif', label: 'Système' },
  { value: 'Georgia, serif', label: 'Serif' },
  { value: 'ui-monospace, monospace', label: 'Mono' },
  { value: '"Segoe UI", sans-serif', label: 'Segoe' },
  { value: 'Impact, sans-serif', label: 'Impact' },
];

function mediaForOverlay(type: OverlayType, items: Media[]): Media[] {
  const map: Partial<Record<OverlayType, MediaType>> = {
    image: 'image',
    gif: 'gif',
    video: 'video',
    sound: 'audio',
  };
  const wanted = map[type];
  if (!wanted) return [];
  if (type === 'gif') {
    return items.filter((m) => m.media_type === 'gif' || m.media_type === 'image');
  }
  return items.filter((m) => m.media_type === wanted);
}

function previewLabel(type: OverlayType): string {
  if (type === 'text') return 'TXT';
  if (type === 'sound') return 'SND';
  if (type === 'video') return 'VID';
  if (type === 'gif') return 'GIF';
  return 'IMG';
}

function randomBombCoord(): number {
  return 0.2 + Math.random() * 0.6;
}

export function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { globalConsent, isPaused } = useConsentStore();
  const wsConnected = useWsConnection();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [error, setError] = useState('');
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [history, setHistory] = useState<PrankHistoryItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledPrankItem[]>([]);
  const [templates, setTemplates] = useState<RaidTemplate[]>([]);
  const [sending, setSending] = useState(false);
  const [gifSelectorOpen, setGifSelectorOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const [overlayType, setOverlayType] = useState<OverlayType>('text');
  const [targetId, setTargetId] = useState<string>('');
  const [textContent, setTextContent] = useState('');
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [durationMs, setDurationMs] = useState(5000);
  const [animation, setAnimation] = useState<Animation>('fade');
  const [volume, setVolume] = useState(0.8);
  const [sfx, setSfx] = useState<SfxOption>('none');
  const [opacity, setOpacity] = useState(1);
  const [raidBomb, setRaidBomb] = useState(false);
  const [multiMonitorBomb, setMultiMonitorBomb] = useState(false);
  const [motionPreset, setMotionPreset] = useState<MotionPreset>('exact');
  const [textColor, setTextColor] = useState(TEXT_COLOR_PRESETS[0].value);
  const [bgColor, setBgColor] = useState(BG_COLOR_PRESETS[0].value);
  const [accentColor, setAccentColor] = useState(ACCENT_COLOR_PRESETS[0].value);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILY_PRESETS[0].value);
  const [placement, setPlacement] = useState<PlacementPosition>({
    monitor_index: 0,
    x: 0.5,
    y: 0.5,
  });
  const [targetMonitors, setTargetMonitors] = useState<MonitorDescriptor[]>([]);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'at_time' | 'on_online'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [onlineUserId, setOnlineUserId] = useState('');

  const refreshMedia = () => {
    listMedia({ page: 1, limit: 50 })
      .then((r) => setMediaItems(r.items))
      .catch(() => undefined);
  };

  const loadExtras = useCallback(() => {
    if (!id) return;
    listPrankHistory(id).then(setHistory).catch(() => undefined);
    listRoomActivity(id).then(setActivity).catch(() => undefined);
    listScheduled(id).then(setScheduled).catch(() => undefined);
    setTemplates(loadRaidTemplates(id));
  }, [id]);

  const loadRoom = useCallback(() => {
    if (!id) return;
    getRoom(id).then(setRoom).catch(() => undefined);
    loadExtras();
  }, [id, loadExtras]);

  useEffect(() => {
    if (!id) return;
    getRoom(id)
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load room'));
    refreshMedia();
    loadExtras();
    subscribeRoom(id);

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string; payload?: { reason?: string } }>).detail;
      if (detail?.type === 'prank:blocked') {
        const reason = detail.payload?.reason ?? 'CONSENT_REQUIRED';
        setError(
          reason.includes('CONSENT')
            ? 'Prank blocked: target has Receive raids turned Off.'
            : `Prank blocked: ${reason}`,
        );
      }
      loadRoom();
    };
    window.addEventListener('screenraid:room', handler);
    return () => {
      unsubscribeRoom(id);
      window.removeEventListener('screenraid:room', handler);
    };
  }, [id, loadExtras, loadRoom]);

  useEffect(() => {
    if (!targetId) {
      setTargetMonitors([]);
      return;
    }
    const refresh = () => {
      getUserMonitors(targetId)
        .then((layout) => {
          const list = layout?.monitors ?? [];
          setTargetMonitors(list);
          if (targetId === currentUserId && list.length > 0) {
            const primary = list.find((m) => m.is_primary) ?? list[0];
            setPlacement((p) => ({ ...p, monitor_index: primary.id }));
          }
        })
        .catch(() => setTargetMonitors([]));
    };
    refresh();
    if (targetId === currentUserId && isTauriRuntime()) {
      void (async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const settings = await invoke<{ selected_monitor?: string }>('get_settings');
          const idx = await invoke<number>('resolve_preferred_monitor', {
            selected: settings.selected_monitor ?? 'primary',
          });
          setPlacement((p) => ({ ...p, monitor_index: idx }));
        } catch {
          // ignore
        }
      })();
    }
    const onMonitorsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ user_id?: string }>).detail;
      if (detail?.user_id === targetId) refresh();
    };
    window.addEventListener('screenraid:monitors', onMonitorsChanged);
    return () => window.removeEventListener('screenraid:monitors', onMonitorsChanged);
  }, [targetId, currentUserId]);

  const handleLeave = async () => {
    if (!id) return;
    await leaveRoom(id);
    navigate('/rooms');
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this room for everyone?')) return;
    await deleteRoom(id);
    navigate('/rooms');
  };

  const buildConfig = (pos?: { x: number; y: number; monitor_index?: number }): OverlayConfig => {
    const config = defaultOverlayConfig();
    config.animation = animation;
    config.opacity = opacity;
    config.volume = volume;
    config.sfx = sfx;
    if (overlayType === 'text' || textContent.trim()) {
      config.text_color = textColor;
      config.bg_color = bgColor;
      config.accent_color = accentColor;
      config.font_family = fontFamily;
    }
    config.position = {
      monitor_index: pos?.monitor_index ?? placement.monitor_index,
      x: pos?.x ?? placement.x,
      y: pos?.y ?? placement.y,
      preset: motionPreset,
    };
    return config;
  };

  const buildRequest = (
    mediaIdOverride?: string | null,
    pos?: { x: number; y: number; monitor_index?: number },
  ) => {
    const mid =
      overlayType === 'text'
        ? null
        : mediaIdOverride !== undefined
          ? mediaIdOverride
          : mediaIds[0] || null;
    const caption =
      overlayType === 'text'
        ? textContent
        : textContent.trim()
          ? textContent.trim()
          : null;
    return {
      target_id: targetId || null,
      media_id: mid,
      overlay_type: overlayType,
      text_content: caption,
      duration_ms: durationMs,
      config: buildConfig(pos),
    };
  };

  const handleSendError = (e: unknown) => {
    const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Send failed';
    if (msg.toLowerCase().includes('cannot prank yourself')) {
      setError(
        'Cannot prank yourself while others are in the room. Pick another target, or set ALLOW_SELF_PRANK=true on the server.',
      );
    } else if (msg.toLowerCase().includes('no valid targets')) {
      setError('No valid targets. In a solo room, use Yourself or Everyone in room.');
    } else {
      setError(msg);
    }
  };

  const fireRequests = async (
    requests: ReturnType<typeof buildRequest>[],
  ) => {
    if (!id) return;
    const shots = requests.map((req) => sendPrank(id, req));
    const results = await Promise.allSettled(shots);
    const failed = results.filter((r) => r.status === 'rejected');
    const ok = results.length - failed.length;
    if (failed.length > 0) {
      const first = failed[0];
      handleSendError(first.status === 'rejected' ? first.reason : new Error('partial fail'));
      setError((prev) =>
        prev ? `${prev} (${ok}/${results.length} OK)` : `Partiel: ${ok}/${results.length} OK`,
      );
    } else {
      setTextContent('');
    }
  };

  const fireShots = async (
    positions: Array<{ x: number; y: number; monitor_index?: number }>,
  ) => {
    const ids = overlayType === 'text' ? [null] : mediaIds.length ? mediaIds : [null];
    const requests = ids.flatMap((mid) =>
      positions.map((pos) => buildRequest(mid, pos)),
    );
    await fireRequests(requests);
  };

  const handleSend = async () => {
    if (!id) return;
    const needsMedia = overlayType !== 'text';
    if (needsMedia && mediaIds.length === 0) {
      setError(
        showGifSelector
          ? 'Choisis un ou plusieurs GIFs / medias.'
          : 'Choisis un media avant d’envoyer.',
      );
      return;
    }
    if (overlayType === 'text' && !textContent.trim()) {
      setError('Écris un message texte.');
      return;
    }

    if (scheduleMode !== 'now') {
      setSending(true);
      setError('');
      try {
        // Schedule one job per selected media (or a single text raid).
        const ids = overlayType === 'text' ? [null] : mediaIds;
        for (const mid of ids) {
          await schedulePrank(id, {
            ...buildRequest(mid),
            trigger_type: scheduleMode,
            run_at: scheduleMode === 'at_time' ? new Date(scheduleAt).toISOString() : null,
            online_user_id: scheduleMode === 'on_online' ? onlineUserId || null : null,
          });
        }
        setScheduleMode('now');
        loadExtras();
      } catch (e) {
        handleSendError(e);
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    setError('');
    try {
      const monitors =
        multiMonitorBomb && targetMonitors.length > 0
          ? targetMonitors.map((m) => m.id)
          : [placement.monitor_index];

      if (raidBomb) {
        const positions = monitors.flatMap((mi) =>
          Array.from({ length: 5 }, () => ({
            x: randomBombCoord(),
            y: randomBombCoord(),
            monitor_index: mi,
          })),
        );
        await fireShots(positions);
      } else if (multiMonitorBomb && monitors.length > 1) {
        await fireShots(
          monitors.map((mi) => ({
            x: placement.x,
            y: placement.y,
            monitor_index: mi,
          })),
        );
      } else if (mediaIds.length > 1 && needsMedia) {
        await fireRequests(mediaIds.map((mid) => buildRequest(mid)));
      } else {
        await sendPrank(id, buildRequest());
        setTextContent('');
      }
      loadExtras();
    } catch (e) {
      handleSendError(e);
    } finally {
      setSending(false);
    }
  };

  const applyPack = (pack: RaidPack) => {
    setOverlayType(pack.overlayType);
    setAnimation(pack.animation);
    setDurationMs(pack.durationMs);
    setSfx(pack.sfx);
    setRaidBomb(Boolean(pack.bomb));
    if (pack.text) setTextContent(pack.text);
    setMediaIds([]);
    if (pack.needsGif) setGifSelectorOpen(true);
  };

  const applyTemplate = (t: RaidTemplate) => {
    setOverlayType(t.overlayType);
    setTextContent(t.textContent);
    setMediaIds(t.mediaId ? [t.mediaId] : []);
    setDurationMs(t.durationMs);
    setAnimation(t.animation);
    setVolume(t.volume);
    setSfx(t.sfx);
    setOpacity(t.opacity);
    setRaidBomb(t.raidBomb);
    setMultiMonitorBomb(t.multiMonitorBomb);
    setTextColor(t.textColor);
    setBgColor(t.bgColor);
    setAccentColor(t.accentColor);
    setFontFamily(t.fontFamily);
  };

  const saveCurrentTemplate = () => {
    if (!id || !templateName.trim()) return;
    const next = saveRaidTemplate({
      name: templateName.trim(),
      roomId: id,
      overlayType,
      textContent,
      mediaId: mediaIds[0] ?? '',
      durationMs,
      animation,
      volume,
      sfx,
      opacity,
      raidBomb,
      multiMonitorBomb,
      textColor,
      bgColor,
      accentColor,
      fontFamily,
    });
    setTemplates(next);
    setTemplateName('');
  };

  const selectedMediaList = mediaIds
    .map((mid) => mediaItems.find((m) => m.id === mid))
    .filter((m): m is Media => Boolean(m));
  const selectableMedia = mediaForOverlay(overlayType, mediaItems);
  const needsMedia = overlayType !== 'text';
  const isSoundOnly = overlayType === 'sound';
  const showPlacement =
    Boolean(targetId) && !isSoundOnly && motionPreset === 'exact';
  const showGifSelector = overlayType === 'gif' || overlayType === 'image';
  const showCaption = showGifSelector || overlayType === 'video';
  const previewText =
    overlayType === 'text'
      ? textContent.trim() || 'Aperçu'
      : textContent.trim() ||
        selectedMediaList[0]?.original_name ||
        previewLabel(overlayType);

  if (!room) {
    return (
      <Card>
        <p className="text-sm text-raid-text-secondary">{error || 'Loading room…'}</p>
      </Card>
    );
  }

  const myRole = room.members.find((m) => m.user_id === currentUserId)?.role;
  const isOwner = myRole === 'owner';
  const canModerate = isOwner || myRole === 'admin';
  const canSend = myRole !== 'guest';
  const otherMembers = room.members.filter((m) => m.user_id !== currentUserId);
  const isSoloRoom = room.members.length === 1;
  const pendingScheduled = scheduled.filter((s) => s.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-raid-text">{room.name}</h1>
          <p className="mt-1 text-sm text-raid-text-secondary">
            {room.members.length} member{room.members.length === 1 ? '' : 's'}
          </p>
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

      {canSend && (!wsConnected || !globalConsent || isPaused) && (
        <p className="rounded-xl border border-raid-warning/40 bg-raid-warning/10 px-3 py-2 text-sm text-raid-text">
          {!wsConnected && 'Live connection offline — pranks will not display until WebSocket reconnects. '}
          {!globalConsent && 'Turn on Receive raids in Settings to get overlays. '}
          {globalConsent && isPaused && 'Receiving is paused — turn Receive raids On again in Settings.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <RoomMembersPanel
            roomId={id!}
            members={room.members}
            maxMembers={room.max_members}
            currentUserId={currentUserId}
            canModerate={canModerate}
            isOwner={isOwner}
            onChanged={loadRoom}
            onError={setError}
          />
        </Card>

        {accessToken && id && (
          <RoomSecurityPanel
            accessToken={accessToken}
            roomId={id}
            members={room.members}
            canModerate={canModerate}
          />
        )}

        <Card accentHeader className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Send raid</h2>
          {!canSend ? (
            <p className="text-sm text-raid-text-secondary">Guests cannot send pranks.</p>
          ) : (
            <div className="space-y-4">
              {isSoloRoom && (
                <p className="rounded-xl border border-raid-accent/30 bg-raid-accent/10 px-3 py-2 text-xs text-raid-text-secondary">
                  Solo room: target <strong>Yourself</strong> or <strong>Everyone</strong>. Enable
                  Receive raids first.
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">Target</label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">Everyone in room</option>
                    {currentUserId && (
                      <option value={currentUserId}>Yourself (solo test)</option>
                    )}
                    {otherMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">When</label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={scheduleMode}
                    onChange={(e) =>
                      setScheduleMode(e.target.value as 'now' | 'at_time' | 'on_online')
                    }
                  >
                    <option value="now">Send now</option>
                    <option value="at_time">Schedule for time</option>
                    <option value="on_online">When someone comes online</option>
                  </select>
                </div>
              </div>

              {scheduleMode === 'at_time' && (
                <Input
                  label="Send at"
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              )}
              {scheduleMode === 'on_online' && (
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">
                    Fire when this user is online
                  </label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={onlineUserId}
                    onChange={(e) => setOnlineUserId(e.target.value)}
                  >
                    <option value="">Select member…</option>
                    {room.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <p className="mb-2 text-xs font-medium text-raid-text-secondary">Quick packs</p>
                <div className="flex flex-wrap gap-2">
                  {RAID_PACKS.map((pack) => (
                    <Button
                      key={pack.id}
                      variant="secondary"
                      className="!px-3 !py-1.5 text-sm"
                      onClick={() => applyPack(pack)}
                      title={pack.description}
                    >
                      {pack.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-raid-border bg-raid-bg/40 p-3 space-y-2">
                  <p className="text-xs font-medium text-raid-text-secondary">My templates</p>
                  <div className="flex flex-wrap gap-2">
                    {templates.map((t) => (
                      <div key={t.id} className="flex items-center gap-1">
                        <Button
                          variant="secondary"
                          className="!px-3 !py-1.5 text-sm"
                          onClick={() => applyTemplate(t)}
                        >
                          {t.name}
                        </Button>
                        <button
                          type="button"
                          className="text-xs text-raid-danger"
                          onClick={() => {
                            if (!id) return;
                            setTemplates(deleteRaidTemplate(id, t.id));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      placeholder="Template name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="!py-1.5"
                    />
                    <Button variant="secondary" onClick={saveCurrentTemplate}>
                      Save current
                    </Button>
                  </div>
                </div>

              <div className="flex flex-wrap gap-2">
                {OVERLAY_TYPES.map((t) => (
                  <Button
                    key={t}
                    variant={overlayType === t ? 'primary' : 'secondary'}
                    onClick={() => {
                      setOverlayType(t);
                      setMediaIds([]);
                    }}
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
                <div className="space-y-3">
                  {showGifSelector && (
                    <Button variant="secondary" onClick={() => setGifSelectorOpen(true)}>
                      Choisir un ou plusieurs GIFs
                    </Button>
                  )}
                  <MediaPicker
                    items={selectableMedia}
                    value={mediaIds[0] ?? ''}
                    onChange={(id) => setMediaIds(id ? [id] : [])}
                    emptyHint={
                      showGifSelector
                        ? 'Bibliothèque vide — utilise le sélecteur GIF ou upload dans Media.'
                        : `Upload ${overlayType} media in the Media library first.`
                    }
                  />
                  {selectedMediaList.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-xl border border-raid-accent/40 bg-raid-bg/60 p-2">
                      {selectedMediaList.map((m) => (
                        <div key={m.id} className="group relative">
                          <MediaThumb media={m} sizeClass="h-14 w-14" />
                          <button
                            type="button"
                            title="Retirer"
                            className="absolute -right-1 -top-1 rounded-full bg-raid-danger px-1 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                            onClick={() =>
                              setMediaIds((prev) => prev.filter((x) => x !== m.id))
                            }
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <p className="self-center text-xs text-raid-text-secondary">
                        {selectedMediaList.length} sélectionné
                        {selectedMediaList.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  )}
                  {showCaption && (
                    <Input
                      label="Légende (optionnel)"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      placeholder="Texte affiché sous le GIF / image…"
                    />
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">Animation</label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={animation}
                    onChange={(e) => setAnimation(e.target.value as Animation)}
                    disabled={isSoundOnly}
                  >
                    {ANIMATION_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">SFX</label>
                  <select
                    className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                    value={sfx}
                    onChange={(e) => setSfx(e.target.value as SfxOption)}
                  >
                    {SFX_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isSoundOnly && (
                <AnimationPreview
                  animation={animation}
                  label={previewText}
                  textColor={textColor}
                  bgColor={bgColor}
                  accentColor={accentColor}
                  fontFamily={fontFamily}
                />
              )}

              {(overlayType === 'text' || showCaption) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-raid-text-secondary">Couleur texte</label>
                    <select
                      className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                    >
                      {TEXT_COLOR_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-raid-text-secondary">Fond</label>
                    <select
                      className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    >
                      {BG_COLOR_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-raid-text-secondary">Accent</label>
                    <select
                      className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                    >
                      {ACCENT_COLOR_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-raid-text-secondary">Police</label>
                    <select
                      className="w-full rounded-lg border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text"
                      value={fontFamily}
                      onChange={(e) => setFontFamily(e.target.value)}
                    >
                      {FONT_FAMILY_PRESETS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {(overlayType === 'sound' || overlayType === 'video') && (
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">
                    Volume: {Math.round(volume * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full accent-raid-accent"
                  />
                </div>
              )}

              {!isSoundOnly && (
                <div>
                  <label className="mb-1 block text-xs text-raid-text-secondary">
                    Soft (opacité): {Math.round(opacity * 100)}%
                  </label>
                  <input
                    type="range"
                    min={0.3}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-raid-accent"
                  />
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

              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-raid-text">
                  <input
                    type="checkbox"
                    checked={raidBomb}
                    onChange={(e) => setRaidBomb(e.target.checked)}
                    className="accent-raid-accent"
                  />
                  Raid bomb (×5)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-raid-text">
                  <input
                    type="checkbox"
                    checked={multiMonitorBomb}
                    onChange={(e) => setMultiMonitorBomb(e.target.checked)}
                    className="accent-raid-accent"
                    disabled={!targetId || targetMonitors.length < 2}
                  />
                  All monitors
                  <span className="text-xs text-raid-text-secondary">
                    {targetMonitors.length > 1
                      ? `(${targetMonitors.length} screens)`
                      : '(pick a target with 2+ screens)'}
                  </span>
                </label>
                <label className="flex min-w-[14rem] flex-col gap-1 text-sm text-raid-text">
                  <span className="text-raid-text-secondary">Mouvement AR</span>
                  <select
                    value={motionPreset}
                    onChange={(e) => setMotionPreset(e.target.value as MotionPreset)}
                    disabled={isSoundOnly}
                    className="rounded-xl border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-text outline-none focus:border-raid-accent"
                  >
                    {MOTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.hint}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {showPlacement && (
                <MonitorCanvas
                  monitors={targetMonitors}
                  position={placement}
                  onChange={setPlacement}
                  previewLabel={previewLabel(overlayType)}
                />
              )}

              {targetId === currentUserId && !isSoloRoom && (
                <p className="text-xs text-raid-text-secondary">
                  Self-target in a multi-member room requires{' '}
                  <code className="text-raid-accent">ALLOW_SELF_PRANK=true</code> on the server.
                </p>
              )}

              <Button
                disabled={
                  sending ||
                  (overlayType === 'text' && !textContent.trim()) ||
                  (needsMedia && mediaIds.length === 0) ||
                  (scheduleMode === 'at_time' && !scheduleAt) ||
                  (scheduleMode === 'on_online' && !onlineUserId)
                }
                onClick={() => void handleSend()}
              >
                <Send size={16} />
                {sending
                  ? '…'
                  : scheduleMode === 'now'
                    ? raidBomb || multiMonitorBomb
                      ? 'Send bomb'
                      : 'Send prank'
                    : 'Queue raid'}
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-raid-text">
            Activity
          </h2>
          {activity.length === 0 ? (
            <p className="text-sm text-raid-text-secondary">No activity yet.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto">
              {activity.map((a) => (
                <li key={a.id} className="border-b border-raid-border pb-2 text-sm last:border-0">
                  <p className="text-raid-text">
                    {a.actor_name ?? '?'} → {a.target_name ?? 'everyone'} · {a.overlay_type}{' '}
                    {a.status && <Badge variant="neutral">{a.status}</Badge>}
                  </p>
                  <p className="text-xs text-raid-text-secondary">
                    {new Date(a.at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-raid-text">
            <Clock size={18} /> Queued ({pendingScheduled.length})
          </h2>
          {pendingScheduled.length === 0 ? (
            <p className="text-sm text-raid-text-secondary">No scheduled raids.</p>
          ) : (
            <ul className="space-y-2">
              {pendingScheduled.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-raid-surface px-3 py-2 text-sm"
                >
                  <div>
                    <p className="text-raid-text">
                      {s.overlay_type} · {s.trigger_type}
                    </p>
                    <p className="text-xs text-raid-text-secondary">
                      {s.trigger_type === 'at_time' && s.run_at
                        ? new Date(s.run_at).toLocaleString()
                        : s.online_user_id
                          ? `when ${room.members.find((m) => m.user_id === s.online_user_id)?.display_name ?? 'user'} online`
                          : 'pending'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => {
                      if (!id) return;
                      void cancelScheduled(id, s.id)
                        .then(loadExtras)
                        .catch((e) => setError(e instanceof Error ? e.message : 'Cancel failed'));
                    }}
                  >
                    Cancel
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-raid-text">Prank history</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-raid-text-secondary">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Target</th>
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
                    <td className="py-2 pr-4 text-raid-text-secondary">
                      {h.target_id
                        ? room.members.find((m) => m.user_id === h.target_id)?.display_name ??
                          h.target_id.slice(0, 8)
                        : 'Everyone'}
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

      <GifSelector
        open={gifSelectorOpen}
        onClose={() => setGifSelectorOpen(false)}
        roomId={id}
        multi
        onPicked={(media) => {
          setMediaItems((prev) =>
            prev.some((m) => m.id === media.id) ? prev : [media, ...prev],
          );
          setMediaIds([media.id]);
          setOverlayType((prev) => (prev === 'image' ? 'image' : 'gif'));
          refreshMedia();
        }}
        onPickedMany={(picked) => {
          const medias = picked.map((p) => p.media);
          setMediaItems((prev) => {
            const next = [...prev];
            for (const media of medias) {
              if (!next.some((m) => m.id === media.id)) next.unshift(media);
            }
            return next;
          });
          setMediaIds(medias.map((m) => m.id));
          setOverlayType((prev) => (prev === 'image' ? 'image' : 'gif'));
          refreshMedia();
        }}
      />
    </div>
  );
}
