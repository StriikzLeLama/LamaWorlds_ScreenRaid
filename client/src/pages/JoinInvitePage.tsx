import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Badge } from '../components/ui';
import { ApiError } from '../services/api';
import { getInvitePreview, joinRoom, joinRoomByToken } from '../services/rooms';
import { extractInvitePayload, inviteShareUrl } from '../lib/invites';
import { useAuthStore } from '../stores/authStore';
import { useT } from '../hooks/useT';
import type { InvitePreview } from '../services/rooms';

/**
 * Deep-link /join?invite=… — works on web SPA and desktop app.
 * Also accepts a bare room code via ?code=.
 */
export function JoinInvitePage() {
  const t = useT();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<'idle' | 'preview' | 'joining' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitePreview | null>(null);

  const inviteToken =
    params.get('invite')?.trim() || params.get('token')?.trim() || '';
  const roomCode = params.get('code')?.trim() || '';
  const raw = inviteToken || roomCode;

  useEffect(() => {
    if (!inviteToken) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    void getInvitePreview(inviteToken)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setStatus('preview');
      })
      .catch(() => {
        if (cancelled) return;
        setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!raw) {
      setStatus('error');
      setMessage(t('invite.missingLink'));
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus('joining');
      setMessage(t('invite.joining'));
      try {
        const payload = extractInvitePayload(raw);
        const room =
          payload.kind === 'token'
            ? await joinRoomByToken(payload.value)
            : await joinRoom(payload.value.toUpperCase());
        if (cancelled) return;
        setRoomId(room.id);
        setStatus('ok');
        setMessage(t('invite.joined', { name: room.name }));
        window.setTimeout(() => navigate(`/rooms/${room.id}`, { replace: true }), 600);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof ApiError ? e.message : t('invite.joinFailed'));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, raw, navigate, t]);

  const previewCard = preview ? (
    <div className="mt-4 space-y-2 rounded-xl border border-raid-border bg-raid-surface px-4 py-3 text-sm">
      <p className="text-lg font-semibold text-raid-text">{preview.room_name}</p>
      <p className="text-raid-text-secondary">
        {t('invite.invitedBy', { name: preview.created_by_display_name })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge>{preview.role}</Badge>
        {!preview.is_active && <Badge variant="warning">{t('invite.inactive')}</Badge>}
      </div>
      <p className="text-xs text-raid-text-secondary">
        {preview.expires_at
          ? t('invite.expires', { date: new Date(preview.expires_at).toLocaleString() })
          : t('invite.noExpiry')}
        {' · '}
        {preview.max_uses === 0
          ? t('invite.unlimitedUses')
          : t('invite.usesLeft', {
              left: Math.max(0, preview.max_uses - preview.use_count),
              max: preview.max_uses,
            })}
      </p>
    </div>
  ) : null;

  if (!isAuthenticated) {
    const next = raw
      ? `/join?invite=${encodeURIComponent(extractInvitePayload(raw).value)}`
      : '/join';
    return (
      <div className="mx-auto max-w-md space-y-4 py-12">
        <Card>
          <h1 className="text-xl font-bold text-raid-text">{t('invite.joinTitle')}</h1>
          <p className="mt-2 text-sm text-raid-text-secondary">{t('invite.signInPrompt')}</p>
          {previewCard}
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/login?next=${encodeURIComponent(next)}`}>
              <Button>{t('login.signIn')}</Button>
            </Link>
            <Link to={`/register?next=${encodeURIComponent(next)}`}>
              <Button variant="secondary">{t('register.title')}</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <Card>
        <h1 className="text-xl font-bold text-raid-text">{t('invite.joinTitle')}</h1>
        {previewCard}
        <p
          className={`mt-2 text-sm ${
            status === 'error' ? 'text-raid-danger' : 'text-raid-text-secondary'
          }`}
        >
          {message || t('common.loading')}
        </p>
        {status === 'error' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/rooms')}>
              {t('invite.backToRooms')}
            </Button>
            {raw && (
              <Button
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(inviteShareUrl(raw))}
              >
                {t('invite.copyLink')}
              </Button>
            )}
          </div>
        )}
        {status === 'ok' && roomId && (
          <div className="mt-4">
            <Link to={`/rooms/${roomId}`}>
              <Button>{t('invite.openRoom')}</Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
