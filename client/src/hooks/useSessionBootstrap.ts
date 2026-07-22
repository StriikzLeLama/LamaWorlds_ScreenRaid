import { useEffect, useRef } from 'react';
import { getMe, refreshToken } from '../services/auth';
import { useAuthStore } from '../stores/authStore';
import { log } from '../lib/log';

/**
 * Validates persisted tokens on startup. Avoids a false "connected" UI when
 * the refresh token is dead — users were stuck thinking they were online
 * while login was blocked by PublicRoute redirect.
 */
export function useSessionBootstrap() {
  const bootstrapped = useRef(false);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const { accessToken, refreshToken: storedRefresh, isAuthenticated, login, logout } =
      useAuthStore.getState();
    if (!isAuthenticated || !storedRefresh) return;

    void (async () => {
      try {
        if (accessToken) {
          await getMe(accessToken);
          return;
        }
      } catch {
        // try refresh below
      }
      try {
        const res = await refreshToken(storedRefresh);
        login(
          { access: res.access_token, refresh: res.refresh_token },
          res.user,
        );
      } catch (e) {
        log.warn('session bootstrap failed — logging out', e);
        logout();
      }
    })();
  }, []);
}
