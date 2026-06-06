import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Stats } from 'fs';

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

import { readFile, readdir, stat, mkdir, writeFile } from 'fs/promises';
import {
  detectConventions,
  writeConventions,
  ensureConventions,
  getConventionsPath,
  seedProjectConventions,
  type ProjectConventions,
} from '../convention-detector.js';

const mockStat = vi.mocked(stat);
const mockReadFile = vi.mocked(readFile);
const mockReaddir = vi.mocked(readdir);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);

/** Helper: create a fake Stats object for a file. */
function fakeFileStat(): Stats {
  return { isFile: () => true, isDirectory: () => false } as unknown as Stats;
}

/** Helper: create a fake Stats object for a directory. */
function fakeDirStat(): Stats {
  return { isFile: () => false, isDirectory: () => true } as unknown as Stats;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: everything throws ENOENT (file not found)
  const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  mockStat.mockRejectedValue(enoent);
  mockReadFile.mockRejectedValue(enoent);
  mockReaddir.mockRejectedValue(enoent);
});

describe('detectConventions', () => {
  it('should detect a vitest project', async () => {
    // vitest.config.ts exists
    mockStat.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('vitest.config.ts')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    // package.json with vitest test script
    mockReadFile.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('package.json')) {
        return JSON.stringify({ scripts: { test: 'vitest' } });
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await detectConventions('/fake/vitest-project');

    expect(result.testing.framework).toBe('vitest');
    expect(result.testing.command).toBe('npx vitest');
    expect(result.testing.configFile).toBe('vitest.config.ts');
    expect(result.schemaVersion).toBe(1);
  });

  it('should detect a jest project', async () => {
    mockStat.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('jest.config.js')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReadFile.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('package.json')) {
        return JSON.stringify({ scripts: { test: 'jest' } });
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await detectConventions('/fake/jest-project');

    expect(result.testing.framework).toBe('jest');
    expect(result.testing.command).toBe('npx jest');
    expect(result.testing.configFile).toBe('jest.config.js');
  });

  it('should detect browserbase when tests/runbook/ directory exists', async () => {
    mockStat.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('tests/runbook')) return fakeDirStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    mockReaddir.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('tests/runbook')) {
        return ['01-page-load.md', '02-crud.md', '03-backup.md'] as unknown as ReturnType<
          typeof readdir
        >;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await detectConventions('/fake/bb-project');

    expect(result.testing.hasBrowserbase).toBe(true);
    // When no other framework is detected, bb-test becomes the framework
    expect(result.testing.framework).toBe('bb-test');
  });

  it('should return all null values for an empty project', async () => {
    // All mocks already reject with ENOENT by default
    const result = await detectConventions('/fake/empty-project');

    expect(result.testing.framework).toBeNull();
    expect(result.testing.command).toBeNull();
    expect(result.testing.configFile).toBeNull();
    expect(result.testing.testDir).toBeNull();
    expect(result.testing.hasBrowserbase).toBe(false);
    expect(result.versioning.hasVersionLock).toBe(false);
    expect(result.versioning.lockFile).toBeNull();
    expect(result.versioning.packageVersion).toBeNull();
    expect(result.changelog.hasChangelog).toBe(false);
    expect(result.changelog.file).toBeNull();
    expect(result.changelog.format).toBeNull();
  });

  it('should detect version lock file', async () => {
    mockStat.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('devops/version.lock')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await detectConventions('/fake/versioned-project');

    expect(result.versioning.hasVersionLock).toBe(true);
    expect(result.versioning.lockFile).toBe('devops/version.lock');
  });

  it('should detect keepachangelog format', async () => {
    const changelogContent = `# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- New feature A
- New feature B

### Fixed
- Bug fix C

## [1.2.0] - 2026-03-15

### Added
- Feature D
`;

    mockReadFile.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('CHANGELOG.md')) return changelogContent;
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    // CHANGELOG.md must also pass the stat check (safeReadFile uses readFile directly, not stat)
    // But detectChangelog uses safeReadFile which calls readFile directly, so no stat needed.

    const result = await detectConventions('/fake/changelog-project');

    expect(result.changelog.hasChangelog).toBe(true);
    expect(result.changelog.file).toBe('CHANGELOG.md');
    expect(result.changelog.format).toBe('keepachangelog');
  });

  it('should detect test command from package.json scripts fallback', async () => {
    // No config files exist (default ENOENT), but package.json has a test script
    mockReadFile.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('package.json')) {
        return JSON.stringify({ scripts: { test: 'npm run test:unit' } });
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await detectConventions('/fake/script-project');

    // "npm run test:unit" doesn't contain vitest/jest/mocha/pytest, so framework stays null
    // But the command should be derived from the test script
    expect(result.testing.command).toBe('npm run test:unit');
  });
});

