const DEFAULT_SERVER =
  import.meta.env.VITE_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:8080';

/** Runtime API base URL (loaded from Tauri settings on boot, then updated in Settings). */
let serverUrl = DEFAULT_SERVER;

const urlChangeListeners = new Set<() => void>();

/** Subscribe to server URL changes (used by WebSocket to reconnect). */
export function onServerUrlChange(listener: () => void): () => void {
  urlChangeListeners.add(listener);
  return () => urlChangeListeners.delete(listener);
}

export function getServerUrl(): string {
  return serverUrl;
}

export function setServerUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, '');
  const next = trimmed || DEFAULT_SERVER;
  const changed = serverUrl !== next;
  serverUrl = next;
  // Reconnect WS when the target host changes while still logged in.
  if (changed) {
    urlChangeListeners.forEach((fn) => fn());
  }
}

/** Apply persisted Tauri settings before the first API call. */
export async function loadServerUrlFromSettings(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const settings = await invoke<{ server_url?: string }>('get_settings');
    if (settings.server_url?.trim()) {
      setServerUrl(settings.server_url);
    }
  } catch {
    // Non-Tauri dev (browser-only) falls back to VITE_SERVER_URL.
  }
}
