import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Image,
  Settings,
  ShieldAlert,
  DoorOpen,
  LogOut,
  Shield,
  Monitor,
  Radio,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { BrandLogo } from '../BrandLogo';
import { useAuthStore } from '../../stores/authStore';
import { useConsentStore } from '../../stores/consentStore';
import { isReceiverApp } from '../../lib/platform';
import { logout as logoutApi } from '../../services/auth';
import { clearLocalSession } from '../../services/session';

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/media', icon: Image, label: 'Media' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const desktopExtraNav = [
  { to: '/receiver', icon: Radio, label: 'Receiver' },
  { to: '/device', icon: Monitor, label: 'Device' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const pause = useConsentStore((s) => s.pause);
  const desktop = isReceiverApp();

  let navItems = [...baseNavItems];
  if (desktop) {
    navItems = [
      ...baseNavItems.slice(0, 4),
      ...desktopExtraNav,
      ...baseNavItems.slice(4),
    ];
  }
  if (isAdmin) {
    const settingsIdx = navItems.findIndex((i) => i.to === '/settings');
    const insertAt = settingsIdx >= 0 ? settingsIdx : navItems.length;
    navItems = [
      ...navItems.slice(0, insertAt),
      { to: '/admin', icon: Shield, label: 'Admin' },
      ...navItems.slice(insertAt),
    ];
  }

  const handlePanic = async () => {
    try {
      if (desktop) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('panic_hide_all');
      }
      await pause();
    } catch {
      // best-effort: panic should never block the UI
    }
  };

  const handleLogout = () => {
    const token = accessToken;
    const refresh = refreshToken;
    clearLocalSession();
    navigate('/login', { replace: true });
    if (token && refresh) {
      void logoutApi(token, refresh).catch(() => undefined);
    }
  };

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-raid-border bg-raid-surface">
      <div className="border-b border-raid-border px-4 py-3">
        <BrandLogo size={36} withWordmark subtitle={desktop ? 'Desktop' : 'Dashboard'} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150 ${
                isActive
                  ? 'border-l-2 border-raid-accent bg-raid-accent/10 text-raid-accent'
                  : 'text-raid-text-secondary hover:bg-raid-card hover:text-raid-text'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-raid-border p-3">
        {user && (
          <div className="flex items-center gap-3 rounded-xl bg-raid-card px-3 py-2">
            <img
              src="/logo-64.png"
              alt=""
              className="h-8 w-8 rounded-full object-cover"
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-raid-text">{user.display_name}</p>
              <p className="truncate text-xs text-raid-text-secondary">
                @{user.username}
                {isAdmin && <span className="ml-1 text-raid-accent">· admin</span>}
              </p>
            </div>
          </div>
        )}
        <Button variant="danger" className="w-full" onClick={handlePanic}>
          <ShieldAlert size={18} />
          {desktop ? 'Panic — Hide All' : 'Pause receiving'}
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          <LogOut size={18} />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
