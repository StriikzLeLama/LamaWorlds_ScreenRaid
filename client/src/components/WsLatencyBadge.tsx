import { Badge } from './ui';
import { useWsConnection } from '../hooks/useWsConnection';
import { useT } from '../hooks/useT';

export function WsLatencyBadge() {
  const t = useT();
  const { connected, rttMs } = useWsConnection();

  if (!connected) {
    return <Badge variant="warning">{t('ws.offline')}</Badge>;
  }

  return (
    <Badge variant="success">
      {rttMs != null ? t('ws.liveMs', { ms: rttMs }) : t('ws.live')}
    </Badge>
  );
}