describe('writeConventions', () => {
  it('should create directory and write JSON file', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const conventions: ProjectConventions = {
      schemaVersion: 1,
      detectedAt: '2026-04-03T00:00:00.000Z',
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
        hasChangelog: false,
        file: null,
        format: null,
        docvaultFallback: false,
      },
    };

    await writeConventions('/fake/project', conventions);

    expect(mockMkdir).toHaveBeenCalledWith('/fake/project/.specflow', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/fake/project/.specflow/project-conventions.json',
      expect.stringContaining('"schemaVersion": 1'),
      'utf-8',
    );
  });
});

describe('getConventionsPath', () => {
  it('should resolve to local .specflow when DocVault is not configured', () => {
    // In the test environment PathUtils has no DocVault config, so the path
    // falls back to the local .specflow/ directory (same target writeConventions uses).
    expect(getConventionsPath('/fake/project')).toBe(
      '/fake/project/.specflow/project-conventions.json',
    );
  });
});

describe('ensureConventions', () => {
  it('should detect and write when the file is missing', async () => {
    // Default mocks: every stat/readFile rejects with ENOENT, so the conventions
    // file is absent and detection yields an all-null (empty project) result.
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await ensureConventions('/fake/project');

    expect(result.created).toBe(true);
    expect(result.path).toBe('/fake/project/.specflow/project-conventions.json');
    expect(result.conventions?.schemaVersion).toBe(1);
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/fake/project/.specflow/project-conventions.json',
      expect.stringContaining('"schemaVersion": 1'),
      'utf-8',
    );
  });

  it('should be a no-op when the file already exists and force is not set', async () => {
    // The conventions file exists — stat resolves as a file for that path.
    mockStat.mockImplementation(async (p) => {
      if (String(p).endsWith('project-conventions.json')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const result = await ensureConventions('/fake/project');

    expect(result.created).toBe(false);
    expect(result.conventions).toBeNull();
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('should rewrite when force is true even if the file exists', async () => {
    // force bypasses the existence check entirely and regenerates from source.
    mockStat.mockImplementation(async (p) => {
      if (String(p).endsWith('project-conventions.json')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const result = await ensureConventions('/fake/project', { force: true });

    expect(result.created).toBe(true);
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/fake/project/.specflow/project-conventions.json',
      expect.stringContaining('"schemaVersion": 1'),
      'utf-8',
    );
  });
});

describe('seedProjectConventions', () => {
  it('generates the file when missing and logs the path', async () => {
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await seedProjectConventions('/fake/project');

    expect(mockWriteFile).toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Generated project-conventions.json'),
    );
    errSpy.mockRestore();
  });

  it('never throws when generation fails — logs and continues', async () => {
    // writeFile rejects → writeConventions throws → seed must swallow it so that
    // a detection failure can never break server initialization.
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockRejectedValue(new Error('EACCES'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(seedProjectConventions('/fake/project')).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Convention detection skipped'));
    errSpy.mockRestore();
  });
});
