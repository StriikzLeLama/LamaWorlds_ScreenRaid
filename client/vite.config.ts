import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isWebBuild = env.VITE_APP_MODE === 'web' || mode === 'web';

  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    server: {
      port: isWebBuild ? 5173 : 1420,
      strictPort: !isWebBuild,
      proxy: isWebBuild
        ? {
            '/v1': { target: 'http://127.0.0.1:8080', changeOrigin: true },
            '/health': { target: 'http://127.0.0.1:8080', changeOrigin: true },
          }
        : undefined,
    },
    envPrefix: ['VITE_', 'TAURI_'],
    build: {
      target: 'es2020',
      minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      rollupOptions: {
        input: isWebBuild
          ? { main: resolve(__dirname, 'index.html') }
          : {
              main: resolve(__dirname, 'index.html'),
              overlay: resolve(__dirname, 'overlay.html'),
            } as Record<string, string>,
      },
    },
  };
});
