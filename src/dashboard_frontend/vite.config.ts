import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import react from '@vitejs/plugin-react';

// Dashboard port - matches DEFAULT_DASHBOARD_PORT in security-utils.ts
// Can be overridden via VITE_DASHBOARD_PORT environment variable
const dashboardPort = process.env.VITE_DASHBOARD_PORT || '5000';

// Dashboard host the dev proxy targets. Defaults to 127.0.0.1 to match the
// backend's default IPv4 loopback bind (Node >=17 may resolve "localhost" to
// ::1 first, where the backend does not listen). Override via VITE_DASHBOARD_HOST
// for backends bound to ::1 or another address. (SFLW-51)
const dashboardHost = process.env.VITE_DASHBOARD_HOST || '127.0.0.1';

// Dynamically import Tailwind CSS v4 plugin
async function createConfig() {
  const { default: tailwindcss } = await import('@tailwindcss/vite');

  return {
    plugins: [react(), tailwindcss()],
    // Ensure Vite resolves index.html relative to this config file
    root: dirname(fileURLToPath(new URL(import.meta.url))),
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      proxy: {
        // Target dashboardHost (default 127.0.0.1) to match the backend's bind
        // exactly. (The /ws upgrade itself is unblocked by the CORS fix in
        // security-utils.ts — see SFLW-51.)
        '/api': {
          target: `http://${dashboardHost}:${dashboardPort}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://${dashboardHost}:${dashboardPort}`,
          ws: true,
        },
      },
    },
  };
}

export default defineConfig(createConfig());
