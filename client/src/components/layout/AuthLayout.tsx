import { Outlet } from 'react-router-dom';
import { TitleBar } from './TitleBar';

/** Login / register shell with draggable title bar (frameless window). */
export function AuthLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-raid-bg">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
