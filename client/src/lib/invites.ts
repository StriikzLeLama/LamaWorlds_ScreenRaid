import { getServerUrl } from '../services/serverConfig';
import { isWebApp } from './platform';

export type InvitePayload =
  | { kind: 'token'; value: string }
  | { kind: 'code'; value: string };

/** Pull invite token/code out of a pasted URL or raw string. */
export function extractInvitePayload(input: string): InvitePayload {
  const trimmed = input.trim();
  if (!trimmed) return { kind: 'code', value: '' };

  try {
    const url = new URL(trimmed);
    const fromQuery =
      url.searchParams.get('invite') ||
      url.searchParams.get('token') ||
      url.searchParams.get('code');
    if (fromQuery?.trim()) {
      return classify(fromQuery.trim());
    }
    // /join/<token> style
    const parts = url.pathname.split('/').filter(Boolean);
    const joinIdx = parts.findIndex((p) => p.toLowerCase() === 'join');
    if (joinIdx >= 0 && parts[joinIdx + 1]) {
      return classify(decodeURIComponent(parts[joinIdx + 1]));
    }
  } catch {
    // not a URL — fall through
  }

  return classify(trimmed);
}

function classify(value: string): InvitePayload {
  // Guest invite tokens are long; classic room codes are short (e.g. ABC12345).
  if (value.length > 10) return { kind: 'token', value };
  return { kind: 'code', value };
}

/** Public share URL (web dashboard). Desktop can still open this or use in-app /join. */
export function inviteShareUrl(tokenOrCode: string): string {
  const payload = extractInvitePayload(tokenOrCode);
  const q =
    payload.kind === 'token'
      ? `invite=${encodeURIComponent(payload.value)}`
      : `code=${encodeURIComponent(payload.value)}`;

  if (isWebApp() && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/join?${q}`;
  }

  const base = getServerUrl().replace(/\/$/, '');
  return `${base}/join?${q}`;
}
