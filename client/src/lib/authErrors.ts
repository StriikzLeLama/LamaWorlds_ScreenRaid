import { ApiError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';
import { translate, type Locale } from '../i18n';
import { useLocaleStore } from '../stores/localeStore';

function currentLocale(): Locale {
  return useLocaleStore.getState().locale;
}

/** Shared auth error copy for login / register. */
export function authErrorMessage(err: unknown, fallback = 'Request failed'): string {
  const locale = currentLocale();
  if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') {
      return translate(locale, 'auth.invalidCredentials');
    }
    if (err.code === 'NO_SERVER_URL') {
      return translate(locale, 'auth.cannotReachServer', { url: getServerUrl() || '—' });
    }
    if (err.status === 429 || err.code === 'RATE_LIMITED') {
      return translate(locale, 'auth.rateLimited');
    }
    if (err.status === 403 || err.code === 'FORBIDDEN') {
      return translate(locale, 'auth.accountDisabled');
    }
    if (err.status === 409 || err.code === 'CONFLICT') {
      return err.message || translate(locale, 'auth.usernameTaken');
    }
    if (err.status === 400 || err.code === 'VALIDATION_ERROR') {
      return err.message || translate(locale, 'auth.invalidData');
    }
    return err.message || fallback;
  }
  if (
    err instanceof TypeError ||
    (err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message))
  ) {
    return translate(locale, 'auth.cannotReachServer', { url: getServerUrl() || '—' });
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

const LAST_USER_KEY = 'screenraid-last-username';

export function loadLastUsername(): string {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveLastUsername(username: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, username.trim());
  } catch {
    // ignore
  }
}

/** Generate a strong-enough temp password for admin resets. */
export function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  // Guarantee digit + letter for policy.
  return `${out}A1`;
}
