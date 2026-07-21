import { Outlet } from 'react-router-dom';
import { isWebApp } from '../../lib/platform';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { RevengeToast } from '../RevengeToast';

export function MainLayout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {!isWebApp() && <TitleBar />}
      {isWebApp() && (
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-raid-border bg-raid-surface px-6">
          <div className="h-2.5 w-2.5 rounded-full bg-raid-accent" />
          <span className="text-sm font-semibold text-raid-text">ScreenRaid</span>
        </header>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-raid-bg p-6">
          <Outlet />
        </main>
      </div>
      <RevengeToast />
    </div>
  );
}
