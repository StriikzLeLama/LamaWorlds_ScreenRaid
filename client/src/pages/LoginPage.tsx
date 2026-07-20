import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { useAuthStore } from '../stores/authStore';
import { login as loginApi, getMe } from '../services/auth';
import { ApiError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { isReceiverApp, isWebApp } from '../lib/platform';

function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (err instanceof TypeError) {
    return `Cannot reach server at ${getServerUrl()}. Check Server URL and that the CT is online.`;
  }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ensureServerUrl(isWebApp() ? getServerUrl() : serverUrl);
      const res = await loginApi({ username, password });
      login({ access: res.access_token, refresh: res.refresh_token }, res.user);
      const profile = await getMe(res.access_token);
      setIsAdmin(Boolean(profile.is_admin));
      navigate('/', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

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
          {error && (
            <p className="rounded-xl border border-raid-danger/30 bg-raid-danger/10 px-3 py-2 text-sm text-raid-danger">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
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
