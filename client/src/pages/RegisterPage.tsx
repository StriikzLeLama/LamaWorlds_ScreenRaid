import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '../components/ui';
import { ensureServerUrl, ServerUrlField } from '../components/auth/ServerUrlField';
import { useAuthStore } from '../stores/authStore';
import { register as registerApi, getMe } from '../services/auth';
import { ApiError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { isReceiverApp, isWebApp } from '../lib/platform';

function authErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  if (err instanceof TypeError) {
    return `Cannot reach server at ${getServerUrl()}. Check Server URL and that the CT is online.`;
  }
  return 'Registration failed';
}

export function RegisterPage() {
  const navigate = useNavigate();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await ensureServerUrl(isWebApp() ? getServerUrl() : serverUrl);
      const res = await registerApi({
        username: form.username,
        email: form.email,
        display_name: form.display_name || form.username,
        password: form.password,
      });
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
          <p className="text-xs text-raid-text-secondary">
            Au moins 10 caractères, une lettre et un chiffre. Évite les mots de passe trop courants.
          </p>
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
