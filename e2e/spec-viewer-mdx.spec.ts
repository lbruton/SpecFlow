import { expect, Page, test } from '@playwright/test';
import { mkdir, rm } from 'fs/promises';
import {
  DashboardSmokeHarness,
  RegisteredProject,
  SMOKE_HEADING,
  SMOKE_LIST_ITEM,
  SMOKE_SPEC_NAME,
} from './helpers/dashboard-smoke-harness';

const DASHBOARD_API_BASE_URL = 'http://127.0.0.1:5085';

async function selectProject(page: Page, projectId: string): Promise<void> {
  const toggle = page.getByTestId('project-dropdown-toggle');
  await toggle.click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeVisible();

  await page.getByTestId(`project-dropdown-item-${projectId}`).click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeHidden();
}

test.describe.serial('Spec viewer MDX rendering (seeded backend)', () => {
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
      projectDirName: 'smoke-mdx',
    });

    await harness.setup();
    project = await harness.startMcpServer();
  });

  test.afterAll(async () => {
    if (harness) {
      await harness.cleanup();
    }
  });

  test('renders the seeded spec markdown and mermaid block via the MDX editor', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByTestId('project-dropdown-toggle')).toBeVisible();
    await selectProject(page, project.projectId);

    // SFLW-51 (pre-existing on React 18, dev mode only): the vite dev proxy
    // targets ws://localhost:<port> while the backend binds 127.0.0.1, so the
    // /ws upgrade fails with a handshake 500 on every retry. That one pattern
    // is filtered with justification; all other console errors fail the test.
    const PRE_EXISTING_WS_PROXY_ERROR = /WebSocket connection to 'ws:\/\/[^']*\/ws[^']*' failed/;
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !PRE_EXISTING_WS_PROXY_ERROR.test(message.text())) {
        consoleErrors.push(`[console.error] ${message.text()}`);
      }
    });
    page.on('pageerror', (error) => {
      consoleErrors.push(`[pageerror] ${error.message}`);
    });

    await page.goto(`/#/specs/view?name=${SMOKE_SPEC_NAME}`);

    // The read-only MDX editor must mount (MDXEditorWrapper view mode).
    const viewer = page.locator('.mdx-editor-wrapper.view-mode');
    await expect(viewer, 'MDX viewer should mount in view mode').toBeVisible({ timeout: 30000 });

    // Markdown body renders: heading + list content from the seeded fixture.
    await expect(viewer.getByText(SMOKE_HEADING)).toBeVisible({ timeout: 15000 });
    await expect(viewer.getByText(SMOKE_LIST_ITEM)).toBeVisible();

    // The fenced mermaid block renders to an inline SVG (mermaidPlugin
    // replaces the code block with mermaid.render output).
    await expect(
      viewer.locator('svg').first(),
      'fenced mermaid block should render as an SVG diagram',
    ).toBeVisible({ timeout: 30000 });

    expect(
      consoleErrors,
      `Console must stay clean in the spec viewer. Captured:\n${consoleErrors.join('\n')}`,
    ).toHaveLength(0);
  });
});
