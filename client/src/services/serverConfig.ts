import { isWebApp } from '../lib/platform';

function defaultServerUrl(): string {
  if (isWebApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return import.meta.env.VITE_SERVER_URL?.replace(/\/$/, '') ?? 'https://screenraid.lama-worlds.com';
}

const DEFAULT_SERVER = defaultServerUrl();

/** Runtime API base URL (loaded from Tauri settings on boot, then updated in Settings). */
let serverUrl = DEFAULT_SERVER;

const urlChangeListeners = new Set<() => void>();

/** Subscribe to server URL changes (used by WebSocket to reconnect). */
export function onServerUrlChange(listener: () => void): () => void {
  urlChangeListeners.add(listener);
  return () => urlChangeListeners.delete(listener);
}

export function getServerUrl(): string {
  if (isWebApp() && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return serverUrl;
}

export function setServerUrl(url: string): void {
  const next = normalizeServerUrl(url, { allowEmpty: true });
  const changed = serverUrl !== next;
  serverUrl = next;
  if (changed) {
    urlChangeListeners.forEach((fn) => fn());
  }
}

/** Derive WebSocket base URL from HTTP(S) server URL. */
export function toWebSocketBase(httpBase: string): string {
  const trimmed = httpBase.trim().replace(/\/$/, '');
  if (trimmed.startsWith('https://')) {
    return trimmed.replace(/^https:\/\//, 'wss://');
  }
  if (trimmed.startsWith('http://')) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      throw new Error('Cannot use ws:// from an HTTPS page — set server URL to https://');
    }
    return trimmed.replace(/^http:\/\//, 'ws://');
  }
  throw new Error('Server URL must start with http:// or https://');
}

export function getWebSocketUrl(): string {
  return toWebSocketBase(getServerUrl());
}

export function normalizeServerUrl(
  url: string,
  options?: { allowEmpty?: boolean },
): string {
  const trimmed = url.trim().replace(/\/$/, '');
  if (!trimmed) {
    if (options?.allowEmpty) return DEFAULT_SERVER;
    throw new Error('Server URL is required');
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    throw new Error('Server URL must start with http:// or https://');
  }
  return trimmed;
}

/** Save server URL to runtime + Tauri settings file. */
export async function persistServerUrl(url: string): Promise<string> {
  const next = normalizeServerUrl(url);
  setServerUrl(next);
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const settings = await invoke<{
      autostart: boolean;
      default_duration_ms: number;
      default_volume: number;
      default_animation: string;
      cache_limit_mb: number;
      panic_hotkey: string;
      server_url: string;
      selected_monitor: string;
    }>('get_settings');
    await invoke('save_settings', {
      settings: { ...settings, server_url: next },
    });
  } catch {
    // Vite-only dev without Tauri: runtime URL still updated.
  }
  return next;
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
