import { ChildProcess, spawn } from 'child_process';
import { rm } from 'fs/promises';

/**
 * Shared process/polling plumbing for the E2E harnesses
 * (worktree-harness.ts and dashboard-smoke-harness.ts).
 */

export interface RegisteredProject {
  projectId: string;
  projectName: string;
  projectPath: string;
  instances: Array<{ pid: number; registeredAt: string }>;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

const IS_WINDOWS = process.platform === 'win32';
export const NPM_CMD = IS_WINDOWS ? 'npm.cmd' : 'npm';
export const GIT_CMD = IS_WINDOWS ? 'git.exe' : 'git';

export async function runCommand(
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

export async function killProcess(child: ChildProcess): Promise<void> {
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
 * Spawns an MCP server process with captured, ring-buffered stdout/stderr.
 *
 * stdin MUST stay 'pipe' (open): the stdio MCP server exits on stdin EOF,
 * so 'ignore' (/dev/null) would kill it immediately after boot.
 */
export function spawnMcpProcess(params: {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  logs: string[];
  logLabel: string;
}): ChildProcess {
  const { command, args, cwd, env, logs, logLabel } = params;
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const appendLog = (chunk: Buffer, source: 'stdout' | 'stderr') => {
    logs.push(`[${source}] ${chunk.toString().trimEnd()}`);
    if (logs.length > 200) {
      logs.shift();
    }
  };

  child.stdout?.on('data', (chunk) => appendLog(chunk, 'stdout'));
  child.stderr?.on('data', (chunk) => appendLog(chunk, 'stderr'));
  child.on('error', (error) => {
    logs.push(`[error] Failed to spawn MCP for ${logLabel}: ${error.message}`);
  });

  return child;
}

/**
 * Polls the dashboard's /api/projects/list until `matcher` returns a value,
 * recording the last response (including non-ok statuses and fetch failures)
 * for a debuggable timeout error.
 */
export async function pollProjectsList<T>(
  options: {
    url: string;
    timeoutMs: number;
    description: string;
    getLogs?: () => string;
  },
  matcher: (projects: RegisteredProject[]) => T | undefined,
): Promise<T> {
  const { url, timeoutMs, description, getLogs } = options;
  const startedAt = Date.now();
  let lastBody = '';

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = (await response.json()) as RegisteredProject[];
        lastBody = JSON.stringify(body);
        const matched = matcher(body);
        if (matched !== undefined) {
          return matched;
        }
      } else {
        lastBody = `HTTP ${response.status}: ${await response.text().catch(() => '<unreadable>')}`;
      }
    } catch (error) {
      // Dashboard may still be starting — record the failure for the timeout report.
      lastBody = `fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Timed out waiting for ${description}.\n` +
      `Last /api/projects/list payload: ${lastBody}\n` +
      `Recent MCP logs:\n${getLogs?.() ?? '<none>'}`,
  );
}

/** Kills all tracked processes and removes the harness temp directory. */
export async function cleanupProcessesAndTemp(
  processes: ChildProcess[],
  tempRoot: string,
): Promise<void> {
  for (const child of processes) {
    await killProcess(child);
  }
  processes.length = 0;

  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
