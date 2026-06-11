import { defineConfig, devices } from '@playwright/test';

export interface DualServerConfigOptions {
  dashboardPort: number;
  frontendPort: number;
  specWorkflowHome: string;
  testMatch: string | string[];
}

/**
 * Shared dual-webServer Playwright config: a real MCP dashboard backend plus
 * the vite frontend on dedicated ports, with an isolated SPEC_WORKFLOW_HOME.
 * Used by playwright.worktree.config.ts and playwright.smoke.config.ts.
 */
export function createDualServerConfig(options: DualServerConfigOptions) {
  const { dashboardPort, frontendPort, specWorkflowHome, testMatch } = options;

  // Share the same global state path between test workers and spawned web servers.
  process.env.SPEC_WORKFLOW_HOME = specWorkflowHome;

  return defineConfig({
    testDir: './e2e',
    testMatch,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
      baseURL: `http://127.0.0.1:${frontendPort}`,
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
        command: `npm run dev -- --dashboard --no-open --port ${dashboardPort}`,
        url: `http://127.0.0.1:${dashboardPort}/api/test`,
        reuseExistingServer: false,
        timeout: 120000,
        env: {
          ...process.env,
          SPEC_WORKFLOW_HOME: specWorkflowHome,
        },
      },
      {
        command: `npm run dev:dashboard -- --host 127.0.0.1 --port ${frontendPort}`,
        url: `http://127.0.0.1:${frontendPort}`,
        reuseExistingServer: false,
        timeout: 120000,
        env: {
          ...process.env,
          SPEC_WORKFLOW_HOME: specWorkflowHome,
          VITE_DASHBOARD_PORT: String(dashboardPort),
        },
      },
    ],
  });
}
