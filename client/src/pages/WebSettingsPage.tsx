import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { ReceiveRaidsToggle } from '../components/ReceiveRaidsToggle';
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

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

/** Web dashboard settings — account, receive-raids toggle, sign out. */
export function WebSettingsPage() {
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
        setError('Entre ton mot de passe actuel pour confirmer.');
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
      setMessage('Profil mis à jour.');
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
        setError('Les nouveaux mots de passe ne correspondent pas.');
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
      setMessage(
        'Mot de passe changé. Les autres appareils ont été déconnectés.',
      );
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-raid-text">Settings</h1>
        <p className="text-sm text-raid-text-secondary">
          Compte, sécurité et réception des raids. Les overlays passent par l’app desktop.
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
            Connecté en tant que <strong>@{user?.username ?? '—'}</strong>
          </p>
          <p className="mt-1 text-sm text-raid-text-secondary">
            Pseudo affiché : <strong className="text-raid-text">{user?.display_name ?? '—'}</strong>
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
              Déconnecter tous les appareils
            </Button>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-raid-text">Raids</h2>
          <ReceiveRaidsToggle />
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-raid-text">Pseudo & identifiant</h2>
          <p className="mb-4 text-xs text-raid-text-secondary">
            Le pseudo est visible dans les rooms. L’identifiant sert à te connecter (3–32, lettres /
            chiffres / _). Confirmation par mot de passe obligatoire.
          </p>
          <form onSubmit={(e) => void handleSaveProfile(e)} className="space-y-3">
            <Input
              label="Pseudo (display name)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
              autoComplete="nickname"
            />
            <Input
              label="Identifiant (username)"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              autoComplete="username"
            />
            <Input
              label="Mot de passe actuel"
              type="password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer le profil'}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-1 text-lg font-semibold text-raid-text">Mot de passe</h2>
          <p className="mb-4 text-xs text-raid-text-secondary">
            Min. 10 caractères, au moins une lettre et un chiffre. Change ton mdp déconnecte tous
            les autres appareils.
          </p>
          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
            <Input
              label="Mot de passe actuel"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              label="Nouveau mot de passe"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Min. 10 car. · lettre + chiffre"
            />
            <Input
              label="Confirmer le nouveau mot de passe"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Mise à jour…' : 'Changer le mot de passe'}
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2" accentHeader>
          <h2 className="mb-2 text-lg font-semibold text-raid-text">Desktop receiver</h2>
          <p className="text-sm text-raid-text-secondary">
            Overlays are rendered by the ScreenRaid desktop app (Tauri). This website manages rooms,
            friends, media, and sending pranks. Run <code className="text-raid-accent">npm run tauri:dev</code>{' '}
            on your PC, sign in with the same account, and turn on Receive raids in the receiver.
          </p>
        </Card>
      </div>
    </div>
  );
}
