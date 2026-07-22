import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button } from '../components/ui';
import { ApiError } from '../services/api';
import { joinRoom, joinRoomByToken } from '../services/rooms';
import { extractInvitePayload, inviteShareUrl } from '../lib/invites';
import { useAuthStore } from '../stores/authStore';

/**
 * Deep-link /join?invite=… — works on web SPA and desktop app.
 * Also accepts a bare room code via ?code=.
 */
export function JoinInvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [status, setStatus] = useState<'idle' | 'joining' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [roomId, setRoomId] = useState<string | null>(null);

  const raw =
    params.get('invite')?.trim() ||
    params.get('token')?.trim() ||
    params.get('code')?.trim() ||
    '';

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!raw) {
      setStatus('error');
      setMessage('Missing invite token or room code in the link.');
      return;
    }

    let cancelled = false;
    const run = async () => {
      setStatus('joining');
      setMessage('Joining room…');
      try {
        const payload = extractInvitePayload(raw);
        const room =
          payload.kind === 'token'
            ? await joinRoomByToken(payload.value)
            : await joinRoom(payload.value.toUpperCase());
        if (cancelled) return;
        setRoomId(room.id);
        setStatus('ok');
        setMessage(`Joined ${room.name}`);
        window.setTimeout(() => navigate(`/rooms/${room.id}`, { replace: true }), 600);
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setMessage(e instanceof ApiError ? e.message : 'Could not join with this invite.');
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, raw, navigate]);

  if (!isAuthenticated) {
    const next = raw
      ? `/join?invite=${encodeURIComponent(extractInvitePayload(raw).value)}`
      : '/join';
    return (
      <div className="mx-auto max-w-md space-y-4 py-12">
        <Card>
          <h1 className="text-xl font-bold text-raid-text">Join room</h1>
          <p className="mt-2 text-sm text-raid-text-secondary">
            Sign in (or create an account) to accept this invite.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/login?next=${encodeURIComponent(next)}`}>
              <Button>Sign in</Button>
            </Link>
            <Link to={`/register?next=${encodeURIComponent(next)}`}>
              <Button variant="secondary">Register</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4 py-12">
      <Card>
        <h1 className="text-xl font-bold text-raid-text">Join room</h1>
        <p
          className={`mt-2 text-sm ${
            status === 'error' ? 'text-raid-danger' : 'text-raid-text-secondary'
          }`}
        >
          {message || 'Preparing…'}
        </p>
        {status === 'error' && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/rooms')}>
              Back to rooms
            </Button>
            {raw && (
              <Button
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(inviteShareUrl(raw))}
              >
                Copy invite
              </Button>
            )}
          </div>
        )}
        {status === 'ok' && roomId && (
          <div className="mt-4">
            <Link to={`/rooms/${roomId}`}>
              <Button>Open room</Button>
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}
