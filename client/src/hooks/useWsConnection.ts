import { useEffect, useState } from 'react';
import {
  onWebSocketConnectionChange,
  onWebSocketRttChange,
} from '../services/websocket';

export interface WsConnectionState {
  connected: boolean;
  rttMs: number | null;
}

export function useWsConnection(): WsConnectionState {
  const [connected, setConnected] = useState(false);
  const [rttMs, setRttMs] = useState<number | null>(null);

  useEffect(() => {
    const unsubConn = onWebSocketConnectionChange(setConnected);
    const unsubRtt = onWebSocketRttChange(setRttMs);
    return () => {
      unsubConn();
      unsubRtt();
    };
  }, []);

  return { connected, rttMs };
}
