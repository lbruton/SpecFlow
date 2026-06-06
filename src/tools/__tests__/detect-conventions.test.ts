import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../core/convention-detector.js', () => ({
  ensureConventions: vi.fn(),
}));

vi.mock('../../core/path-utils.js', () => ({
  PathUtils: {
    translatePath: vi.fn((p: string) => p),
  },
}));

import { detectConventionsHandler } from '../detect-conventions.js';
import { ensureConventions } from '../../core/convention-detector.js';
import { PathUtils } from '../../core/path-utils.js';

const mockEnsure = vi.mocked(ensureConventions);
const mockTranslate = vi.mocked(PathUtils.translatePath);

const sampleConventions = {
  schemaVersion: 1 as const,
  detectedAt: '2026-06-05T00:00:00.000Z',
  testing: {
    framework: 'vitest',
    command: 'npx vitest',
    configFile: 'vitest.config.ts',
    testDir: 'src/__tests__',
    hasBrowserbase: false,
  },
  versioning: {
    hasVersionLock: false,
    lockFile: null,
    packageVersion: '1.0.0',
    userDeclinedSetup: false,
  },
  changelog: {
    hasChangelog: true,
    file: 'CHANGELOG.md',
    format: 'keepachangelog',
    docvaultFallback: false,
  },
};

describe('detectConventionsHandler', () => {
  const ctx = { projectPath: '/test/project', dashboardUrl: undefined };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTranslate.mockImplementation((p: string) => p);
  });

  it('returns an error when no project path is available', async () => {
    const res = await detectConventionsHandler({}, { projectPath: '' });

    expect(res.success).toBe(false);
    expect(res.message).toContain('Project path is required');
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it('defaults force to true and writes from the context project path', async () => {
    mockEnsure.mockResolvedValue({
      created: true,
      path: '/test/project/.specflow/project-conventions.json',
      conventions: sampleConventions,
    });

    const res = await detectConventionsHandler({}, ctx);

    expect(mockEnsure).toHaveBeenCalledWith('/test/project', { force: true });
    expect(res.success).toBe(true);
    expect(res.message).toContain('Wrote project-conventions.json');
    expect(res.data.created).toBe(true);
    expect(res.data.conventions.testing.framework).toBe('vitest');
  });

  it('passes force:false through and reports an unchanged file', async () => {
    mockEnsure.mockResolvedValue({
      created: false,
      path: '/test/project/.specflow/project-conventions.json',
      conventions: null,
    });

    const res = await detectConventionsHandler({ force: false }, ctx);

    expect(mockEnsure).toHaveBeenCalledWith('/test/project', { force: false });
    expect(res.success).toBe(true);
    expect(res.message).toContain('already exists');
  });

  it('prefers an explicit projectPath argument over context', async () => {
    mockEnsure.mockResolvedValue({
      created: true,
      path: '/other/proj/.specflow/project-conventions.json',
      conventions: sampleConventions,
    });

    await detectConventionsHandler({ projectPath: '/other/proj' }, ctx);

    expect(mockTranslate).toHaveBeenCalledWith('/other/proj');
    expect(mockEnsure).toHaveBeenCalledWith('/other/proj', { force: true });
  });

  it('returns a failure response when ensureConventions throws', async () => {
    mockEnsure.mockRejectedValue(new Error('disk full'));

    const res = await detectConventionsHandler({}, ctx);

    expect(res.success).toBe(false);
    expect(res.message).toContain('disk full');
  });
});
