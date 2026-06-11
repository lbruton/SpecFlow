import { ChildProcess } from 'child_process';
import { mkdtemp, mkdir, realpath, writeFile } from 'fs/promises';
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

interface WorktreeHarnessOptions {
  serverRoot: string;
  dashboardApiBaseUrl: string;
  specWorkflowHome: string;
}

function buildApprovalPayload(params: {
  id: string;
  title: string;
  filePath: string;
  categoryName: string;
}) {
  return {
    id: params.id,
    title: params.title,
    filePath: params.filePath,
    type: 'document',
    status: 'pending',
    createdAt: new Date().toISOString(),
    category: 'spec',
    categoryName: params.categoryName,
  };
}

export class WorktreeHarness {
  private readonly options: WorktreeHarnessOptions;
  private readonly mcpProcesses: ChildProcess[] = [];
  private readonly mcpLogs: string[] = [];
  private tempRoot = '';
  private repoRoot = '';
  private wtAPath = '';
  private wtBPath = '';

  constructor(options: WorktreeHarnessOptions) {
    this.options = options;
  }

  getWorktreePaths() {
    return {
      wtAPath: this.wtAPath,
      wtBPath: this.wtBPath,
    };
  }

  getCapturedLogs() {
    return this.mcpLogs.join('\n');
  }

  async setup(): Promise<void> {
    this.tempRoot = await mkdtemp(join(tmpdir(), 'specwf-e2e-worktree-'));
    this.repoRoot = join(this.tempRoot, 'repo-main');
    this.wtAPath = join(this.tempRoot, 'wt-a');
    this.wtBPath = join(this.tempRoot, 'wt-b');

    await mkdir(this.repoRoot, { recursive: true });
    await runCommand(GIT_CMD, ['init'], this.repoRoot);
    await runCommand(GIT_CMD, ['config', 'user.email', 'e2e@example.com'], this.repoRoot);
    await runCommand(GIT_CMD, ['config', 'user.name', 'E2E'], this.repoRoot);

    await writeFile(join(this.repoRoot, 'README.md'), '# e2e worktree repo\n', 'utf-8');
    await runCommand(GIT_CMD, ['add', 'README.md'], this.repoRoot);
    await runCommand(GIT_CMD, ['commit', '-m', 'Initial commit'], this.repoRoot);

    await runCommand(
      GIT_CMD,
      ['worktree', 'add', '-b', 'wt-a-branch', this.wtAPath],
      this.repoRoot,
    );
    await runCommand(
      GIT_CMD,
      ['worktree', 'add', '-b', 'wt-b-branch', this.wtBPath],
      this.repoRoot,
    );

    this.repoRoot = await realpath(this.repoRoot);
    this.wtAPath = await realpath(this.wtAPath);
    this.wtBPath = await realpath(this.wtBPath);

    // SFLW-50: the post-migration MCP auto-detects a sibling DocVault via
    // `resolve(projectPath, '..', 'DocVault')`. wt-a and wt-b are siblings, so
    // both resolve ../DocVault to this single directory. Without it the server
    // boots in degraded mode and registers no projects. Created under the
    // realpath'd tempRoot to match how the spawned MCP resolves worktree paths.
    this.tempRoot = await realpath(this.tempRoot);
    await mkdir(join(this.tempRoot, 'DocVault'), { recursive: true });

    await this.seedWorktreeA();
    await this.seedWorktreeB();
  }

  private async seedWorktreeA(): Promise<void> {
    await mkdir(join(this.wtAPath, 'src'), { recursive: true });
    await writeFile(
      join(this.wtAPath, 'src', 'service-a.ts'),
      'export const source = "wt-a";\n',
      'utf-8',
    );

    const specDir = join(this.wtAPath, '.specflow', 'specs', 'spec-a');
    const approvalsDir = join(this.wtAPath, '.specflow', 'approvals', 'spec-a');
    await mkdir(specDir, { recursive: true });
    await mkdir(approvalsDir, { recursive: true });
    await writeFile(join(specDir, 'requirements.md'), '# Requirements A\n', 'utf-8');

    const approval = buildApprovalPayload({
      id: 'approval-wt-a',
      title: 'Requirements: Spec A',
      filePath: 'src/service-a.ts',
      categoryName: 'spec-a',
    });
    await writeFile(
      join(approvalsDir, 'approval-wt-a.json'),
      JSON.stringify(approval, null, 2),
      'utf-8',
    );
  }

  private async seedWorktreeB(): Promise<void> {
    await mkdir(join(this.wtBPath, 'src'), { recursive: true });
    await writeFile(
      join(this.wtBPath, 'src', 'service-b.ts'),
      'export const source = "wt-b";\n',
      'utf-8',
    );

    const specDir = join(this.wtBPath, '.specflow', 'specs', 'spec-b');
    const approvalsDir = join(this.wtBPath, '.specflow', 'approvals', 'spec-b');
    await mkdir(specDir, { recursive: true });
    await mkdir(approvalsDir, { recursive: true });
    await writeFile(join(specDir, 'requirements.md'), '# Requirements B\n', 'utf-8');

    const approval = buildApprovalPayload({
      id: 'approval-wt-b',
      title: 'Requirements: Spec B',
      filePath: 'src/service-b.ts',
      categoryName: 'spec-b',
    });
    await writeFile(
      join(approvalsDir, 'approval-wt-b.json'),
      JSON.stringify(approval, null, 2),
      'utf-8',
    );
  }

  async startMcpServers(): Promise<void> {
    await this.startMcpForPath(this.wtAPath);
    await this.waitForProjects(1, 45000);
    await this.startMcpForPath(this.wtBPath);
  }

  private async startMcpForPath(projectPath: string): Promise<void> {
    const child = spawnMcpProcess({
      command: NPM_CMD,
      args: ['run', 'dev', '--', projectPath, '--no-shared-worktree-specs'],
      cwd: this.options.serverRoot,
      env: {
        ...process.env,
        SPEC_WORKFLOW_HOME: this.options.specWorkflowHome,
      },
      logs: this.mcpLogs,
      logLabel: projectPath,
    });

    this.mcpProcesses.push(child);
  }

  async waitForProjects(expectedCount = 2, timeoutMs = 60000): Promise<RegisteredProject[]> {
    // SFLW-50: post-migration the dashboard reports projectPath as the
    // DocVault specflowRoot (…/specflow/wt-a), not the worktree path, so
    // an exact projectPath === wtAPath match never succeeds. Match on
    // projectName instead — it is derived from the worktree basename
    // (deriveProjectName → basename(worktreePath)) and is layout-stable.
    const expectedNames = new Set([basename(this.wtAPath), basename(this.wtBPath)]);

    return await pollProjectsList(
      {
        url: `${this.options.dashboardApiBaseUrl}/api/projects/list`,
        timeoutMs,
        description: `${expectedCount} MCP projects`,
        getLogs: () => this.getCapturedLogs(),
      },
      (projects) => {
        const worktreeProjects = projects.filter((project) =>
          expectedNames.has(project.projectName),
        );
        return worktreeProjects.length === expectedCount ? worktreeProjects : undefined;
      },
    );
  }

  async cleanup(): Promise<void> {
    await cleanupProcessesAndTemp(this.mcpProcesses, this.tempRoot);
    this.tempRoot = '';
  }
}
