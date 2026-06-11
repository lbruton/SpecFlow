import { expect, test } from '@playwright/test';
import { mkdir, rm } from 'fs/promises';
import {
  DASHBOARD_API_BASE_URL,
  DashboardSmokeHarness,
  RegisteredProject,
  SMOKE_SPEC_NAME,
  collectConsoleErrors,
  selectProject,
} from './helpers/dashboard-smoke-harness';

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
