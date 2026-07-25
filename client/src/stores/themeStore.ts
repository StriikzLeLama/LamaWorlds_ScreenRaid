import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export function normalizeTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark';
}

/** Apply theme to `<html data-theme="…">`. Call on boot and on change. */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => {
        const next = normalizeTheme(theme);
        applyTheme(next);
        set({ theme: next });
      },
    }),
    {
      name: 'screenraid-theme',
      merge: (persisted, current) => {
        const raw = persisted as Partial<ThemeStore> | undefined;
        const theme = normalizeTheme(raw?.theme ?? current.theme);
        applyTheme(theme);
        return { ...current, ...raw, theme };
      },
    },
  ),
);
