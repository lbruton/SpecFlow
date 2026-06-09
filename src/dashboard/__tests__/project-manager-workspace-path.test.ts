import { describe, it, expect } from 'vitest';
import { selectWorkspacePath } from '../project-manager.js';
import type { ProjectRegistryEntry } from '../../core/project-registry.js';

/**
 * Regression coverage for SFLW-50: a worktree project's workspace path must
 * resolve to the worktree (entry.worktrees[0]), never the DocVault specflow
 * root (entry.projectPath). syncWithRegistry() previously used projectPath on
 * re-sync, clobbering workspacePath and breaking approval file resolution.
 */
function makeEntry(overrides: Partial<ProjectRegistryEntry>): ProjectRegistryEntry {
  return {
    projectId: 'id',
    projectPath: '/vault/DocVault/specflow/wt-a',
    workflowRootPath: '/vault/DocVault/specflow/wt-a',
    projectName: 'wt-a',
    instances: [],
    worktrees: [],
    ...overrides,
  };
}

describe('selectWorkspacePath', () => {
  it('prefers the first worktree over the workflow root', () => {
    const entry = makeEntry({ worktrees: ['/work/wt-a', '/work/wt-a-2'] });
    expect(selectWorkspacePath(entry)).toBe('/work/wt-a');
  });

  it('falls back to projectPath when no worktrees are tracked', () => {
    const entry = makeEntry({ worktrees: [] });
    expect(selectWorkspacePath(entry)).toBe('/vault/DocVault/specflow/wt-a');
  });

  it('falls back to projectPath when worktrees is undefined', () => {
    const entry = makeEntry({ worktrees: undefined as unknown as string[] });
    expect(selectWorkspacePath(entry)).toBe('/vault/DocVault/specflow/wt-a');
  });
});
