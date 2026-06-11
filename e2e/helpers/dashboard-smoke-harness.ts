import { ChildProcess, spawn } from 'child_process';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';

export interface RegisteredProject {
  projectId: string;
  projectName: string;
  projectPath: string;
  instances: Array<{ pid: number; registeredAt: string }>;
}

interface DashboardSmokeHarnessOptions {
  serverRoot: string;
  dashboardApiBaseUrl: string;
  specWorkflowHome: string;
  /** Directory name for the seeded project — becomes the dashboard projectName. */
  projectDirName: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const IS_WINDOWS = process.platform === 'win32';
const NPM_CMD = IS_WINDOWS ? 'npm.cmd' : 'npm';
const GIT_CMD = IS_WINDOWS ? 'git.exe' : 'git';

/** Spec fixture name the smoke specs assert against. */
export const SMOKE_SPEC_NAME = 'smoke-fixture-spec';

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

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ code: 0, stdout, stderr });
        return;
      }
      reject(new Error(`Command failed (${command} ${args.join(' ')}):\n${stderr || stdout}`));
    });
  });
}

async function killProcess(child: ChildProcess): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

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
    const child = spawn(NPM_CMD, ['run', 'dev', '--', this.projectPath], {
      cwd: this.options.serverRoot,
      env: {
        ...process.env,
        SPEC_WORKFLOW_HOME: this.options.specWorkflowHome,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const appendLog = (chunk: Buffer, source: 'stdout' | 'stderr') => {
      this.mcpLogs.push(`[${source}] ${chunk.toString().trimEnd()}`);
      if (this.mcpLogs.length > 200) {
        this.mcpLogs.shift();
      }
    };

    child.stdout.on('data', (chunk) => appendLog(chunk, 'stdout'));
    child.stderr.on('data', (chunk) => appendLog(chunk, 'stderr'));
    child.on('error', (error) => {
      this.mcpLogs.push(`[error] Failed to spawn MCP for ${this.projectPath}: ${error.message}`);
    });

    this.mcpProcesses.push(child);

    return await this.waitForProject(90000);
  }

  private async waitForProject(timeoutMs: number): Promise<RegisteredProject> {
    const startedAt = Date.now();
    const url = `${this.options.dashboardApiBaseUrl}/api/projects/list`;
    const expectedName = basename(this.projectPath);
    let lastBody = '';

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const body = (await response.json()) as RegisteredProject[];
          lastBody = JSON.stringify(body);
          // SFLW-50: projectPath is reported as the DocVault specflowRoot, not
          // the seeded path — match on projectName (basename-derived, stable).
          const project = body.find((entry) => entry.projectName === expectedName);
          if (project) {
            return project;
          }
        }
      } catch {
        // Dashboard may still be starting.
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(
      `Timed out waiting for smoke project "${expectedName}".\n` +
        `Last /api/projects/list payload: ${lastBody}\n` +
        `Recent MCP logs:\n${this.getCapturedLogs()}`,
    );
  }

  async cleanup(): Promise<void> {
    for (const child of this.mcpProcesses) {
      await killProcess(child);
    }
    this.mcpProcesses.length = 0;

    if (this.tempRoot) {
      await rm(this.tempRoot, { recursive: true, force: true });
      this.tempRoot = '';
    }
  }
}
