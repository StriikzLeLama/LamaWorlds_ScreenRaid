import { ApiError } from '../services/api';
import { getServerUrl } from '../services/serverConfig';

/** Shared auth error copy for login / register. */
export function authErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.code === 'UNAUTHORIZED') {
      return 'Identifiants incorrects (username ou mot de passe).';
    }
    if (err.status === 429 || err.code === 'RATE_LIMITED') {
      return 'Trop de tentatives. Réessaie dans ~1 minute.';
    }
    if (err.status === 403 || err.code === 'FORBIDDEN') {
      return 'Compte désactivé. Demande à un admin de le réactiver.';
    }
    if (err.status === 409 || err.code === 'CONFLICT') {
      return err.message || 'Ce username ou email est déjà pris.';
    }
    if (err.status === 400 || err.code === 'VALIDATION_ERROR') {
      return err.message || 'Données invalides.';
    }
    return err.message || fallback;
  }
  if (
    err instanceof TypeError ||
    (err instanceof Error && /fetch|network|Failed to fetch/i.test(err.message))
  ) {
    return `Impossible de joindre le serveur (${getServerUrl()}). Vérifie l’URL / le tunnel.`;
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
