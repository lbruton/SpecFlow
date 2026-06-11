import { expect, Page, test } from '@playwright/test';
import { mkdir, rm } from 'fs/promises';
import {
  DashboardSmokeHarness,
  RegisteredProject,
  SMOKE_SPEC_NAME,
} from './helpers/dashboard-smoke-harness';

const DASHBOARD_API_BASE_URL = 'http://127.0.0.1:5085';

// The app uses HashRouter — client routes live in the URL hash.
const ROUTES: Array<{ path: string; hash: string }> = [
  { path: '/', hash: '#/' },
  { path: '/steering', hash: '#/steering' },
  { path: '/specs', hash: '#/specs' },
  { path: '/specs/view', hash: `#/specs/view?name=${SMOKE_SPEC_NAME}` },
  { path: '/tasks', hash: '#/tasks' },
  { path: '/logs', hash: '#/logs' },
  { path: '/approvals', hash: '#/approvals' },
  { path: '/settings', hash: '#/settings' },
];

async function selectProject(page: Page, projectId: string): Promise<void> {
  const toggle = page.getByTestId('project-dropdown-toggle');
  await toggle.click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeVisible();

  await page.getByTestId(`project-dropdown-item-${projectId}`).click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeHidden();
}

// SFLW-51 (pre-existing on React 18, dev mode only): the vite dev proxy
// targets ws://localhost:<port> while the backend binds 127.0.0.1, so every
// /ws upgrade fails with a handshake 500 and the provider retries forever.
// This exact pattern is filtered with justification; ALL other console errors
// (render errors, React warnings-as-errors, route failures) still fail the test.
const PRE_EXISTING_WS_PROXY_ERROR = /WebSocket connection to 'ws:\/\/[^']*\/ws[^']*' failed/;

function collectConsoleErrors(page: Page, sink: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error' && !PRE_EXISTING_WS_PROXY_ERROR.test(message.text())) {
      sink.push(`[console.error] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    sink.push(`[pageerror] ${error.message}`);
  });
}

test.describe.serial('Dashboard route sweep (seeded backend)', () => {
  test.skip(
    process.env.SPECFLOW_SMOKE_CONFIG !== '1',
    'Requires the seeded backend from playwright.smoke.config.ts (npm run test:e2e:smoke)',
  );

  test.setTimeout(180000);

  let harness: DashboardSmokeHarness;
  let project: RegisteredProject;

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180000);

    const specWorkflowHome = process.env.SPEC_WORKFLOW_HOME;
    if (!specWorkflowHome) {
      throw new Error('SPEC_WORKFLOW_HOME must be set by playwright.smoke.config.ts');
    }

    await rm(specWorkflowHome, { recursive: true, force: true });
    await mkdir(specWorkflowHome, { recursive: true });

    harness = new DashboardSmokeHarness({
      serverRoot: process.cwd(),
      dashboardApiBaseUrl: DASHBOARD_API_BASE_URL,
      specWorkflowHome,
      projectDirName: 'smoke-routes',
    });

    await harness.setup();
    project = await harness.startMcpServer();
  });

  test.afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  test('all 8 routes render seeded content with no console errors', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('project-dropdown-toggle')).toBeVisible();
    await selectProject(page, project.projectId);

    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);

    for (const route of ROUTES) {
      await page.goto(`/${route.hash}`);

      const main = page.locator('main');
      await expect(main, `route ${route.path} should render a main region`).toBeVisible();

      // A blank frame or an unregistered-project fallback is a failure, never a pass.
      await expect(
        main.getByText('No Projects Available'),
        `route ${route.path} must not fall back to "No Projects Available"`,
      ).toHaveCount(0);

      await expect(async () => {
        const text = (await main.innerText()).trim();
        expect(text.length, `route ${route.path} rendered a blank frame`).toBeGreaterThan(0);
      }, `route ${route.path} should render visible content`).toPass({ timeout: 15000 });
    }

    // The seeded spec must actually appear on /specs — proves the sweep ran
    // against real data rather than empty pages.
    await page.goto('/#/specs');
    await expect(page.getByTestId(`spec-table-row-${SMOKE_SPEC_NAME}`)).toBeVisible({
      timeout: 15000,
    });

    expect(
      consoleErrors,
      `Console must stay clean across all routes. Captured:\n${consoleErrors.join('\n')}`,
    ).toHaveLength(0);
  });
});
