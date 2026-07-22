import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { TurnstileWidget } from '../components/auth/TurnstileWidget';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { useAuthStore } from '../stores/authStore';
import {
  getMe,
  login as loginApi,
  verify2faLogin,
} from '../services/auth';
import { loginResponseToAuth } from '../types/auth';
import { getSecurityPolicy } from '../services/security';
import { ApiError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { isReceiverApp, isWebApp } from '../lib/platform';

function authErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid username') || msg.includes('password')) {
        return 'Identifiants incorrects (username ou mot de passe).';
      }
      return 'Identifiants incorrects (username ou mot de passe).';
    }
    if (err.status === 429 || err.code === 'RATE_LIMITED') {
      return 'Trop de tentatives de connexion. Réessaie dans ~1 minute.';
    }
    if (err.status === 403 || err.code === 'FORBIDDEN') {
      return 'Compte désactivé. Demande à un admin de le réactiver.';
    }
    return err.message || 'Login failed';
  }
  if (err instanceof TypeError || (err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message))) {
    return `Impossible de joindre le serveur (${getServerUrl()}). Vérifie l’URL / le tunnel.`;
  }
  if (err instanceof Error) return err.message;
  return 'Login failed';
}

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    getSecurityPolicy()
      .then((policy) => setTurnstileSiteKey(policy.turnstile_site_key))
      .catch(() => undefined);
  }, []);

  const finishLogin = async (accessToken: string, refreshToken: string) => {
    const profile = await getMe(accessToken);
    login(
      { access: accessToken, refresh: refreshToken },
      {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      },
    );
    setIsAdmin(Boolean(profile.is_admin));
    navigate('/', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ensureServerUrl(isWebApp() ? getServerUrl() : serverUrl);
      // Drop any stale session so login is a clean request.
      useAuthStore.getState().logout();
      const cleanUser = username.trim();
      if (requires2fa) {
        const auth = await verify2faLogin({ temp_token: tempToken, code: totpCode.trim() });
        await finishLogin(auth.access_token, auth.refresh_token);
        return;
      }
      if (showTurnstile && turnstileSiteKey && !turnstileToken) {
        setError('Complete the captcha verification.');
        return;
      }
      const res = await loginApi({
        username: cleanUser,
        password,
        turnstile_token: turnstileToken ?? undefined,
      });
      if (res.requires_2fa && res.temp_token) {
        setRequires2fa(true);
        setTempToken(res.temp_token);
        setTotpCode('');
        return;
      }
      const auth = loginResponseToAuth(res);
      if (!auth) {
        setError('Login failed — invalid server response.');
        return;
      }
      await finishLogin(auth.access_token, auth.refresh_token);
    } catch (err) {
      if (turnstileSiteKey) setShowTurnstile(true);
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const onTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  return (
    <div className="flex min-h-full w-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/logo.png"
            alt="LamaWorlds"
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover shadow-lg shadow-black/40"
            draggable={false}
          />
          <h1 className="text-2xl font-bold text-raid-text">
            {isReceiverApp() ? 'ScreenRaid Receiver' : 'Welcome to ScreenRaid'}
          </h1>
          <p className="mt-1 text-sm text-raid-text-secondary">
            {isReceiverApp()
              ? 'Sign in to receive overlays on this PC'
              : 'Sign in to your prank dashboard'}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-raid-text-secondary/80">
            LamaWorlds
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isReceiverApp() && <ServerUrlField onChange={setServerUrl} />}
          {!requires2fa ? (
            <>
              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="prankster42"
                required
                autoComplete="username"
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-raid-text-secondary">
                Entre le code de ton app d’authentification ou un code de récupération.
              </p>
              <Input
                label="Code 2FA"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                required
                autoComplete="one-time-code"
              />
            </>
          )}
          {showTurnstile && turnstileSiteKey && !requires2fa && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          )}
          {error && (
            <p className="rounded-xl border border-raid-danger/30 bg-raid-danger/10 px-3 py-2 text-sm text-raid-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : requires2fa ? 'Verify 2FA' : 'Sign in'}
          </Button>
          {requires2fa && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setRequires2fa(false);
                setTempToken('');
                setTotpCode('');
              }}
            >
              Back to password
            </Button>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-raid-text-secondary">
          No account?{' '}
          <Link to="/register" className="text-raid-accent hover:text-raid-accent-hover">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
