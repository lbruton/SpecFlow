import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'child_process';
import {
  resolveGitRoot,
  resolveGitWorkspaceRoot,
  isGitWorktree,
  SPEC_WORKFLOW_SHARED_ROOT_ENV,
} from '../git-utils.js';

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('resolveGitRoot', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV];
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('explicit env var override', () => {
    it('should use SPEC_WORKFLOW_SHARED_ROOT when set', () => {
      process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV] = '/custom/root';

      const result = resolveGitRoot('/some/project');

      expect(result).toBe('/custom/root');
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it('should trim whitespace from env var', () => {
      process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV] = '  /custom/root  ';

      const result = resolveGitRoot('/some/project');

      expect(result).toBe('/custom/root');
    });

    it('should ignore empty env var', () => {
      process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV] = '';
      mockedExecFileSync.mockReturnValue('.git');

      const result = resolveGitRoot('/some/project');

      expect(result).toBe('/some/project');
      expect(mockedExecFileSync).toHaveBeenCalled();
    });

    it('should ignore whitespace-only env var', () => {
      process.env[SPEC_WORKFLOW_SHARED_ROOT_ENV] = '   ';
      mockedExecFileSync.mockReturnValue('.git');

      const result = resolveGitRoot('/some/project');

      expect(result).toBe('/some/project');
      expect(mockedExecFileSync).toHaveBeenCalled();
    });
  });

  describe('main git repository', () => {
    it('should return original path when in main repo', () => {
      mockedExecFileSync.mockReturnValue('.git');

      const result = resolveGitRoot('/main/repo');

      expect(result).toBe('/main/repo');
    });

    it('should return original path when git returns ".git" with newline', () => {
      mockedExecFileSync.mockReturnValue('.git\n');

      const result = resolveGitRoot('/main/repo');

      expect(result).toBe('/main/repo');
    });
  });

  describe('git worktree', () => {
    it('should return main repo path when in worktree (Unix-style path)', () => {
      mockedExecFileSync.mockReturnValue('/home/user/main-repo/.git');

      const result = resolveGitRoot('/home/user/worktree');

      expect(result).toBe('/home/user/main-repo');
    });

    it('should return main repo path when git returns worktree subfolder', () => {
      mockedExecFileSync.mockReturnValue('/home/user/main-repo/.git/worktrees/feature-branch');

      const result = resolveGitRoot('/home/user/worktree');

      expect(result).toBe('/home/user/main-repo');
    });

    it('should handle Windows-style paths', () => {
      mockedExecFileSync.mockReturnValue('C:/Users/dev/main-repo/.git');

      const result = resolveGitRoot('C:/Users/dev/worktree');

      expect(result).toBe('C:/Users/dev/main-repo');
    });
  });

  describe('subdirectory with relative path', () => {
    it('should resolve relative path when git returns relative .git path', () => {
      // When running from a subdirectory, git returns relative paths like "../../.git"
      mockedExecFileSync.mockReturnValue('../../.git');

      const result = resolveGitRoot('/home/user/repo/src/core');

      // Should resolve to the main repo path, not return "../.." which would fail path traversal check
      expect(result).toBe('/home/user/repo');
    });

    it('should resolve deeply nested relative path', () => {
      mockedExecFileSync.mockReturnValue('../../../.git');

      const result = resolveGitRoot('/home/user/repo/src/lib/utils');

      expect(result).toBe('/home/user/repo');
    });

    it('should resolve single level relative path', () => {
      mockedExecFileSync.mockReturnValue('../.git');

      const result = resolveGitRoot('/home/user/repo/src');

      expect(result).toBe('/home/user/repo');
    });
  });

  describe('error handling', () => {
    it('should return original path when git command fails', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = resolveGitRoot('/not/a/git/repo');

      expect(result).toBe('/not/a/git/repo');
    });

    it('should return original path when git is not installed', () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error('git: command not found');
      });

      const result = resolveGitRoot('/some/path');

      expect(result).toBe('/some/path');
    });

    it('should return original path on timeout', () => {
      mockedExecFileSync.mockImplementation(() => {
        const error = new Error('timeout');
        (error as any).killed = true;
        throw error;
      });

      const result = resolveGitRoot('/some/path');

      expect(result).toBe('/some/path');
    });
  });

  describe('execFileSync configuration', () => {
    it('should call git with correct options', () => {
      mockedExecFileSync.mockReturnValue('.git');

      resolveGitRoot('/test/path');

      expect(mockedExecFileSync).toHaveBeenCalledWith(
        'git',
        ['-C', '/test/path', 'rev-parse', '--git-common-dir'],
        expect.objectContaining({
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        }),
      );
    });

    it('should return original path without running git when cwd contains a NUL byte', () => {
      const result = resolveGitRoot('/tmp/not-a-directory\0');

      expect(result).toBe('/tmp/not-a-directory\0');
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });
  });
});

describe('resolveGitWorkspaceRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return workspace root from git when available', () => {
    mockedExecFileSync.mockReturnValue('/home/user/repo\n');

    const result = resolveGitWorkspaceRoot('/home/user/repo/src/components');

    expect(result).toBe('/home/user/repo');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'git',
      ['-C', '/home/user/repo/src/components', 'rev-parse', '--show-toplevel'],
      expect.objectContaining({
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }),
    );
  });

  it('should return Windows-style workspace root from git when available', () => {
    mockedExecFileSync.mockReturnValue('C:/Users/dev/repo\n');

    const result = resolveGitWorkspaceRoot('C:/Users/dev/repo/src/components');

    expect(result).toBe('C:/Users/dev/repo');
  });

  it('should return original path when git fails', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    const result = resolveGitWorkspaceRoot('/not/a/repo');

    expect(result).toBe('/not/a/repo');
  });
});

describe('isGitWorktree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return false when in main repo', () => {
    mockedExecFileSync.mockReturnValue('.git');

    expect(isGitWorktree('/main/repo')).toBe(false);
  });

  it('should return true when in worktree', () => {
    mockedExecFileSync.mockReturnValue('/home/user/main-repo/.git');

    expect(isGitWorktree('/home/user/worktree')).toBe(true);
  });

  it('should return false when not a git repo', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not a git repository');
    });

    expect(isGitWorktree('/not/a/repo')).toBe(false);
  });

  it('should return false when git is not available', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('git: command not found');
    });

    expect(isGitWorktree('/some/path')).toBe(false);
  });
});
