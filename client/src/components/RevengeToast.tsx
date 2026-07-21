import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from './ui';
import { onWsMessage } from '../services/websocket';
import { sendPrank, defaultOverlayConfig } from '../services/pranks';
import { useAuthStore } from '../stores/authStore';
import type { PrankIncomingPayload } from '../services/pranks';

interface PendingRevenge {
  roomId: string;
  senderId: string;
  senderName: string;
  expiresAt: number;
}

/** One-tap reply after receiving a raid (main window — overlays stay click-through). */
export function RevengeToast() {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [pending, setPending] = useState<PendingRevenge | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    return onWsMessage((type, payload) => {
      if (type !== 'prank:incoming') return;
      const prank = payload as PrankIncomingPayload;
      if (!prank.sender?.id || prank.sender.id === currentUserId) return;
      setPending({
        roomId: prank.room_id,
        senderId: prank.sender.id,
        senderName: prank.sender.display_name,
        expiresAt: Date.now() + 12_000,
      });
    });
  }, [currentUserId]);

  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), Math.max(0, pending.expiresAt - Date.now()));
    return () => window.clearTimeout(t);
  }, [pending]);

  if (!pending) return null;

  const revenge = async () => {
    setSending(true);
    try {
      const config = defaultOverlayConfig();
      config.animation = 'shake';
      config.sfx = 'whoosh';
      await sendPrank(pending.roomId, {
        target_id: pending.senderId,
        media_id: null,
        overlay_type: 'text',
        text_content: 'Revenge!',
        duration_ms: 3500,
        config,
      });
      setPending(null);
    } catch {
      // keep toast so user can retry
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[80] max-w-sm rounded-2xl border border-raid-accent/50 bg-raid-card p-4 shadow-xl">
      <p className="text-sm text-raid-text">
        Raid from <strong>{pending.senderName}</strong>
      </p>
      <div className="mt-3 flex gap-2">
        <Button disabled={sending} onClick={() => void revenge()}>
          <Send size={14} />
          {sending ? '…' : 'Revenge'}
        </Button>
        <Button variant="ghost" onClick={() => setPending(null)}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
