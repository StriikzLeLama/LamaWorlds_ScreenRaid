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
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { useConsentStore } from '../../stores/consentStore';
import { logout as logoutApi } from '../../services/auth';
import { clearLocalSession } from '../../services/session';

const baseNavItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/rooms', icon: DoorOpen, label: 'Rooms' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/media', icon: Image, label: 'Media' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const pause = useConsentStore((s) => s.pause);

  const navItems = isAdmin
    ? [...baseNavItems.slice(0, 4), { to: '/admin', icon: Shield, label: 'Admin' }, ...baseNavItems.slice(4)]
    : baseNavItems;

  const handlePanic = async () => {
    await invoke('panic_hide_all');
    await pause();
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
      <nav className="flex-1 space-y-1 p-3">
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-raid-surface text-xs font-medium text-raid-text-secondary">
              {user.display_name.charAt(0).toUpperCase()}
            </div>
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
          Panic — Hide All
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          <LogOut size={18} />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
