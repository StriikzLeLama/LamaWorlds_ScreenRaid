import { Outlet } from 'react-router-dom';
import { isTauriRuntime } from '../../lib/platform';
import { TitleBar } from './TitleBar';

/**
 * Login / register shell.
 * Title bar only when `__TAURI_INTERNALS__` is present — using `isReceiverApp()`
 * alone would mount TitleBar in browser previews of the receiver build and
 * crash on `getCurrentWindow()` (blank screen).
 */
export function AuthLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-raid-bg">
      {isTauriRuntime() && <TitleBar />}
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
