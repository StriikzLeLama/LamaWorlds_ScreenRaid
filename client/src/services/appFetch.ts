import { isTauriRuntime } from '../lib/platform';

/**
 * Browser `fetch` in the packaged Tauri webview is subject to CORS
 * (origin `https://tauri.localhost`). Use the Rust HTTP plugin instead.
 */
export async function appFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (isTauriRuntime()) {
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
    return tauriFetch(input, init);
  }
  return fetch(input, init);
}
