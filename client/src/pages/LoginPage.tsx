import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Wifi, WifiOff } from 'lucide-react';
import { Card, Button, Input } from '../components/ui';
import { TurnstileWidget } from '../components/auth/TurnstileWidget';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { LanguageSelector } from '../components/LanguageSelector';
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
import { useT } from '../hooks/useT';

export function LoginPage() {
  const t = useT();
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
        setError(t('auth.usernamePasswordRequired'));
        return;
      }
      if (requires2fa) {
        const auth = await verify2faLogin({ temp_token: tempToken, code: totpCode.trim() });
        await finishLogin(auth);
        return;
      }
      if (showTurnstile && turnstileSiteKey && !turnstileToken) {
        setError(t('auth.completeCaptcha'));
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
        setError(t('auth.unexpectedServerResponse'));
        return;
      }
      await finishLogin(auth);
    } catch (err) {
      if (turnstileSiteKey) setShowTurnstile(true);
      setError(authErrorMessage(err, t('login.loginFailed')));
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
          <div className="mb-3 flex justify-end">
            <LanguageSelector compact />
          </div>
          <img
            src="/logo.png"
            alt="LamaWorlds"
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover shadow-lg shadow-black/40"
            draggable={false}
          />
          <h1 className="text-2xl font-bold text-raid-text">{t('login.title')}</h1>
          <p className="mt-1 text-sm text-raid-text-secondary">
            {isReceiverApp() ? t('login.subtitleDesktop') : t('login.subtitleWeb')}
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
                ? t('login.checkingServer')
                : serverOk
                  ? t('login.serverOnline')
                  : t('login.serverUnreachable')}
            </span>
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          {isReceiverApp() && (
            <ServerUrlField
              onChange={(url) => {
                setServerUrl(url);
                // Clear sticky "unreachable" so Sign in is not stuck disabled
                // after the user edits the URL (health is re-checked on Test / submit).
                setServerOk(null);
              }}
              onHealthChange={setServerOk}
            />
          )}
          {!requires2fa ? (
            <>
              <Input
                label={t('auth.username')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="prankster42"
                required
                autoComplete="username"
                autoFocus={!username}
              />
              <div className="relative">
                <Input
                  label={t('auth.password')}
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
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="rounded-xl border border-raid-accent/30 bg-raid-accent/10 px-3 py-2 text-sm text-raid-text">
                {t('auth.twoFaRequired', { user: username.trim() || '…' })}
              </p>
              <Input
                label={t('auth.twoFaCode')}
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
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> {t('login.signingIn')}
              </>
            ) : requires2fa ? (
              t('login.verify2fa')
            ) : (
              t('login.signIn')
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
              {t('login.backToPassword')}
            </Button>
          )}
        </form>
        <p className="mt-4 text-center text-sm text-raid-text-secondary">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-raid-accent hover:text-raid-accent-hover">
            {t('login.register')}
          </Link>
        </p>
      </Card>
    </div>
  );
}
