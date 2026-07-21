import { useEffect, useState } from 'react';
import { Card, Button } from '../ui';
import { ApiError } from '../../services/api';
import { getRoomSecurity, updateRoomSecurity } from '../../services/security';
import type { RoomSecuritySettings } from '../../types/security';
import type { RoomMember } from '../../types/room';

interface Props {
  accessToken: string;
  roomId: string;
  members: RoomMember[];
  canModerate: boolean;
}

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

export function RoomSecurityPanel({ accessToken, roomId, members, canModerate }: Props) {
  const [settings, setSettings] = useState<RoomSecuritySettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRoomSecurity(accessToken, roomId)
      .then(setSettings)
      .catch((e) => setError(errMsg(e)));
  }, [accessToken, roomId]);

  if (!canModerate) return null;

  const applyPreset = async (preset: 'friends' | 'strict') => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await updateRoomSecurity(accessToken, roomId, { preset });
      setSettings(next);
      setMessage(`Room preset: ${preset}`);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleMute = async (userId: string, mute: boolean) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const next = await updateRoomSecurity(accessToken, roomId, {
        mute_user_id: mute ? userId : undefined,
        unmute_user_id: mute ? undefined : userId,
      });
      setSettings(next);
      setMessage(mute ? 'Sender muted in this room.' : 'Sender unmuted.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return (
      <Card>
        <p className="text-sm text-raid-text-secondary">Loading room security…</p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold text-raid-text">Room security</h2>
      <p className="mb-4 text-xs text-raid-text-secondary">
        Quotas and mute senders for this room. Preset: {settings.preset}
      </p>
      {error && <p className="mb-2 text-sm text-raid-danger">{error}</p>}
      {message && <p className="mb-2 text-sm text-raid-success">{message}</p>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant={settings.preset === 'friends' ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={() => void applyPreset('friends')}
        >
          Friends
        </Button>
        <Button
          variant={settings.preset === 'strict' ? 'primary' : 'secondary'}
          disabled={busy}
          onClick={() => void applyPreset('strict')}
        >
          Strict
        </Button>
      </div>
      <ul className="space-y-2">
        {members.map((m) => {
          const muted = settings.muted_senders.includes(m.user_id);
          return (
            <li
              key={m.user_id}
              className="flex items-center justify-between gap-2 text-sm text-raid-text"
            >
              <span>
                @{m.username}
                {muted && <span className="ml-2 text-xs text-raid-warning">muted</span>}
              </span>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void toggleMute(m.user_id, !muted)}
              >
                {muted ? 'Unmute' : 'Mute sends'}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
