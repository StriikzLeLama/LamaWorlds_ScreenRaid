/** `web` = SPA served by the server; `receiver` = Tauri desktop (dashboard + overlays). */
export type AppMode = 'web' | 'receiver';

export const APP_MODE = (import.meta.env.VITE_APP_MODE ?? 'receiver') as AppMode;

export function isWebApp(): boolean {
  return APP_MODE === 'web';
}

/** Desktop / Tauri build (full product UI + overlay receiver). */
export function isReceiverApp(): boolean {
  return APP_MODE === 'receiver';
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}
