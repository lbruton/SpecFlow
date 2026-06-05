import { execFileSync, ExecFileSyncOptionsWithStringEncoding } from 'child_process';
import { resolve } from 'path';
import type { GitState, GitCommitSummary } from '../types.js';

export const SPEC_WORKFLOW_SHARED_ROOT_ENV = 'SPEC_WORKFLOW_SHARED_ROOT';
const GIT_EXEC_OPTIONS: ExecFileSyncOptionsWithStringEncoding = {
  encoding: 'utf-8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 5000,
};

function isWindowsAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path);
}

function resolveGitCommandPath(projectPath: string): string | null {
  if (!projectPath || typeof projectPath !== 'string' || projectPath.includes('\0')) {
    return null;
  }

  return resolve(projectPath);
}

function gitExec(projectPath: string, args: string[]): string | null {
  const gitPath = resolveGitCommandPath(projectPath);
  if (!gitPath) {
    return null;
  }

  return execFileSync('git', ['-C', gitPath, ...args], GIT_EXEC_OPTIONS).trim();
}

function gitRevParse(projectPath: string, args: string[]): string | null {
  return gitExec(projectPath, ['rev-parse', ...args]);
}

/**
 * Resolves the git workspace root directory.
 * For repositories and worktrees, this returns the top-level checked-out directory.
 *
 * @param projectPath - Any path inside the workspace
 * @returns Workspace root path, or original path when git is unavailable
 */
export function resolveGitWorkspaceRoot(projectPath: string): string {
  try {
    const rawOutput = gitRevParse(projectPath, ['--show-toplevel']);
    if (!rawOutput) {
      return projectPath;
    }

    // Resolve to canonical absolute path and verify it's a real directory prefix
    const isWindowsAbsolute = isWindowsAbsolutePath(rawOutput);
    const workspaceRoot = isWindowsAbsolute ? rawOutput : resolve(rawOutput);
    if (!workspaceRoot.startsWith('/') && !isWindowsAbsolute) {
      return projectPath;
    }
    return workspaceRoot;
  } catch {
    return projectPath;
  }
}

/**
 * Resolves the git root directory for storing shared specs.
 * In worktrees, this returns the main repository path so all worktrees share specs.
 *
 * @param projectPath - The current project/worktree path
 * @returns The resolved path (main repo for worktrees, or original path)
 */
export function resolveGitRoot(projectPath: string): string {
  // Check for explicit override first
  const explicitRoot = process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV]?.trim();
  if (explicitRoot) {
    return explicitRoot;
  }

  try {
    // Get the git common directory (main repo's .git folder)
    const gitCommonDirRaw = gitRevParse(projectPath, ['--git-common-dir']);
    if (!gitCommonDirRaw) {
      return projectPath;
    }

    // In main repo, returns ".git" - no change needed
    if (gitCommonDirRaw === '.git') {
      return projectPath;
    }

    // In worktree or subdirectory, returns path like "/main/.git", "/main/.git/worktrees/name",
    // or relative path like "../../.git" when run from a subdirectory.
    // Extract the main repo path (parent of .git) and resolve to absolute path.
    const gitIndex = gitCommonDirRaw.lastIndexOf('.git');
    if (gitIndex > 0) {
      const mainRepoPath = gitCommonDirRaw.substring(0, gitIndex - 1);
      // Resolve to canonical absolute path — breaks taint chain from git output
      const isWindowsAbsolute = isWindowsAbsolutePath(mainRepoPath);
      const isUnixAbsolute = mainRepoPath.startsWith('/');
      // Windows absolute paths: return directly (resolve() mangles them on Unix)
      // Unix absolute paths: normalize via resolve()
      // Relative paths: resolve against projectPath
      let resolvedPath: string;
      if (isWindowsAbsolute) {
        resolvedPath = mainRepoPath;
      } else {
        resolvedPath = isUnixAbsolute ? resolve(mainRepoPath) : resolve(projectPath, mainRepoPath);
      }
      if (!resolvedPath.startsWith('/') && !isWindowsAbsolute) {
        return projectPath;
      }
      return resolvedPath;
    }

    return projectPath;
  } catch {
    // Not a git repo or git unavailable - use original path
    return projectPath;
  }
}

