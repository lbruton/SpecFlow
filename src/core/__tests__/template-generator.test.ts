import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Stats } from 'fs';
import type { ProjectConventions } from '../convention-detector.js';

const __dirname_test = dirname(fileURLToPath(import.meta.url));

// Mock fs/promises before importing the module under test
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

import { readFile, mkdir, writeFile, stat } from 'fs/promises';
import { generateUserTemplates, writeUserTemplates } from '../template-generator.js';

const mockReadFile = vi.mocked(readFile);
const mockMkdir = vi.mocked(mkdir);
const mockWriteFile = vi.mocked(writeFile);
const mockStat = vi.mocked(stat);

/** Helper: create a fake Stats for a file. */
function fakeFileStat(): Stats {
  return { isFile: () => true, isDirectory: () => false } as unknown as Stats;
}

/** Minimal design template with a Testing Strategy section. */
const MOCK_DESIGN_TEMPLATE = `# Design

## Architecture
[Architecture details]

## Testing Strategy
[Default testing strategy placeholder]

## Rollback Plan
[Rollback details]
`;

/** Minimal tasks template with a Standard Closing Tasks section. */
const MOCK_TASKS_TEMPLATE = `# Tasks

- [ ] 1. First task
  - Do the thing

## Standard Closing Tasks

- [ ] 6. Default closing task
  - Default details
`;

