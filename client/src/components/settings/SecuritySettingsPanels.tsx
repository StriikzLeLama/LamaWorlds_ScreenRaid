import { useCallback, useEffect, useState } from 'react';
import { Card, Button, Input, Toggle } from '../ui';
import { ApiError } from '../../services/api';
import {
  disable2fa,
  enable2fa,
  getMySecurityPrefs,
  getSecurityPolicy,
  listMyAudit,
  listSessions,
  revokeSession,
  setup2fa,
  updateMySecurityPrefs,
} from '../../services/security';
import type { AuditEntry, SessionInfo, UserSecurityPrefs } from '../../types/security';

function errMsg(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Request failed';
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function auditLabel(entry: AuditEntry): string {
  const who = entry.actor_username ? `@${entry.actor_username}` : 'System';
  switch (entry.action) {
    case 'prank_sent':
      return `${who} sent a raid`;
    case 'prank_received':
      return `Raid received`;
    case 'login_success':
      return `Sign-in from ${who}`;
    case 'login_fail':
      return `Failed sign-in attempt`;
    case 'password_changed':
      return `Password changed`;
    case '2fa_enabled':
      return `2FA enabled`;
    case '2fa_disabled':
      return `2FA disabled`;
    case 'session_revoked':
      return `Session revoked`;
    default:
      return entry.action.replace(/_/g, ' ');
  }
}

interface Props {
  accessToken: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}

export function SecuritySettingsPanels({ accessToken, onMessage, onError }: Props) {
  const [policyLoaded, setPolicyLoaded] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [prefs, setPrefs] = useState<UserSecurityPrefs | null>(null);
  const [busy, setBusy] = useState(false);

  const [totpSecret, setTotpSecret] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const reloadSessions = useCallback(async () => {
    const res = await listSessions(accessToken);
    setSessions(res.sessions);
  }, [accessToken]);

  const reloadAudit = useCallback(async () => {
    const res = await listMyAudit(accessToken, 1, 15);
    setAudit(res.items);
  }, [accessToken]);

  const reloadPrefs = useCallback(async () => {
    const res = await getMySecurityPrefs(accessToken);
    setPrefs(res);
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const policy = await getSecurityPolicy();
        if (!cancelled) {
          setTurnstileEnabled(Boolean(policy.turnstile_site_key));
          setPolicyLoaded(true);
        }
        await Promise.all([reloadSessions(), reloadAudit(), reloadPrefs()]);
      } catch (e) {
        if (!cancelled) onError(errMsg(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, onError, reloadAudit, reloadPrefs, reloadSessions]);

  const handleRevokeSession = async (id: string) => {
    setBusy(true);
    onError('');
    try {
      await revokeSession(accessToken, id);
      onMessage('Session revoked.');
      await reloadSessions();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleSetup2fa = async () => {
    setBusy(true);
    onError('');
    setRecoveryCodes(null);
    try {
      const res = await setup2fa(accessToken);
      setTotpSecret(res.secret);
      setTotpUri(res.otpauth_uri);
      onMessage('Scan the QR in your authenticator app, then enter a code to enable 2FA.');
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEnable2fa = async () => {
    setBusy(true);
    onError('');
    try {
      const res = await enable2fa(accessToken, { code: totpCode.trim() });
      setRecoveryCodes(res.recovery_codes);
      setTotpSecret('');
      setTotpUri('');
      setTotpCode('');
      onMessage('2FA enabled. Save your recovery codes — they won’t be shown again.');
      await reloadAudit();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable2fa = async () => {
    setBusy(true);
    onError('');
    try {
      await disable2fa(accessToken, {
        password: disablePassword,
        code: disableCode.trim(),
      });
      setDisablePassword('');
      setDisableCode('');
      onMessage('2FA disabled.');
      await reloadAudit();
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const applyPreset = async (preset: 'friends' | 'strict' | 'custom') => {
    if (!prefs) return;
    setBusy(true);
    onError('');
    try {
      const next = await updateMySecurityPrefs(accessToken, { preset });
      setPrefs(next);
      onMessage(preset === 'friends' ? 'Preset Friends appliqué.' : 'Preset Strict appliqué.');
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = async () => {
    if (!prefs) return;
    setBusy(true);
    onError('');
    try {
      const next = await updateMySecurityPrefs(accessToken, {
        preset: 'custom',
        allow_sound: prefs.allow_sound,
        allow_video: prefs.allow_video,
        allow_fullscreen: prefs.allow_fullscreen,
        local_cooldown_ms: prefs.local_cooldown_ms,
      });
      setPrefs(next);
      onMessage('Préférences raids enregistrées.');
    } catch (e) {
      onError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <h2 className="mb-1 text-lg font-semibold text-raid-text">Sécurité</h2>
        <p className="mb-4 text-xs text-raid-text-secondary">
          Turnstile {turnstileEnabled ? 'actif' : 'désactivé (dev/LAN)'}. 2FA opt-in — recommandé si
          ton serveur est exposé sur Internet.
        </p>
        {policyLoaded && (
          <p className="mb-4 text-sm text-raid-text-secondary">
            Captcha Cloudflare :{' '}
            <span className={turnstileEnabled ? 'text-raid-success' : 'text-raid-text'}>
              {turnstileEnabled ? 'configured' : 'not configured'}
            </span>
          </p>
        )}

        <div className="space-y-3 border-t border-raid-border pt-4">
          <h3 className="text-sm font-semibold text-raid-text">Two-factor authentication</h3>
          {!totpSecret && !recoveryCodes && (
            <Button variant="secondary" disabled={busy} onClick={() => void handleSetup2fa()}>
              Start 2FA setup
            </Button>
          )}
          {totpSecret && (
            <div className="space-y-2 rounded-xl border border-raid-border bg-raid-surface/50 p-3 text-sm">
              <p className="text-raid-text-secondary">Secret: {totpSecret}</p>
              <p className="break-all text-xs text-raid-text-secondary">{totpUri}</p>
              <Input
                label="Authenticator code"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                placeholder="123456"
              />
              <Button disabled={busy} onClick={() => void handleEnable2fa()}>
                Enable 2FA
              </Button>
            </div>
          )}
          {recoveryCodes && (
            <div className="rounded-xl border border-raid-warning/40 bg-raid-warning/10 p-3">
              <p className="mb-2 text-sm font-medium text-raid-text">Recovery codes (save now)</p>
              <ul className="grid grid-cols-2 gap-1 font-mono text-xs text-raid-text">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="space-y-2 border-t border-raid-border pt-3">
            <p className="text-xs text-raid-text-secondary">Disable 2FA</p>
            <Input
              label="Password"
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
            />
            <Input
              label="TOTP or recovery code"
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
            />
            <Button variant="danger" disabled={busy} onClick={() => void handleDisable2fa()}>
              Disable 2FA
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-raid-text">Appareils connectés</h2>
        {sessions.length === 0 ? (
          <p className="text-sm text-raid-text-secondary">No active sessions.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-raid-border pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-raid-text">
                    {s.label ?? s.user_agent ?? 'Unknown device'}
                    {s.is_current && (
                      <span className="ml-2 text-xs text-raid-success">(this device)</span>
                    )}
                  </p>
                  <p className="text-xs text-raid-text-secondary">
                    {s.ip_address ?? '—'} · last seen {formatWhen(s.last_seen_at ?? s.created_at)}
                  </p>
                </div>
                {!s.is_current && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void handleRevokeSession(s.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-raid-text">Raids reçus</h2>
        <p className="mb-4 text-xs text-raid-text-secondary">
          Friends = peu de friction entre potes. Strict = cooldowns plus longs et volume plafonné.
        </p>
        {prefs && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={prefs.preset === 'friends' ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => void applyPreset('friends')}
              >
                Friends
              </Button>
              <Button
                variant={prefs.preset === 'strict' ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => void applyPreset('strict')}
              >
                Strict
              </Button>
              <span className="self-center text-xs text-raid-text-secondary">
                Preset: {prefs.preset}
              </span>
            </div>
            <Toggle
              checked={prefs.allow_sound}
              onChange={(v) => setPrefs({ ...prefs, allow_sound: v })}
              label="Accept sound raids"
            />
            <Toggle
              checked={prefs.allow_video}
              onChange={(v) => setPrefs({ ...prefs, allow_video: v })}
              label="Accept video raids"
            />
            <Toggle
              checked={prefs.allow_fullscreen}
              onChange={(v) => setPrefs({ ...prefs, allow_fullscreen: v })}
              label="Accept fullscreen raids"
            />
            <Input
              label="Local cooldown (ms)"
              type="number"
              min={0}
              max={30000}
              value={prefs.local_cooldown_ms}
              onChange={(e) =>
                setPrefs({ ...prefs, local_cooldown_ms: Number(e.target.value) })
              }
            />
            <Button disabled={busy} onClick={() => void savePrefs()}>
              Save raid preferences
            </Button>
          </div>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-4 text-lg font-semibold text-raid-text">Activité récente</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-raid-text-secondary">No recent events.</p>
        ) : (
          <ul className="space-y-2">
            {audit.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-raid-border pb-2 text-sm last:border-0"
              >
                <span className="text-raid-text">{auditLabel(entry)}</span>
                <span className="text-xs text-raid-text-secondary">{formatWhen(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
