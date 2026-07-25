import { Outlet } from 'react-router-dom';
import { isTauriRuntime } from '../../lib/platform';
import { TitleBar } from './TitleBar';

/** Login / register shell. Frameless title bar only in the Tauri receiver app. */
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
