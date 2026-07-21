import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauriRuntime } from '../lib/platform';
import { log } from '../lib/log';

/** Check GitHub releases for a signed update and install silently when available. */
export async function checkForAppUpdates(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const update = await check();
    if (!update?.available) {
      log.info('No app update available');
      return;
    }
    log.info('Update available:', update.version);
    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    log.warn('App update check failed', err);
  }
}