/** Build a conventions object with sensible defaults and overrides. */
function makeConventions(
  overrides: {
    testing?: Partial<ProjectConventions['testing']>;
    versioning?: Partial<ProjectConventions['versioning']>;
    changelog?: Partial<ProjectConventions['changelog']>;
  } = {},
): ProjectConventions {
  return {
    schemaVersion: 1,
    detectedAt: '2026-04-03T00:00:00.000Z',
    testing: {
      framework: null,
      command: null,
      configFile: null,
      testDir: null,
      hasBrowserbase: false,
      ...overrides.testing,
    },
    versioning: {
      hasVersionLock: false,
      lockFile: null,
      packageVersion: null,
      userDeclinedSetup: false,
      ...overrides.versioning,
    },
    changelog: {
      hasChangelog: false,
      file: null,
      format: null,
      docvaultFallback: false,
      ...overrides.changelog,
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  mockStat.mockRejectedValue(enoent);
  mockReadFile.mockRejectedValue(enoent);
});

/**
 * Set up readFile to serve mock templates.
 * readDefaultTemplate checks project .specflow/templates/ first, then bundled.
 * We simulate the bundled fallback by matching on the path containing 'markdown/templates/'.
 */
function setupTemplateReads() {
  mockReadFile.mockImplementation(async (p) => {
    const path = String(p);
    if (path.includes('markdown/templates/design-template.md')) return MOCK_DESIGN_TEMPLATE;
    if (path.includes('markdown/templates/tasks-template.md')) return MOCK_TASKS_TEMPLATE;
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
}

describe('generateUserTemplates', () => {
  it('should generate browserbase-specific templates', async () => {
    setupTemplateReads();
    const conventions = makeConventions({
      testing: { hasBrowserbase: true, framework: 'bb-test', testDir: 'tests/runbook/' },
    });

    const result = await generateUserTemplates('/fake/project', conventions);

    // Design template should contain Runbook E2E Tests section
    expect(result.designTemplate).toContain('Runbook E2E Tests');
    expect(result.designTemplate).toContain('tests/runbook/');

    // Tasks template should contain /bb-test references AND verification.md
    expect(result.tasksTemplate).toContain('/bb-test');
    expect(result.tasksTemplate).toContain('runbook');
    expect(result.tasksTemplate).toContain('verification.md');
  });

  it('should generate vitest-specific templates', async () => {
    setupTemplateReads();
    const conventions = makeConventions({
      testing: { framework: 'vitest', command: 'npx vitest', configFile: 'vitest.config.ts' },
    });

    const result = await generateUserTemplates('/fake/project', conventions);

    // Should reference vitest
    expect(result.designTemplate).toContain('vitest');
    expect(result.tasksTemplate).toContain('npx vitest');

    // Should contain verification.md and log-implementation gate
    expect(result.tasksTemplate).toContain('verification.md');
    expect(result.tasksTemplate).toContain('log-implementation');

    // Should NOT contain upstream TypeScript/React/Express sample references
    expect(result.tasksTemplate).not.toContain('TypeScript');
    expect(result.tasksTemplate).not.toContain('IFeatureService');
    expect(result.tasksTemplate).not.toContain('BaseComponent');

    // Should NOT contain browserbase references
    expect(result.designTemplate).not.toContain('bb-test');
    expect(result.designTemplate).not.toContain('runbook');
    expect(result.tasksTemplate).not.toContain('bb-test');
    expect(result.tasksTemplate).not.toContain('Runbook');
  });

  it('should use generic fallbacks when all testing fields are null', async () => {
    setupTemplateReads();
    const conventions = makeConventions(); // all defaults (null)

    const result = await generateUserTemplates('/fake/project', conventions);

    // Should use generic fallback values
    expect(result.designTemplate).toContain('npm test');
    expect(result.designTemplate).toContain('tests/');
    expect(result.tasksTemplate).toContain('npm test');

    // Should contain the HARD GATE and verification artifacts
    expect(result.tasksTemplate).toContain('HARD GATE');
    expect(result.tasksTemplate).toContain('verification.md');
    expect(result.tasksTemplate).toContain('log-implementation');

    // Should NOT contain upstream TypeScript/React/Express sample references
    expect(result.tasksTemplate).not.toContain('TypeScript');
    expect(result.tasksTemplate).not.toContain('IFeatureService');
    expect(result.tasksTemplate).not.toContain('BaseComponent');

    // Should NOT contain browserbase references
    expect(result.designTemplate).not.toContain('bb-test');
    expect(result.tasksTemplate).not.toContain('bb-test');
  });
});

describe('bundled tasks-template.md', () => {
  it('routes cross-model peer review through CodeRabbit and bars disabled rescue paths', () => {
    const templatePath = join(
      __dirname_test,
      '..',
      '..',
      'markdown',
      'templates',
      'tasks-template.md',
    );
    const content = readFileSync(templatePath, 'utf-8');

    // Guard the slice markers: if a marker is missing or the tasks are reordered,
    // indexOf returns -1 and slice() would silently yield a misleading substring.
    const start = content.indexOf('- [ ] N+3. Cross-Model Peer Review');
    // Search for the end marker after `start` so we slice the task that follows N+3.
    const end = content.indexOf('- [ ] N+4. Generate verification.md', start);
    expect(start, 'peer-review task marker (N+3) not found in tasks-template.md').toBeGreaterThan(
      -1,
    );
    expect(end, 'verification task marker (N+4) not found in tasks-template.md').toBeGreaterThan(
      -1,
    );
    expect(
      end,
      'verification task marker (N+4) appears before peer-review task (N+3) — tasks reordered?',
    ).toBeGreaterThan(start);

    const peerReviewTask = content.slice(start, end);

    expect(peerReviewTask).toContain('coderabbit:review');
    expect(peerReviewTask).toContain('CodeRabbit is the cross-model peer reviewer');
    expect(peerReviewTask).toContain('Critical/High/Medium/Low severity');
    // codex:rescue / gemini:rescue are named only as disabled dispatch paths the
    // reviewer must NOT use — they are never active rescue steps in the chain.
    expect(peerReviewTask).toContain(
      'disabled plugin dispatch paths such as codex:rescue or gemini:rescue',
    );
    // Each rescue token must appear EXACTLY ONCE — solely in the prohibition clause
    // above. More than one occurrence implies an active rescue step was reintroduced.
    const countOccurrences = (haystack: string, needle: string): number =>
      haystack.split(needle).length - 1;
    expect(countOccurrences(peerReviewTask, 'codex:rescue')).toBe(1);
    expect(countOccurrences(peerReviewTask, 'gemini:rescue')).toBe(1);
    expect(peerReviewTask).not.toContain('pr-review-toolkit:review-pr');
    expect(peerReviewTask).not.toContain('$CODEX_SESSION');
    expect(peerReviewTask).not.toContain('Critical/Important');
  });
});

describe('bundled readiness-report-template.md', () => {
  function readReadinessTemplate(): string {
    const templatePath = join(
      __dirname_test,
      '..',
      '..',
      'markdown',
      'templates',
      'readiness-report-template.md',
    );
    return readFileSync(templatePath, 'utf-8');
  }

  /** Slice content between startHeading (inclusive) and endHeading (exclusive). */
  function sliceSection(content: string, startHeading: string, endHeading: string): string {
    return content.slice(content.indexOf(startHeading), content.indexOf(endHeading));
  }

  // AC-1 (D-1): the per-AC test mapping lives in the Requirements → Tasks
  // Traceability table via a new `Test Tasks` column.
  it('adds a Test Tasks column to the Requirements → Tasks Traceability table (AC-1)', () => {
    const content = readReadinessTemplate();
    const traceabilityTable = content.slice(
      content.indexOf('## Requirements → Tasks Traceability'),
      content.indexOf('## Design → Tasks Alignment'),
    );
    expect(traceabilityTable).toContain('Test Tasks');
  });

  // AC-5 / AC-6: the structured N/A escape hatch must carry labelled sub-fields,
  // not buried prose.
  it('carries the structured N/A sub-field labels (AC-5/AC-6)', () => {
    const content = readReadinessTemplate();
    expect(content).toContain('Justification for N/A:');
    expect(content).toContain('Manual Validation Notes:');
  });

  // AC-7 / D-2: every readiness section ends with a standardized
  // `**Verdict:** [PASS | CONCERNS | FAIL]` line. A bare `**Verdict:**` assertion
  // would be a FALSE-RED — today's template already carries descriptive-prose
  // verdicts (e.g. `[All requirements covered / N orphaned requirements found]`),
  // so the assertion targets the standardized [PASS | CONCERNS | FAIL] form only.
  it('standardizes every section verdict to [PASS | CONCERNS | FAIL] (AC-7/D-2)', () => {
    const content = readReadinessTemplate();
    const sections = [
      '## Requirements → Tasks Traceability',
      '## Design → Tasks Alignment',
      '## Contradictions',
      '## Prototype Consistency',
      '## File Touch Map Validation',
      '## Test Design Coverage',
      '## Release Hygiene',
    ];

    for (const heading of sections) {
      const start = content.indexOf(heading);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = content.indexOf('\n## ', start + heading.length);
      const section = content.slice(start, next === -1 ? undefined : next);
      expect(section).toContain('**Verdict:** [PASS | CONCERNS | FAIL]');
    }
  });

  // AC-7 / D-2: the currently verdict-less `## Prototype Consistency` section must
  // now carry a standardized verdict line.
  it('gives the Prototype Consistency section a standardized verdict (AC-7/D-2)', () => {
    const content = readReadinessTemplate();
    const prototypeSection = sliceSection(
      content,
      '## Prototype Consistency',
      '## File Touch Map Validation',
    );
    expect(prototypeSection).toContain('**Verdict:** [PASS | CONCERNS | FAIL]');
  });

  // AC-7: the explicit propagation rule — a section FAIL blocks both top-level
  // PASS signals — must be present in the template text.
  it('states the explicit FAIL-propagation rule (AC-7)', () => {
    const content = readReadinessTemplate();
    expect(content).toContain(
      'any section FAIL blocks both the Cross-Validation Summary Status and the Agent Recommendation from being PASS.',
    );
  });

  // D-1 discoverability: because the AC→test mapping moved to the Traceability
  // table, the Test Design Coverage section must point the reader up to it.
  it('points the reader from Test Design Coverage to the Traceability table (D-1)', () => {
    const content = readReadinessTemplate();
    const testDesignSection = sliceSection(
      content,
      '## Test Design Coverage',
      '## Release Hygiene',
    );
    expect(testDesignSection).toContain('Requirements → Tasks Traceability');
  });

  // AC-2 / D-4: the structural pattern (baseline → red → implementation) is the
  // normative wording. Assert the pattern phrasing is present and that the
  // RESTRICTIVE "must be 0.4/0.5" wording is absent. The template MAY still cite
  // 0.4/0.5 as example defaults, so the negative assertion targets only the
  // restrictive phrasing — never a bare mention of those strings.
  it('uses numbering-agnostic baseline → red → implementation wording (AC-2/D-4)', () => {
    const content = readReadinessTemplate();
    const testDesignSection = sliceSection(
      content,
      '## Test Design Coverage',
      '## Release Hygiene',
    );
    expect(testDesignSection).toContain('baseline → red → implementation');
    expect(testDesignSection).not.toContain('must be 0.4/0.5');
  });
});

describe('writeUserTemplates', () => {
  it('should not overwrite existing user-template files', async () => {
    // Simulate that the design template already exists
    mockStat.mockImplementation(async (p) => {
      const path = String(p);
      if (path.endsWith('user-templates/design-template.md')) return fakeFileStat();
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const templates = {
      designTemplate: '# New design',
      tasksTemplate: '# New tasks',
    };

    await writeUserTemplates('/fake/project', templates);

    // Should NOT have written anything since a user-template already exists
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockMkdir).not.toHaveBeenCalled();
  });

  it('should write templates when no user-templates exist', async () => {
    // All stat calls reject (no existing files) — default from beforeEach
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    const templates = {
      designTemplate: '# Generated design',
      tasksTemplate: '# Generated tasks',
    };

    await writeUserTemplates('/fake/project', templates);

    expect(mockMkdir).toHaveBeenCalledWith('/fake/project/.specflow/user-templates', {
      recursive: true,
    });
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/fake/project/.specflow/user-templates/design-template.md',
      '# Generated design',
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/fake/project/.specflow/user-templates/tasks-template.md',
      '# Generated tasks',
      'utf-8',
    );
  });
});
