import { useEffect, useState } from 'react';
import { onWebSocketConnectionChange } from '../services/websocket';

export function useWsConnection(): boolean {
  const [connected, setConnected] = useState(false);

  useEffect(() => onWebSocketConnectionChange(setConnected), []);

  return connected;
}
