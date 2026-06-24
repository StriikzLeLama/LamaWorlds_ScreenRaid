import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSummary } from '../types';

interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserSummary | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (tokens: { access: string; refresh: string }, user: UserSummary) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      login: (tokens, user) =>
        set({
          accessToken: tokens.access,
          refreshToken: tokens.refresh,
          user,
          isAuthenticated: true,
        }),
      setIsAdmin: (isAdmin) => set({ isAdmin }),
      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          isAdmin: false,
        }),
    }),
    { name: 'screenraid-auth' },
  ),
);
