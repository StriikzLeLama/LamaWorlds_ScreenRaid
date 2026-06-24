import { useEffect } from 'react';
import { getMe } from '../services/auth';
import { useAuthStore } from '../stores/authStore';

export function useAdminBootstrap() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setIsAdmin = useAuthStore((s) => s.setIsAdmin);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setIsAdmin(false);
      return;
    }

    getMe(accessToken)
      .then((profile) => setIsAdmin(Boolean(profile.is_admin)))
      .catch(() => setIsAdmin(false));
  }, [isAuthenticated, accessToken, setIsAdmin]);
}
