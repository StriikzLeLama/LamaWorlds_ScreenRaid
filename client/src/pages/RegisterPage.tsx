import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { TurnstileWidget } from '../components/auth/TurnstileWidget';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { LanguageSelector } from '../components/LanguageSelector';
import { useAuthStore } from '../stores/authStore';
import { register as registerApi, getMe } from '../services/auth';
import { getSecurityPolicy } from '../services/security';
import { getServerUrl } from '../services/serverConfig';
import { isReceiverApp, isWebApp } from '../lib/platform';
import { authErrorMessage } from '../lib/authErrors';
import { useT } from '../hooks/useT';

export function RegisterPage() {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);
  const [serverUrl, setServerUrl] = useState(getServerUrl());
  const [form, setForm] = useState({
    username: '',
    email: '',
    display_name: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  useEffect(() => {
    getSecurityPolicy()
      .then((policy) => {
        setTurnstileSiteKey(policy.turnstile_site_key);
        setTurnstileRequired(policy.turnstile_required_on_register);
      })
      .catch(() => undefined);
  }, []);

  const onTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (turnstileRequired && !turnstileToken) {
      setError(t('auth.completeCaptcha'));
      return;
    }
    setLoading(true);
    try {
      await ensureServerUrl(isWebApp() ? getServerUrl() : serverUrl);
      useAuthStore.getState().logout();
      const res = await registerApi({
        username: form.username.trim(),
        email: form.email.trim(),
        display_name: (form.display_name || form.username).trim(),
        password: form.password.trim(),
        turnstile_token: turnstileToken ?? undefined,
      });
      login({ access: res.access_token, refresh: res.refresh_token }, res.user);
      try {
        const profile = await getMe(res.access_token);
        setIsAdmin(Boolean(profile.is_admin));
      } catch {
        setIsAdmin(false);
      }
      const next = searchParams.get('next');
      navigate(next?.startsWith('/') ? next : '/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err, 'Registration failed'));
    } finally {
      setLoading(false);
    }
  };

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
          <h1 className="text-2xl font-bold text-raid-text">Create account</h1>
          <p className="mt-1 text-sm text-raid-text-secondary">
            Join the consent-based prank platform
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-raid-text-secondary/80">
            LamaWorlds
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isReceiverApp() && <ServerUrlField onChange={setServerUrl} />}
          <Input
            label="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="prankster42"
            required
            autoComplete="username"
          />
          <Input
            label="Display name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Prankster"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            autoComplete="email"
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Min. 10 characters · letter + digit"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
          />
          <p className="text-xs text-raid-text-secondary">{t('auth.passwordHint')}</p>
          {turnstileRequired && turnstileSiteKey && (
            <TurnstileWidget siteKey={turnstileSiteKey} onToken={onTurnstileToken} />
          )}
          {error && (
            <p className="rounded-xl border border-raid-danger/30 bg-raid-danger/10 px-3 py-2 text-sm text-raid-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-raid-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-raid-accent hover:text-raid-accent-hover">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