/**
 * Checks if the current directory is a git worktree (not the main repo).
 *
 * @param projectPath - The path to check
 * @returns true if in a worktree, false if main repo or not a git repo
 */
export function isGitWorktree(projectPath: string): boolean {
  try {
    const gitCommonDir = gitRevParse(projectPath, ['--git-common-dir']);
    if (!gitCommonDir) {
      return false;
    }
    return gitCommonDir !== '.git';
  } catch {
    return false;
  }
}

// Candidate base refs to measure feature-branch divergence against, in priority order.
// origin/HEAD tracks the remote default branch; the rest cover common local defaults
// across SpecFlow-consuming projects (some use `dev`, legacy repos use `master`).
const BASE_REF_CANDIDATES = ['origin/HEAD', 'main', 'master', 'dev'];
const MAX_DIVERGENCE_COMMITS = 10;

/**
 * Returns the current branch name, or "HEAD" when detached, or null when not a git repo.
 *
 * @param projectPath - Any path inside the workspace
 */
export function getCurrentBranch(projectPath: string): string | null {
  try {
    return gitExec(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']) || null;
  } catch {
    return null;
  }
}

/**
 * Resolves the first base-ref candidate that exists and differs from HEAD.
 * Returns null when no candidate resolves (e.g. on the default branch itself,
 * or a repo with no remote and no matching local branch).
 */
function resolveBaseRef(projectPath: string, headSha: string): string | null {
  for (const candidate of BASE_REF_CANDIDATES) {
    try {
      const sha = gitExec(projectPath, [
        'rev-parse',
        '--verify',
        '--quiet',
        `${candidate}^{commit}`,
      ]);
      if (sha && sha !== headSha) {
        return candidate;
      }
    } catch {
      // Candidate ref does not resolve — try the next one.
    }
  }
  return null;
}

function parseCommitLines(raw: string | null): GitCommitSummary[] {
  if (!raw) {
    return [];
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const tabIndex = line.indexOf('\t');
      return tabIndex === -1
        ? { sha: line, subject: '' }
        : { sha: line.slice(0, tabIndex), subject: line.slice(tabIndex + 1) };
    });
}

/**
 * Heuristically measures how far the current branch has advanced past its base branch.
 * Used to reconcile actual code state against workflow state on spec resume (SFLW-29).
 *
 * @param projectPath - The worktree/repo path to inspect
 * @returns Git state (branch, base ref, ahead count, recent commits), or null when
 *          the path is not a git repository / git is unavailable.
 */
export function getGitState(projectPath: string): GitState | null {
  try {
    const headSha = gitExec(projectPath, ['rev-parse', 'HEAD']);
    if (!headSha) {
      return null;
    }

    const branch = getCurrentBranch(projectPath) ?? 'HEAD';
    const baseRef = resolveBaseRef(projectPath, headSha);

    let aheadCount = 0;
    let commits: GitCommitSummary[] = [];

    if (baseRef) {
      const mergeBase = gitExec(projectPath, ['merge-base', baseRef, 'HEAD']);
      const range = `${mergeBase ?? baseRef}..HEAD`;
      const countRaw = gitExec(projectPath, ['rev-list', '--count', range]);
      aheadCount = countRaw ? parseInt(countRaw, 10) || 0 : 0;

      if (aheadCount > 0) {
        const logRaw = gitExec(projectPath, [
          'log',
          '-n',
          String(MAX_DIVERGENCE_COMMITS),
          '--format=%h%x09%s',
          range,
        ]);
        commits = parseCommitLines(logRaw);
      }
    }

    return { branch, baseRef, aheadCount, commits };
  } catch {
    return null;
  }
}
