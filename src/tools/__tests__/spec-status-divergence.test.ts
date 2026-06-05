import { describe, it, expect, beforeEach, vi } from 'vitest';

// SFLW-29: spec-status reconciles workflow state against actual git state on resume.
// We mock the parser (controlled spec) and git-utils (controlled git state) so the test
// exercises only the divergence heuristic in the handler.
const mocks = vi.hoisted(() => ({
  getGitState: vi.fn(),
  spec: { value: null as any },
}));

vi.mock('../../core/git-utils.js', () => ({
  resolveGitWorkspaceRoot: (p: string) => p,
  getGitState: mocks.getGitState,
}));

vi.mock('../../core/parser.js', () => ({
  SpecParser: class {
    async getSpec() {
      return mocks.spec.value;
    }
  },
}));

import { specStatusHandler } from '../spec-status.js';
import { ToolContext } from '../../types.js';

const context: ToolContext = {
  projectPath: '/test/project',
  dashboardUrl: 'http://localhost:5000',
};

function phase(exists: boolean, approved: boolean) {
  return { exists, approved, lastModified: '2026-06-05T00:00:00Z' };
}

function makeSpec(overrides: Record<string, any> = {}) {
  return {
    name: 'test-spec',
    description: 'desc',
    createdAt: '2026-06-01T00:00:00Z',
    lastModified: '2026-06-05T00:00:00Z',
    phases: {
      discovery: phase(false, false),
      requirements: phase(true, true),
      design: phase(true, true),
      tasks: phase(true, true),
      readinessReport: phase(true, false), // gate pending by default
      implementation: phase(false, false),
    },
    taskProgress: { total: 15, completed: 0, pending: 15 },
    ...overrides,
  };
}

describe('spec-status workflow/code divergence (SFLW-29)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.spec.value = makeSpec();
  });

  it('flags divergence when commits exist but the readiness gate is unapproved', async () => {
    mocks.getGitState.mockReturnValue({
      branch: 'feature/x',
      baseRef: 'origin/HEAD',
      aheadCount: 3,
      commits: [{ sha: 'abc1234', subject: 'task 1' }],
    });

    const result = await specStatusHandler({ specName: 'test-spec' }, context);

    expect(result.success).toBe(true);
    expect(result.data.divergence.detected).toBe(true);
    expect(result.data.divergence.reasons[0]).toContain('readiness gate');
    expect(result.data.gitState.aheadCount).toBe(3);
    // The three reconciliation options are surfaced in nextSteps.
    const steps = (result.nextSteps ?? []).join('\n');
    expect(steps).toContain('WORKFLOW/CODE DIVERGENCE DETECTED');
    expect(steps).toContain('Catch up gates');
    expect(steps).toContain('Roll back');
    expect(steps).toContain('Continue as-is');
  });

  it('does not flag divergence on a clean branch even when the gate is pending', async () => {
    mocks.getGitState.mockReturnValue({
      branch: 'main',
      baseRef: null,
      aheadCount: 0,
      commits: [],
    });

    const result = await specStatusHandler({ specName: 'test-spec' }, context);

    expect(result.data.divergence.detected).toBe(false);
    expect((result.nextSteps ?? []).join('\n')).not.toContain('WORKFLOW/CODE DIVERGENCE');
  });

  it('does not flag divergence when the readiness gate is approved', async () => {
    mocks.spec.value = makeSpec({
      phases: {
        discovery: phase(false, false),
        requirements: phase(true, true),
        design: phase(true, true),
        tasks: phase(true, true),
        readinessReport: phase(true, true), // gate approved
        implementation: phase(true, false),
      },
      taskProgress: { total: 15, completed: 2, pending: 13 },
    });
    mocks.getGitState.mockReturnValue({
      branch: 'feature/x',
      baseRef: 'origin/HEAD',
      aheadCount: 5,
      commits: [],
    });

    const result = await specStatusHandler({ specName: 'test-spec' }, context);

    expect(result.data.divergence.detected).toBe(false);
  });

  it('omits gitState and divergence when the path is not a git repository', async () => {
    mocks.getGitState.mockReturnValue(null);

    const result = await specStatusHandler({ specName: 'test-spec' }, context);

    expect(result.data.gitState).toBeUndefined();
    expect(result.data.divergence).toBeUndefined();
  });
});
