import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Card, Badge, Button } from '../ui';
import type { ActivityItem } from '../../services/activity';
import type { ScheduledPrankItem } from '../../services/scheduled';
import type { RoomMember } from '../../types/room';
import { useT } from '../../hooks/useT';

type FeedTab = 'live' | 'queued';

interface Props {
  activity: ActivityItem[];
  pendingScheduled: ScheduledPrankItem[];
  members: RoomMember[];
  onCancelScheduled: (schedId: string) => void;
}

export function RoomFeedPanel({
  activity,
  pendingScheduled,
  members,
  onCancelScheduled,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<FeedTab>('live');

  const memberName = (userId: string | null | undefined) =>
    userId ? members.find((m) => m.user_id === userId)?.display_name ?? userId.slice(0, 8) : null;

  return (
    <Card className="lg:col-span-2">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-raid-border pb-3">
        <h2 className="text-lg font-semibold text-raid-text">{t('feed.title')}</h2>
        <div className="ml-auto flex gap-1 rounded-xl bg-raid-surface p-1">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'live'
                ? 'bg-raid-card text-raid-text shadow-sm'
                : 'text-raid-text-secondary hover:text-raid-text'
            }`}
            onClick={() => setTab('live')}
          >
            {t('feed.live')}
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'queued'
                ? 'bg-raid-card text-raid-text shadow-sm'
                : 'text-raid-text-secondary hover:text-raid-text'
            }`}
            onClick={() => setTab('queued')}
          >
            <Clock size={14} className="mr-1 inline" />
            {t('feed.queued', { n: pendingScheduled.length })}
          </button>
        </div>
      </div>

      {tab === 'live' ? (
        activity.length === 0 ? (
          <p className="text-sm text-raid-text-secondary">{t('feed.noActivity')}</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-raid-surface/60"
              >
                <p className="min-w-0 truncate text-raid-text">
                  <span className="font-medium">{a.actor_name ?? '?'}</span>
                  <span className="text-raid-text-secondary"> → </span>
                  <span>{a.target_name ?? t('feed.everyone')}</span>
                  {a.overlay_type && (
                    <span className="text-raid-text-secondary"> · {a.overlay_type}</span>
                  )}
                  {a.status && (
                    <Badge variant="neutral">
                      {a.status}
                    </Badge>
                  )}
                </p>
                <time className="shrink-0 text-xs text-raid-text-secondary">
                  {new Date(a.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )
      ) : pendingScheduled.length === 0 ? (
        <p className="text-sm text-raid-text-secondary">{t('feed.noQueued')}</p>
      ) : (
        <ul className="space-y-1">
          {pendingScheduled.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-raid-surface px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="text-raid-text">
                  {s.overlay_type} · {s.trigger_type}
                </p>
                <p className="text-xs text-raid-text-secondary">
                  {s.trigger_type === 'at_time' && s.run_at
                    ? new Date(s.run_at).toLocaleString()
                    : s.online_user_id
                      ? t('feed.whenOnline', {
                          name: memberName(s.online_user_id) ?? t('feed.user'),
                        })
                      : t('feed.pending')}
                </p>
              </div>
              <Button
                variant="ghost"
                className="!px-2 !py-1 text-xs"
                onClick={() => onCancelScheduled(s.id)}
              >
                {t('feed.cancel')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
