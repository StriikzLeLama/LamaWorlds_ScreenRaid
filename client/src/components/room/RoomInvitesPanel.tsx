import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import { Button, Input, Modal } from '../ui';
import {
  createRoomInvite,
  deactivateRoomInvite,
  listRoomInvites,
  type RoomInvite,
} from '../../services/rooms';
import { inviteShareUrl } from '../../lib/invites';
import { useT } from '../../hooks/useT';

interface Props {
  roomId: string;
  canModerate: boolean;
  onError: (msg: string) => void;
}

function parseOptionalInt(value: string, fallback: number): number {
  if (value.trim() === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function formatUsesLabel(inv: RoomInvite, t: ReturnType<typeof useT>): string {
  if (inv.max_uses === 0) {
    return inv.use_count > 0
      ? t('invite.unlimitedUsesWithCount', { used: inv.use_count })
      : t('invite.unlimitedUses');
  }
  return t('invite.uses', { used: inv.use_count, max: inv.max_uses });
}

export function RoomInvitesPanel({ roomId, canModerate, onError }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [expiresHours, setExpiresHours] = useState('24');
  const [maxUses, setMaxUses] = useState('1');
  const [role, setRole] = useState<'guest' | 'member'>('guest');
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!canModerate) return;
    listRoomInvites(roomId)
      .then(setInvites)
      .catch((e) => onError(e instanceof Error ? e.message : t('invite.loadFailed')));
  }, [canModerate, roomId, onError, t]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const invite = await createRoomInvite(roomId, {
        role,
        expires_in_hours: parseOptionalInt(expiresHours, 24),
        max_uses: parseOptionalInt(maxUses, 1),
      });
      setInvites((prev) => [invite, ...prev]);
      const url = inviteShareUrl(invite.token);
      await navigator.clipboard.writeText(url);
      setCopied(invite.id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      onError(e instanceof Error ? e.message : t('invite.createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (token: string, id: string) => {
    try {
      await navigator.clipboard.writeText(inviteShareUrl(token));
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      onError(t('invite.copyFailed'));
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!confirm(t('invite.revokeConfirm'))) return;
    try {
      await deactivateRoomInvite(roomId, inviteId);
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch (e) {
      onError(e instanceof Error ? e.message : t('invite.revokeFailed'));
    }
  };

  if (!canModerate) return null;

  return (
    <>
      <Button
        variant="secondary"
        className="!px-2.5 !py-1 text-xs"
        onClick={() => setOpen(true)}
      >
        <Link2 size={14} />
        {t('invite.button')}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('invite.title')} size="xl">
        <p className="mb-4 text-xs text-raid-text-secondary">{t('invite.hint')}</p>

        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-raid-text-secondary">
            {t('invite.role')}
            <select
              className="mt-1 w-full rounded-lg border border-raid-border bg-raid-surface px-2 py-1.5 text-sm text-raid-text"
              value={role}
              onChange={(e) => setRole(e.target.value as 'guest' | 'member')}
            >
              <option value="guest">{t('invite.roleGuest')}</option>
              <option value="member">{t('invite.roleMember')}</option>
            </select>
          </label>
          <Input
            label={t('invite.expiresHours')}
            type="number"
            min={0}
            max={8760}
            value={expiresHours}
            onChange={(e) => setExpiresHours(e.target.value)}
          />
          <Input
            label={t('invite.maxUses')}
            type="number"
            min={0}
            max={1000}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
          />
        </div>
        <p className="mt-2 text-xs text-raid-text-secondary">{t('invite.zeroUnlimited')}</p>

        <Button className="mt-4" disabled={busy} onClick={() => void handleCreate()}>
          {busy ? t('invite.creating') : t('invite.createCopy')}
        </Button>

        {invites.length > 0 && (
          <ul className="mt-6 space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raid-surface px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-medium text-raid-text">
                    {inv.role} · {formatUsesLabel(inv, t)}
                  </p>
                  <p className="text-raid-text-secondary">
                    {inv.expires_at
                      ? t('invite.expires', {
                          date: new Date(inv.expires_at).toLocaleString(),
                        })
                      : t('invite.noExpiry')}
                    {inv.created_by_display_name &&
                      ` · ${t('invite.by', { name: inv.created_by_display_name })}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1"
                    onClick={() => void handleCopy(inv.token, inv.id)}
                  >
                    <Copy size={14} />
                    {copied === inv.id ? t('invite.copied') : t('invite.copy')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-raid-danger"
                    onClick={() => void handleRevoke(inv.id)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
