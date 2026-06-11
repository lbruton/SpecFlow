import { expect, test } from '@playwright/test';
import { mkdir, rm } from 'fs/promises';
import {
  DASHBOARD_API_BASE_URL,
  DashboardSmokeHarness,
  RegisteredProject,
  SMOKE_HEADING,
  SMOKE_LIST_ITEM,
  SMOKE_SPEC_NAME,
  collectConsoleErrors,
  selectProject,
} from './helpers/dashboard-smoke-harness';

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

    const consoleErrors: string[] = [];
    collectConsoleErrors(page, consoleErrors);

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
