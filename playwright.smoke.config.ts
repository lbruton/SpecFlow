import { defineConfig, devices } from '@playwright/test';
import { join } from 'path';
import { tmpdir } from 'os';

const DASHBOARD_PORT = 5085;
const FRONTEND_PORT = 5185;
const SPEC_WORKFLOW_HOME =
  process.env.SPEC_WORKFLOW_HOME || join(tmpdir(), 'specwf-e2e-smoke-state');

// Share the same global state path between test workers and spawned web servers.
process.env.SPEC_WORKFLOW_HOME = SPEC_WORKFLOW_HOME;

// Guard flag: the smoke specs skip themselves unless launched through this
// config (they need the seeded backend below — under the default config they
// would fail vacuously with no projects registered).
process.env.SPECFLOW_SMOKE_CONFIG = '1';

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/dashboard-route-sweep.spec.ts', '**/spec-viewer-mdx.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --dashboard --no-open --port ${DASHBOARD_PORT}`,
      url: `http://127.0.0.1:${DASHBOARD_PORT}/api/test`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        SPEC_WORKFLOW_HOME,
      },
    },
    {
      command: `npm run dev:dashboard -- --host 127.0.0.1 --port ${FRONTEND_PORT}`,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        ...process.env,
        SPEC_WORKFLOW_HOME,
        VITE_DASHBOARD_PORT: String(DASHBOARD_PORT),
      },
    },
  ],
});
