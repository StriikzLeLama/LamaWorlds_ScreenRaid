import { NavLink, useNavigate } from 'react-router-dom';
import { Home, LogOut, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { logout as logoutApi } from '../../services/auth';
import { clearLocalSession } from '../../services/session';

const navItems = [
  { to: '/', icon: Home, label: 'Receiver' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function ReceiverSidebar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);

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
    <aside className="flex w-52 shrink-0 flex-col border-r border-raid-border bg-raid-surface">
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
          <div className="rounded-xl bg-raid-card px-3 py-2">
            <p className="truncate text-sm font-medium text-raid-text">{user.display_name}</p>
            <p className="truncate text-xs text-raid-text-secondary">@{user.username}</p>
          </div>
        )}
        <Button variant="ghost" className="w-full" onClick={handleLogout}>
          <LogOut size={18} />
          Sign out
        </Button>
      </div>
    </aside>
  );
}
