import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { ReceiveRaidsToggle } from '../components/ReceiveRaidsToggle';
import { LanguageSelector } from '../components/LanguageSelector';
import { useThemeStore } from '../stores/themeStore';
import { ApiError } from '../services/api';
import {
  changeDisplayName,
  changePassword,
  changeUsername,
  getMe,
  logout as logoutApi,
  logoutAll,
} from '../services/auth';
import { clearLocalSession } from '../services/session';
import { useConsentStore } from '../stores/consentStore';
import { useAuthStore } from '../stores/authStore';
import { SecuritySettingsPanels } from '../components/settings/SecuritySettingsPanels';
import { isReceiverApp } from '../lib/platform';
import { useT } from '../hooks/useT';

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

/** Web dashboard settings — account, receive-raids toggle, sign out. */
export function WebSettingsPage() {
  const t = useT();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);
  const setUser = useAuthStore((s) => s.setUser);
  const login = useAuthStore((s) => s.login);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { loadFromServer } = useConsentStore();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [displayName, setDisplayName] = useState(user?.display_name ?? '');
  const [newUsername, setNewUsername] = useState(user?.username ?? '');
  const [profilePassword, setProfilePassword] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      loadFromServer().catch(() => undefined);
    }
  }, [loadFromServer, isAuthenticated]);

  useEffect(() => {
    setDisplayName(user?.display_name ?? '');
    setNewUsername(user?.username ?? '');
  }, [user?.display_name, user?.username]);

  const refreshAdminStatus = async () => {
    if (!accessToken) return;
    setError('');
    try {
      const profile = await getMe(accessToken);
      setIsAdmin(Boolean(profile.is_admin));
      setUser({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      });
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

  const handleLogoutAll = async () => {
    if (!accessToken) return;
    setBusy(true);
    setError('');
    try {
      await logoutAll(accessToken);
      clearLocalSession();
      navigate('/login', { replace: true });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!profilePassword) {
        setError(t('settings.enterPasswordToConfirm'));
        return;
      }
      let profile = await getMe(accessToken);
      if (displayName.trim() && displayName.trim() !== profile.display_name) {
        profile = await changeDisplayName(accessToken, {
          current_password: profilePassword,
          new_display_name: displayName.trim(),
        });
      }
      if (newUsername.trim() && newUsername.trim() !== profile.username) {
        profile = await changeUsername(accessToken, {
          current_password: profilePassword,
          new_username: newUsername.trim(),
        });
      }
      setUser({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      });
      setIsAdmin(Boolean(profile.is_admin));
      setProfilePassword('');
      setMessage(t('settings.profileUpdated'));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (newPassword !== confirmPassword) {
        setError(t('settings.passwordsMismatch'));
        return;
      }
      const res = await changePassword(accessToken, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      login({ access: res.access_token, refresh: res.refresh_token }, res.user);
      const profile = await getMe(res.access_token);
      setIsAdmin(Boolean(profile.is_admin));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage(t('settings.passwordChanged'));
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">{t('settings.title')}</h1>
        <p className="text-sm text-raid-text-secondary">
          {isReceiverApp() ? t('settings.subtitleDesktop') : t('settings.subtitleWeb')}
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
            {t('settings.signedInAs')} <strong>@{user?.username ?? '—'}</strong>
          </p>
          <p className="mt-1 text-sm text-raid-text-secondary">
            {t('settings.displayNameShown')}{' '}
            <strong className="text-raid-text">{user?.display_name ?? '—'}</strong>
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
            <Button variant="danger" disabled={busy} onClick={() => void handleLogoutAll()}>
              {t('settings.signOutAllDevices')}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">{t('common.language')}</h2>
          <LanguageSelector />
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-semibold text-raid-text">{t('theme.title')}</h2>
          <p className="mb-4 text-xs text-raid-text-secondary">{t('theme.hint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={theme === 'dark' ? 'primary' : 'secondary'}
              onClick={() => setTheme('dark')}
            >
              {t('theme.dark')}
            </Button>
            <Button
              variant={theme === 'light' ? 'primary' : 'secondary'}
              onClick={() => setTheme('light')}
            >
              {t('theme.light')}
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Raids</h2>
          <ReceiveRaidsToggle />
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-raid-text">{t('settings.profileTitle')}</h2>
          <p className="mb-4 text-xs text-raid-text-secondary">{t('settings.profileHint')}</p>
          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-3">
            <Input
              label={t('settings.displayName')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              autoComplete="nickname"
            />
            <Input
              label={t('settings.username')}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              autoComplete="username"
            />
            <Input
              label={t('settings.currentPassword')}
              type="password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" disabled={busy}>
              {busy ? t('settings.saving') : t('settings.saveProfile')}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-raid-text">{t('settings.passwordTitle')}</h2>
          <p className="mb-4 text-xs text-raid-text-secondary">{t('settings.passwordHint')}</p>
          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
            <Input
              label={t('settings.currentPassword')}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label={t('settings.newPassword')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              placeholder={t('settings.passwordPlaceholder')}
            />
            <Input
              label={t('settings.confirmNewPassword')}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
            <Button type="submit" disabled={busy}>
              {busy ? t('settings.updating') : t('settings.changePassword')}
            </Button>
          </form>
        </Card>

        {isReceiverApp() ? (
          <Card className="lg:col-span-2" accentHeader>
            <h2 className="mb-2 text-lg font-semibold text-raid-text">Overlays & device</h2>
            <p className="mb-3 text-sm text-raid-text-secondary">{t('settings.overlaysDeviceHint')}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/device"
                className="rounded-xl border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-accent hover:bg-raid-card"
              >
                Device settings
              </Link>
              <Link
                to="/receiver"
                className="rounded-xl border border-raid-border bg-raid-surface px-3 py-2 text-sm text-raid-accent hover:bg-raid-card"
              >
                Receiver status
              </Link>
            </div>
          </Card>
        ) : (
          <Card className="lg:col-span-2" accentHeader>
            <h2 className="mb-2 text-lg font-semibold text-raid-text">Desktop app</h2>
            <p className="text-sm text-raid-text-secondary">{t('settings.desktopAppHint')}</p>
          </Card>
        )}

        {accessToken && (
          <SecuritySettingsPanels
            accessToken={accessToken}
            onMessage={setMessage}
            onError={setError}
          />
        )}
      </div>
    </div>
  );
}
