import { expect, Page } from '@playwright/test';
import { ChildProcess } from 'child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  GIT_CMD,
  NPM_CMD,
  RegisteredProject,
  cleanupProcessesAndTemp,
  pollProjectsList,
  runCommand,
  spawnMcpProcess,
} from './process-utils';

export type { RegisteredProject } from './process-utils';

interface DashboardSmokeHarnessOptions {
  serverRoot: string;
  dashboardApiBaseUrl: string;
  specWorkflowHome: string;
  /** Directory name for the seeded project — becomes the dashboard projectName. */
  projectDirName: string;
}

/** Spec fixture name the smoke specs assert against. */
export const SMOKE_SPEC_NAME = 'smoke-fixture-spec';

/** Dashboard backend base URL — must match DASHBOARD_PORT in playwright.smoke.config.ts. */
export const DASHBOARD_API_BASE_URL = 'http://127.0.0.1:5085';

// SFLW-51 (pre-existing on React 18, dev mode only): the vite dev proxy
// targets ws://localhost:<port> while the backend binds 127.0.0.1, so every
// /ws upgrade fails with a handshake 500 and the provider retries forever.
// This exact pattern is filtered with justification; ALL other console errors
// (render errors, React warnings-as-errors, route failures) still fail tests.
export const PRE_EXISTING_WS_PROXY_ERROR = /WebSocket connection to 'ws:\/\/[^']*\/ws[^']*' failed/;

/** Attaches console.error + pageerror collectors, filtering only the SFLW-51 pattern. */
export function collectConsoleErrors(page: Page, sink: string[]): void {
  page.on('console', (message) => {
    if (message.type() === 'error' && !PRE_EXISTING_WS_PROXY_ERROR.test(message.text())) {
      sink.push(`[console.error] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    sink.push(`[pageerror] ${error.message}`);
  });
}

/** Selects a project in the dashboard header dropdown (shared by the smoke specs). */
export async function selectProject(page: Page, projectId: string): Promise<void> {
  const toggle = page.getByTestId('project-dropdown-toggle');
  await toggle.click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeVisible();

  await page.getByTestId(`project-dropdown-item-${projectId}`).click();
  await expect(page.getByTestId('project-dropdown-menu')).toBeHidden();
}

/**
 * Standard smoke-spec opening: load the dashboard, select the seeded project,
 * and start collecting console errors (SFLW-51 pattern filtered).
 * Returns the console-error sink for the spec's final assertion.
 */
export async function openSeededDashboard(page: Page, projectId: string): Promise<string[]> {
  await page.goto('/');
  await expect(page.getByTestId('project-dropdown-toggle')).toBeVisible();
  await selectProject(page, projectId);

  const consoleErrors: string[] = [];
  collectConsoleErrors(page, consoleErrors);
  return consoleErrors;
}

/** Unique strings the smoke specs look for in rendered output. */
export const SMOKE_HEADING = 'Smoke Fixture Requirements';
export const SMOKE_LIST_ITEM = 'SmokeListItemAlpha';
export const SMOKE_TABLE_CELL = 'SmokeCellAlpha';

const FIXTURE_REQUIREMENTS = `# ${SMOKE_HEADING}

## Introduction

Seeded fixture document for the SFLW-47 dashboard smoke suite.

## Checklist

- ${SMOKE_LIST_ITEM}
- SmokeListItemBeta

## Matrix

| Column A | Column B |
|----------|----------|
| ${SMOKE_TABLE_CELL} | SmokeCellBeta |

## Flow

\`\`\`mermaid
graph TD
    A[Seeded Start] --> B[Seeded End]
\`\`\`
`;

const FIXTURE_DESIGN = `# Smoke Fixture Design

## Overview

Design fixture body for the route sweep.
`;

const FIXTURE_TASKS = `# Smoke Fixture Tasks

- [ ] 1. Seeded fixture task
  - File: src/service.ts
  - _Requirements: REQ-1_
`;

/**
 * Single-project simplification of WorktreeHarness (e2e/helpers/worktree-harness.ts).
 *
 * Seeds ONE git project containing one spec fixture (markdown headings, a list,
 * a table, and a fenced mermaid block) plus one pending approval, then boots one
 * MCP instance for it. The dashboard under test therefore always has real data —
 * a "No Projects Available" render is a harness failure, never a vacuous pass.
 */
export class DashboardSmokeHarness {
  private readonly options: DashboardSmokeHarnessOptions;
  private readonly mcpProcesses: ChildProcess[] = [];
  private readonly mcpLogs: string[] = [];
  private tempRoot = '';
  private projectPath = '';

  constructor(options: DashboardSmokeHarnessOptions) {
    this.options = options;
  }

  getProjectPath(): string {
    return this.projectPath;
  }

  getCapturedLogs(): string {
    return this.mcpLogs.join('\n');
  }

  async setup(): Promise<void> {
    this.tempRoot = await mkdtemp(join(tmpdir(), 'specwf-e2e-smoke-'));
    this.projectPath = join(this.tempRoot, this.options.projectDirName);

    await mkdir(this.projectPath, { recursive: true });
    await runCommand(GIT_CMD, ['init'], this.projectPath);
    await runCommand(GIT_CMD, ['config', 'user.email', 'e2e@example.com'], this.projectPath);
    await runCommand(GIT_CMD, ['config', 'user.name', 'E2E'], this.projectPath);

    await writeFile(join(this.projectPath, 'README.md'), '# e2e smoke repo\n', 'utf-8');
    await runCommand(GIT_CMD, ['add', 'README.md'], this.projectPath);
    await runCommand(GIT_CMD, ['commit', '-m', 'Initial commit'], this.projectPath);

    this.tempRoot = await realpath(this.tempRoot);
    this.projectPath = await realpath(this.projectPath);

    // SFLW-50: the MCP auto-detects a sibling DocVault via
    // `resolve(projectPath, '..', 'DocVault')`. Without it the server boots in
    // degraded mode and registers no projects.
    await mkdir(join(this.tempRoot, 'DocVault'), { recursive: true });

    await this.seedProject();
  }

  private async seedProject(): Promise<void> {
    await mkdir(join(this.projectPath, 'src'), { recursive: true });
    await writeFile(
      join(this.projectPath, 'src', 'service.ts'),
      'export const source = "smoke";\n',
      'utf-8',
    );

    const specDir = join(this.projectPath, '.specflow', 'specs', SMOKE_SPEC_NAME);
    const approvalsDir = join(this.projectPath, '.specflow', 'approvals', SMOKE_SPEC_NAME);
    await mkdir(specDir, { recursive: true });
    await mkdir(approvalsDir, { recursive: true });

    await writeFile(join(specDir, 'requirements.md'), FIXTURE_REQUIREMENTS, 'utf-8');
    await writeFile(join(specDir, 'design.md'), FIXTURE_DESIGN, 'utf-8');
    await writeFile(join(specDir, 'tasks.md'), FIXTURE_TASKS, 'utf-8');

    const approval = {
      id: 'approval-smoke',
      title: 'Requirements: Smoke Fixture',
      filePath: 'src/service.ts',
      type: 'document',
      status: 'pending',
      createdAt: new Date().toISOString(),
      category: 'spec',
      categoryName: SMOKE_SPEC_NAME,
    };
    await writeFile(
      join(approvalsDir, 'approval-smoke.json'),
      JSON.stringify(approval, null, 2),
      'utf-8',
    );
  }

  async startMcpServer(): Promise<RegisteredProject> {
    const child = spawnMcpProcess({
      command: NPM_CMD,
      args: ['run', 'dev', '--', this.projectPath],
      cwd: this.options.serverRoot,
      env: {
        ...process.env,
        SPEC_WORKFLOW_HOME: this.options.specWorkflowHome,
      },
      logs: this.mcpLogs,
      logLabel: this.projectPath,
    });

    this.mcpProcesses.push(child);

    const expectedName = basename(this.projectPath);
    // SFLW-50: projectPath is reported as the DocVault specflowRoot, not the
    // seeded path — match on projectName (basename-derived, stable).
    return await pollProjectsList(
      {
        url: `${this.options.dashboardApiBaseUrl}/api/projects/list`,
        timeoutMs: 90000,
        description: `smoke project "${expectedName}"`,
        getLogs: () => this.getCapturedLogs(),
      },
      (projects) => projects.find((entry) => entry.projectName === expectedName),
    );
  }

  async cleanup(): Promise<void> {
    await cleanupProcessesAndTemp(this.mcpProcesses, this.tempRoot);
    this.tempRoot = '';
  }
}

/**
 * Boots a fresh seeded smoke environment for a spec file: clears the isolated
 * SPEC_WORKFLOW_HOME, seeds one project, and waits for dashboard registration.
 * Shared by dashboard-route-sweep.spec.ts and spec-viewer-mdx.spec.ts.
 */
export async function bootSmokeHarness(
  projectDirName: string,
): Promise<{ harness: DashboardSmokeHarness; project: RegisteredProject }> {
  const specWorkflowHome = process.env.SPEC_WORKFLOW_HOME;
  if (!specWorkflowHome) {
    throw new Error('SPEC_WORKFLOW_HOME must be set by playwright.smoke.config.ts');
  }

  await rm(specWorkflowHome, { recursive: true, force: true });
  await mkdir(specWorkflowHome, { recursive: true });

  const harness = new DashboardSmokeHarness({
    serverRoot: process.cwd(),
    dashboardApiBaseUrl: DASHBOARD_API_BASE_URL,
    specWorkflowHome,
    projectDirName,
  });

  await harness.setup();
  const project = await harness.startMcpServer();
  return { harness, project };
}
