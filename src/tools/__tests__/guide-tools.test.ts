import { describe, it, expect, vi, afterEach } from 'vitest';
import { specWorkflowGuideHandler } from '../spec-workflow-guide.js';
import { steeringGuideHandler } from '../steering-guide.js';
import { PathUtils } from '../../core/path-utils.js';
import { ToolContext } from '../../types.js';

// The guide tools are pure, read-only informational tools: they perform no
// filesystem I/O and only substitute a workflow-root string into a static
// template. They must therefore (a) always return their guide and (b) honor an
// optional args.projectPath override, mirroring the sibling tools.
describe('guide tools', () => {
  const ctx: ToolContext = { projectPath: '/test/project', dashboardUrl: undefined };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('spec-workflow-guide', () => {
    it('returns a non-empty guide using context.projectPath', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/test/project/.specflow');

      const res = specWorkflowGuideHandler({}, ctx);

      expect(res.success).toBe(true);
      expect(typeof res.data?.guide).toBe('string');
      expect((res.data?.guide as string).length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledWith('/test/project');
    });

    it('honors an args.projectPath override', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/override/path/.specflow');

      const res = specWorkflowGuideHandler({ projectPath: '/override/path' }, ctx);

      expect(res.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('/override/path');
    });
  });

  describe('steering-guide', () => {
    it('returns a non-empty guide using context.projectPath', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/test/project/.specflow');

      const res = steeringGuideHandler({}, ctx);

      expect(res.success).toBe(true);
      expect((res.data?.guide as string).length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledWith('/test/project');
    });

    it('honors an args.projectPath override', () => {
      const spy = vi
        .spyOn(PathUtils, 'getWorkflowRoot')
        .mockReturnValue('/override/path/.specflow');

      const res = steeringGuideHandler({ projectPath: '/override/path' }, ctx);

      expect(res.success).toBe(true);
      expect(spy).toHaveBeenCalledWith('/override/path');
    });
  });
});
