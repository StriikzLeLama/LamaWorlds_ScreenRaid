import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { TurnstileWidget } from '../components/auth/TurnstileWidget';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { useAuthStore } from '../stores/authStore';
import { getMe, login as loginApi, verify2faLogin } from '../services/auth';
import { loginResponseToAuth } from '../types/auth';
import { getSecurityPolicy } from '../services/security';
import { checkServerHealth } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { isReceiverApp, isWebApp } from '../lib/platform';
import {
  authErrorMessage,
  loadLastUsername,
  saveLastUsername,
} from '../lib/authErrors';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [username, setUsername] = useState(() => loadLastUsername());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverOk, setServerOk] = useState<boolean | null>(null);
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
    void checkServerHealth().then(setServerOk);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      void checkServerHealth().then(setServerOk);
    }, 20_000);
    return () => window.clearInterval(id);
  }, []);

  const finishLogin = async (auth: {
    access_token: string;
    refresh_token: string;
    user: { id: string; username: string; display_name: string; avatar_url: string | null };
  }) => {
    saveLastUsername(auth.user.username);
    login(
      { access: auth.access_token, refresh: auth.refresh_token },
      {
        id: auth.user.id,
        username: auth.user.username,
        display_name: auth.user.display_name,
        avatar_url: auth.user.avatar_url,
      },
    );
    try {
      const profile = await getMe(auth.access_token);
      setIsAdmin(Boolean(profile.is_admin));
      login(
        { access: auth.access_token, refresh: auth.refresh_token },
        {
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        },
      );
    } catch {
      setIsAdmin(false);
    }
    const next = searchParams.get('next');
    navigate(next?.startsWith('/') ? next : '/', { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ensureServerUrl(isWebApp() ? getServerUrl() : serverUrl);
      useAuthStore.getState().logout();
      const cleanUser = username.trim();
      const cleanPassword = password.trim();
      if (!cleanUser || !cleanPassword) {
        setError('Username et mot de passe requis.');
        return;
      }
      if (requires2fa) {
        const auth = await verify2faLogin({ temp_token: tempToken, code: totpCode.trim() });
        await finishLogin(auth);
        return;
      }
      if (showTurnstile && turnstileSiteKey && !turnstileToken) {
        setError('Complète le captcha.');
        return;
      }
      const res = await loginApi({
        username: cleanUser,
        password: cleanPassword,
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
        setError(
          'Réponse serveur inattendue. Redéploie le server / rebuild le client.',
        );
        return;
      }
      await finishLogin(auth);
    } catch (err) {
      if (turnstileSiteKey) setShowTurnstile(true);
      setError(authErrorMessage(err, 'Login failed'));
      setServerOk(await checkServerHealth());
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
          <h1 className="text-2xl font-bold text-raid-text">Welcome to ScreenRaid</h1>
          <p className="mt-1 text-sm text-raid-text-secondary">
            {isReceiverApp()
              ? 'Sign in to manage rooms, send raids, and receive overlays on this PC'
              : 'Sign in to your prank dashboard'}
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-raid-border bg-raid-surface px-2.5 py-1 text-[11px]">
            {serverOk === null ? (
              <Loader2 size={12} className="animate-spin text-raid-text-secondary" />
            ) : serverOk ? (
              <Wifi size={12} className="text-raid-success" />
            ) : (
              <WifiOff size={12} className="text-raid-danger" />
            )}
            <span className="text-raid-text-secondary">
              {serverOk === null
                ? 'Checking server…'
                : serverOk
                  ? 'Server online'
                  : 'Server unreachable'}
            </span>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
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
                autoFocus={!username}
              />
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="pr-11"
                />
                <button
                  type="button"
                  className="absolute right-3 top-[30px] text-raid-text-secondary hover:text-raid-text"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="rounded-xl border border-raid-accent/30 bg-raid-accent/10 px-3 py-2 text-sm text-raid-text">
                2FA requis pour <strong>@{username.trim() || '…'}</strong> — code app ou recovery.
              </p>
              <Input
                label="Code 2FA"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
                required
                autoComplete="one-time-code"
                autoFocus
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
          <Button
            type="submit"
            className="w-full"
            disabled={loading || serverOk === false}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Signing in…
              </>
            ) : requires2fa ? (
              'Verify 2FA'
            ) : (
              'Sign in'
            )}
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
