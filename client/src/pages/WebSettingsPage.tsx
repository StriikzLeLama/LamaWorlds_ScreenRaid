import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '../components/ui';
import { getMe } from '../services/auth';
import { clearLocalSession } from '../services/session';
import { logout as logoutApi } from '../services/auth';
import { useConsentStore } from '../stores/consentStore';
import { useAuthStore } from '../stores/authStore';

/** Web dashboard settings — account, consent, sign out. */
export function WebSettingsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { globalConsent, isPaused, grant, revoke, resume, loadFromServer } = useConsentStore();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer().catch(() => undefined);
    }
  }, [loadFromServer, isAuthenticated]);

  const refreshAdminStatus = async () => {
    if (!accessToken) return;
    setError('');
    try {
      const profile = await getMe(accessToken);
      setIsAdmin(Boolean(profile.is_admin));
      setMessage(
        profile.is_admin
          ? 'Admin access confirmed for this account.'
          : `Not admin. Set ADMIN_USERNAMES=${user?.username ?? '?'} in the server .env and rebuild Docker.`,
      );
    } catch {
      setError('Could not refresh account status from server.');
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">Settings</h1>
        <p className="text-sm text-raid-text-secondary">
          Account and consent for the web dashboard. Install the desktop receiver to display overlays.
        </p>
      </div>

      {error && (
        <Card className="border-raid-danger/40 bg-raid-danger/10">
          <p className="text-sm text-raid-danger">{error}</p>
        </Card>
      )}
      {message && (
        <Card className="border-raid-success/40 bg-raid-success/10">
          <p className="text-sm text-raid-success">{message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Account</h2>
          <p className="text-sm text-raid-text">
            Logged in as <strong>@{user?.username ?? '—'}</strong>
          </p>
          <p className="mt-2 text-sm text-raid-text-secondary">
            Admin panel:{' '}
            <span className={isAdmin ? 'text-raid-success' : 'text-raid-danger'}>
              {isAdmin ? 'enabled' : 'disabled'}
            </span>
          </p>
          {!isAdmin && (
            <p className="mt-2 text-xs text-raid-text-secondary">
              Set <code className="text-raid-accent">ADMIN_USERNAMES={user?.username ?? 'your_username'}</code>{' '}
              in the server <code className="text-raid-accent">.env</code>, then rebuild Docker.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void refreshAdminStatus()}>
              Refresh admin status
            </Button>
            <Button variant="ghost" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Consent</h2>
          <p className="mb-4 text-sm text-raid-text-secondary">
            Consent is shared with the desktop receiver. Grant it here or in the receiver app before
            overlays can appear on your screen.
          </p>
          <div className="flex flex-wrap gap-3">
            {!globalConsent ? (
              <Button onClick={() => void grant()}>Grant Consent</Button>
            ) : (
              <Button variant="secondary" onClick={() => void revoke()}>
                Revoke Consent
              </Button>
            )}
            {isPaused && (
              <Button variant="secondary" onClick={() => void resume()}>
                Resume Receiving
              </Button>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2" accentHeader>
          <h2 className="mb-2 text-lg font-semibold text-raid-text">Desktop receiver</h2>
          <p className="text-sm text-raid-text-secondary">
            Overlays are rendered by the ScreenRaid desktop app (Tauri). This website manages rooms,
            friends, media, and sending pranks. Run <code className="text-raid-accent">npm run tauri:dev</code>{' '}
            on your PC, sign in with the same account, and grant consent in the receiver.
          </p>
        </Card>
      </div>
    </div>
  );
}
