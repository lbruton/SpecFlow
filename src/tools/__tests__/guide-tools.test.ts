import { describe, it, expect, vi, afterEach } from 'vitest';
import { specWorkflowGuideHandler } from '../spec-workflow-guide.js';
import { steeringGuideHandler } from '../steering-guide.js';
import { PathUtils } from '../../core/path-utils.js';
import { ToolContext } from '../../types.js';

// The guide tools are pure, read-only informational tools: they perform no
// filesystem I/O and only substitute the server's resolved workflow root into a
// static template. They must always render — even in degraded mode — using
// context.projectPath, falling back to '.' so the root resolution never throws.
// They intentionally take no projectPath argument (getWorkflowRoot returns the
// configured DocVault root regardless, so an override would mislead).
describe('guide tools', () => {
  const ctx: ToolContext = { projectPath: '/test/project', dashboardUrl: undefined };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec-workflow-guide', () => {
    it('returns a non-empty guide resolved from context.projectPath', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/test/project/.specflow');

      const res = specWorkflowGuideHandler({}, ctx);

      expect(res.success).toBe(true);
      expect(typeof res.data?.guide).toBe('string');
      expect((res.data?.guide as string).length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledWith('/test/project');
    });

    it("falls back to '.' when context.projectPath is empty", () => {
      const spy = vi.spyOn(PathUtils, 'getWorkflowRoot').mockReturnValue('./.specflow');

      const res = specWorkflowGuideHandler({}, { projectPath: '' });

      expect(res.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('.');
    });
  });

  describe('steering-guide', () => {
    it('returns a non-empty guide resolved from context.projectPath', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/test/project/.specflow');

      const res = steeringGuideHandler({}, ctx);

      expect(res.success).toBe(true);
      expect((res.data?.guide as string).length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledWith('/test/project');
    });

    it("falls back to '.' when context.projectPath is empty", () => {
      const spy = vi.spyOn(PathUtils, 'getWorkflowRoot').mockReturnValue('./.specflow');

      const res = steeringGuideHandler({}, { projectPath: '' });

      expect(res.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('.');
    });
  });
});
