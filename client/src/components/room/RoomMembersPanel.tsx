import type { ReactNode } from 'react';
import { UserMinus } from 'lucide-react';
import { Badge, Button } from '../ui';
import type { RoomMember } from '../../types/room';
import { changeMemberRole, kickMember } from '../../services/rooms';

interface Props {
  roomId: string;
  members: RoomMember[];
  maxMembers: number;
  currentUserId?: string;
  canModerate: boolean;
  isOwner: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  headerAction?: ReactNode;
}

export function RoomMembersPanel({
  roomId,
  members,
  maxMembers,
  currentUserId,
  canModerate,
  isOwner,
  onChanged,
  onError,
  headerAction,
}: Props) {
  const kick = async (userId: string, username: string) => {
    if (!confirm(`Kick @${username} from this room?`)) return;
    try {
      await kickMember(roomId, userId);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Kick failed');
    }
  };

  const setRole = async (userId: string, role: string) => {
    try {
      await changeMemberRole(roomId, userId, role);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Role change failed');
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-raid-text">
          Members ({members.length}/{maxMembers})
        </h2>
        {headerAction}
      </div>
      <div className="divide-y divide-raid-border">
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const canAct = canModerate && !isSelf && m.role !== 'owner';
          return (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="font-medium text-raid-text">
                  {m.display_name}
                  {isSelf && (
                    <span className="ml-2 text-xs text-raid-text-secondary">(you)</span>
                  )}
                </p>
                <p className="text-xs text-raid-text-secondary">
                  @{m.username} · {m.presence}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={m.role === 'owner' ? 'accent' : 'neutral'}>{m.role}</Badge>
                {canAct && isOwner && (
                  <select
                    className="rounded-lg border border-raid-border bg-raid-surface px-2 py-1 text-xs text-raid-text"
                    value={m.role}
                    onChange={(e) => void setRole(m.user_id, e.target.value)}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="guest">guest</option>
                  </select>
                )}
                {canAct && (
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => void kick(m.user_id, m.username)}
                  >
                    <UserMinus size={14} /> Kick
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
