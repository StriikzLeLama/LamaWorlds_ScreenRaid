/**
 * Centralized debug logger. All ScreenRaid client logs are prefixed `[SR]`
 * so they can be filtered in the webview devtools console (`[SR]` filter).
 *
 * Inside the Tauri receiver, logs are also forwarded to the Rust logger
 * (`debug_log` command) so they appear in the `tauri:dev` terminal and the
 * log file — this is essential for the overlay windows, whose devtools
 * cannot be opened while the click-through fullscreen surface is active.
 *
 * Disable by setting `VITE_DEBUG=false`.
 */
const DEBUG = (import.meta.env.VITE_DEBUG ?? 'true') !== 'false';

function fmt(parts: unknown[]): string {
  return parts
    .map((p) => (typeof p === 'string' ? p : safeStringify(p)))
    .join(' ');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Fire-and-forget forward to Rust logger. Dynamic import keeps the Tauri API
// out of the web bundle and avoids any import-time side effects.
function forwardToRust(level: 'info' | 'warn' | 'error', message: string): void {
  if (!isTauriRuntime()) return;
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('debug_log', { level, message }))
    .catch(() => undefined);
}

export const log = {
  info: (...parts: unknown[]): void => {
    if (DEBUG) console.log('[SR]', fmt(parts));
    forwardToRust('info', fmt(parts));
  },
  warn: (...parts: unknown[]): void => {
    console.warn('[SR]', fmt(parts));
    forwardToRust('warn', fmt(parts));
  },
  error: (...parts: unknown[]): void => {
    console.error('[SR]', fmt(parts));
    forwardToRust('error', fmt(parts));
  },
};
