import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, LogOut, Send, Trash2, Users } from 'lucide-react';
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
import { deleteRoom, getRoom, leaveRoom } from '../services/rooms';
import { getUserMonitors, type MonitorDescriptor } from '../services/monitors';
import { subscribeRoom, unsubscribeRoom } from '../services/websocket';
import { MonitorCanvas, type PlacementPosition } from '../components/placement/MonitorCanvas';
import { RAID_PACKS, type RaidPack } from '../lib/raidPacks';
import { RoomSecurityPanel } from '../components/settings/RoomSecurityPanel';
import { useAuthStore } from '../stores/authStore';
import { useConsentStore } from '../stores/consentStore';
import { useWsConnection } from '../hooks/useWsConnection';
import type { RoomDetail, RoomMember } from '../types/room';
import type { MediaType } from '../types';

const OVERLAY_TYPES: OverlayType[] = ['text', 'image', 'gif', 'video', 'sound'];

type SfxOption = NonNullable<OverlayConfig['sfx']>;

const SFX_OPTIONS: { value: SfxOption; label: string }[] = [
  { value: 'none', label: 'Aucun' },
  { value: 'pop', label: 'Pop' },
  { value: 'whoosh', label: 'Whoosh' },
];

const TEXT_COLOR_PRESETS = [
  { value: '#f5f5f5', label: 'Blanc' },
  { value: '#ffffff', label: 'Blanc pur' },
  { value: '#f97316', label: 'Orange' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#ef4444', label: 'Rouge' },
  { value: '#38bdf8', label: 'Cyan' },
];

const BG_COLOR_PRESETS = [
  { value: 'rgba(20,20,22,0.94)', label: 'Sombre' },
  { value: 'rgba(0,0,0,0.85)', label: 'Noir' },
  { value: 'rgba(249,115,22,0.92)', label: 'Orange' },
  { value: 'rgba(30,58,138,0.92)', label: 'Bleu' },
  { value: 'rgba(22,101,52,0.92)', label: 'Vert' },
];

const ACCENT_COLOR_PRESETS = [
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Jaune' },
  { value: '#22c55e', label: 'Vert' },
  { value: '#38bdf8', label: 'Cyan' },
  { value: '#a855f7', label: 'Violet' },
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
  // KLIPY sometimes serves animated webp → stored as image; still usable as gif raids.
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

function countByStatus(history: PrankHistoryItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of history) {
    const key = item.status || 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
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
  const [copied, setCopied] = useState(false);
  const [mediaItems, setMediaItems] = useState<Media[]>([]);
  const [history, setHistory] = useState<PrankHistoryItem[]>([]);
  const [sending, setSending] = useState(false);
  const [gifSelectorOpen, setGifSelectorOpen] = useState(false);

  // Composer state — kept local so sending one room doesn't affect another.
  const [overlayType, setOverlayType] = useState<OverlayType>('text');
  const [targetId, setTargetId] = useState<string>('');
  const [textContent, setTextContent] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [durationMs, setDurationMs] = useState(5000);
  const [animation, setAnimation] = useState<Animation>('fade');
  const [volume, setVolume] = useState(0.8);
  const [sfx, setSfx] = useState<SfxOption>('none');
  const [opacity, setOpacity] = useState(1);
  const [raidBomb, setRaidBomb] = useState(false);
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

  const loadRoom = () => {
    if (!id) return;
    getRoom(id).then(setRoom).catch(() => undefined);
    listPrankHistory(id).then(setHistory).catch(() => undefined);
  };

  const refreshMedia = () => {
    listMedia({ page: 1, limit: 50 })
      .then((r) => setMediaItems(r.items))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!id) return;
    getRoom(id)
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load room'));
    refreshMedia();
    listPrankHistory(id).then(setHistory).catch(() => undefined);
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

  const buildConfig = (pos?: { x: number; y: number }): OverlayConfig => {
    const config = defaultOverlayConfig();
    config.animation = animation;
    config.volume = volume;
    config.opacity = opacity;
    config.sfx = sfx;
    config.text_color = textColor;
    config.bg_color = bgColor;
    config.accent_color = accentColor;
    config.font_family = fontFamily;
    config.position = {
      monitor_index: placement.monitor_index,
      x: pos?.x ?? placement.x,
      y: pos?.y ?? placement.y,
      preset: 'exact',
    };
    return config;
  };

  const buildRequest = (pos?: { x: number; y: number }) => ({
    target_id: targetId || null,
    media_id: overlayType === 'text' ? null : mediaId || null,
    overlay_type: overlayType,
    text_content: overlayType === 'text' ? textContent : null,
    duration_ms: durationMs,
    config: buildConfig(pos),
  });

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

  const handleSend = async () => {
    if (!id) return;
    if (needsMedia && !mediaId) {
      setError(
        showGifSelector
          ? 'Choisis un GIF (sélecteur) ou un media de la bibliothèque.'
          : 'Choisis un media avant d’envoyer.',
      );
      return;
    }
    if (overlayType === 'text' && !textContent.trim()) {
      setError('Écris un message texte.');
      return;
    }
    setSending(true);
    setError('');
    try {
      if (raidBomb) {
        const shots = Array.from({ length: 5 }, () =>
          sendPrank(id, buildRequest({ x: randomBombCoord(), y: randomBombCoord() })),
        );
        const results = await Promise.allSettled(shots);
        const failed = results.filter((r) => r.status === 'rejected');
        const ok = results.length - failed.length;
        if (failed.length > 0) {
          const first = failed[0];
          const reason =
            first.status === 'rejected'
              ? first.reason
              : new Error(`${failed.length}/${results.length} raids ont échoué`);
          handleSendError(reason);
          setError((prev) =>
            prev
              ? `${prev} (${ok}/${results.length} OK)`
              : `Raid bomb partiel: ${ok}/${results.length} OK`,
          );
        } else {
          setTextContent('');
        }
      } else {
        await sendPrank(id, buildRequest());
        setTextContent('');
      }
      listPrankHistory(id).then(setHistory).catch(() => undefined);
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
    // Always clear media when switching packs — avoids sending a video as a "gif".
    setMediaId('');
    if (pack.needsGif) {
      setGifSelectorOpen(true);
    }
  };

  const statusCounts = countByStatus(history);
  const selectedMedia = mediaItems.find((m) => m.id === mediaId) ?? null;
  const selectableMedia = mediaForOverlay(overlayType, mediaItems);
  const needsMedia = overlayType !== 'text';
  const isSoundOnly = overlayType === 'sound';
  const showPlacement = Boolean(targetId) && !isSoundOnly;
  const showGifSelector = overlayType === 'gif' || overlayType === 'image';
  const previewText =
    overlayType === 'text'
      ? textContent.trim() || 'Aperçu'
      : selectedMedia?.original_name || previewLabel(overlayType);

  if (!room) {
    return <Card><p className="text-sm text-raid-text-secondary">{error || 'Loading room…'}</p></Card>;
  }

  const myRole = room.members.find((m) => m.user_id === currentUserId)?.role;
  const isOwner = myRole === 'owner';
  const canModerate = isOwner || myRole === 'admin';
  const canSend = myRole !== 'guest';
  const otherMembers = room.members.filter((m) => m.user_id !== currentUserId);
  const isSoloRoom = room.members.length === 1;

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

      {canSend && (!wsConnected || !globalConsent || isPaused) && (
        <p className="rounded-xl border border-raid-warning/40 bg-raid-warning/10 px-3 py-2 text-sm text-raid-text">
          {!wsConnected && 'Live connection offline — pranks will not display until WebSocket reconnects. '}
          {!globalConsent && 'Turn on Receive raids in Settings to get overlays. '}
          {globalConsent && isPaused && 'Receiving is paused — turn Receive raids On again in Settings.'}
        </p>
      )}

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

        {accessToken && id && (
          <RoomSecurityPanel
            accessToken={accessToken}
            roomId={id}
            members={room.members}
            canModerate={canModerate}
          />
        )}

        <Card accentHeader>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Prank composer</h2>
          {!canSend ? (
            <p className="text-sm text-raid-text-secondary">Guests cannot send pranks.</p>
          ) : (
            <div className="space-y-4">
              {isSoloRoom && (
                <p className="rounded-xl border border-raid-accent/30 bg-raid-accent/10 px-3 py-2 text-xs text-raid-text-secondary">
                  Solo room: you can prank yourself (target <strong>Yourself</strong> or{' '}
                  <strong>Everyone</strong>). Enable Receive raids first.
                </p>
              )}

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
                <p className="mb-2 text-xs font-medium text-raid-text-secondary">Packs</p>
                <div className="flex flex-wrap gap-2">
                  {RAID_PACKS.map((pack) => (
                    <Button
                      key={pack.id}
                      variant="secondary"
                      className="!h-auto flex-col items-start gap-0.5 !px-3 !py-2 text-left"
                      onClick={() => applyPack(pack)}
                      title={pack.description}
                    >
                      <span className="text-sm font-medium">{pack.label}</span>
                      <span className="text-[10px] font-normal text-raid-text-secondary">
                        {pack.description}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {OVERLAY_TYPES.map((t) => (
                  <Button
                    key={t}
                    variant={overlayType === t ? 'primary' : 'secondary'}
                    onClick={() => {
                      setOverlayType(t);
                      setMediaId('');
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
                      Ouvrir le sélecteur GIF
                    </Button>
                  )}

                  <div>
                    <label className="mb-1 block text-xs text-raid-text-secondary">
                      {showGifSelector ? 'Ou choisir dans la bibliothèque' : 'Media'}
                    </label>
                    <MediaPicker
                      items={selectableMedia}
                      value={mediaId}
                      onChange={setMediaId}
                      emptyHint={
                        showGifSelector
                          ? 'Bibliothèque vide — utilise le sélecteur GIF ou upload dans Media.'
                          : `Upload ${overlayType} media in the Media library first.`
                      }
                    />
                  </div>

                  {selectedMedia && (
                    <div className="flex items-center gap-3 rounded-xl border border-raid-accent/40 bg-raid-bg/60 p-2">
                      <MediaThumb media={selectedMedia} sizeClass="h-16 w-16" />
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-wide text-raid-accent">Sélectionné</p>
                        <p className="truncate text-sm text-raid-text">
                          {selectedMedia.original_name}
                        </p>
                        <p className="text-xs text-raid-text-secondary">
                          {selectedMedia.media_type}
                        </p>
                      </div>
                    </div>
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

              {overlayType === 'text' && (
                <div className="space-y-3 rounded-xl border border-raid-border bg-raid-bg/40 p-3">
                  <p className="text-xs font-medium text-raid-text-secondary">Thème texte</p>
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

              <label className="flex cursor-pointer items-center gap-2 text-sm text-raid-text">
                <input
                  type="checkbox"
                  checked={raidBomb}
                  onChange={(e) => setRaidBomb(e.target.checked)}
                  className="accent-raid-accent"
                />
                Raid bomb
                <span className="text-xs text-raid-text-secondary">
                  (5 pranks, positions aléatoires)
                </span>
              </label>

              {showPlacement && (
                <div>
                  <label className="mb-2 block text-xs font-medium text-raid-text-secondary">
                    Visual placement
                  </label>
                  <MonitorCanvas
                    monitors={targetMonitors}
                    position={placement}
                    onChange={setPlacement}
                    previewLabel={previewLabel(overlayType)}
                  />
                  {raidBomb && (
                    <p className="mt-1 text-xs text-raid-text-secondary">
                      En mode bomb, les positions sont aléatoires (0.2–0.8) ; le placement ci-dessus
                      sert de référence pour le moniteur.
                    </p>
                  )}
                </div>
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
                  (needsMedia && !mediaId)
                }
                onClick={() => void handleSend()}
              >
                <Send size={16} />
                {sending ? 'Sending…' : raidBomb ? 'Envoyer bomb (×5)' : 'Send prank'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold text-raid-text">Prank history</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} variant={status === 'blocked' ? 'danger' : 'neutral'}>
                {status}: {count}
              </Badge>
            ))}
            <span className="self-center text-xs text-raid-text-secondary">
              Total {history.length}
            </span>
          </div>
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
        onPicked={(media) => {
          setMediaItems((prev) =>
            prev.some((m) => m.id === media.id) ? prev : [media, ...prev],
          );
          setMediaId(media.id);
          // Keep image if user was composing an image raid; otherwise use gif.
          setOverlayType((prev) => (prev === 'image' ? 'image' : 'gif'));
          refreshMedia();
        }}
      />
    </div>
  );
}
