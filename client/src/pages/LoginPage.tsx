import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { useAuthStore } from '../stores/authStore';
import { login as loginApi } from '../services/auth';
import { ApiError, getServerUrl } from '../services/api';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await loginApi({ username, password });
      login({ access: res.access_token, refresh: res.refresh_token }, res.user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-raid-bg p-6">
      <Card className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-raid-accent/15">
            <div className="h-4 w-4 rounded-full bg-raid-accent" />
          </div>
          <h1 className="text-2xl font-bold text-raid-text">Welcome to ScreenRaid</h1>
        <p className="mt-1 text-sm text-raid-text-secondary">
          Sign in to your prank dashboard
        </p>
        <p className="mt-2 text-xs text-raid-text-secondary">Server: {getServerUrl()}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
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
