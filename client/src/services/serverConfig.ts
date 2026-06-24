const DEFAULT_SERVER =
  import.meta.env.VITE_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:8080';

let serverUrl = DEFAULT_SERVER;

export function getServerUrl(): string {
  return serverUrl;
}

export function setServerUrl(url: string): void {
  const trimmed = url.trim().replace(/\/$/, '');
  serverUrl = trimmed || DEFAULT_SERVER;
}

export async function loadServerUrlFromSettings(): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const settings = await invoke<{ server_url?: string }>('get_settings');
    if (settings.server_url?.trim()) {
      setServerUrl(settings.server_url);
    }
  } catch {
    // Browser-only dev without Tauri falls back to VITE_SERVER_URL
  }
}
