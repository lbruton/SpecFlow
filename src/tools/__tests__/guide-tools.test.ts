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
      const spy = vi.spyOn(PathUtils, 'getWorkflowRoot').mockReturnValue('/test/project/.specflow');

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

    // SFLW-27 (B.2 RED): These assertions pin the NEW Phase 4.9 Test Design
    // Coverage rule text that task C.2 will introduce into spec-workflow-guide.ts.
    // They FAIL until C.2 replaces the weak "≥1 task matching test/TDD/verify"
    // rule (:364) and the single-line report-format example (:403-404) with the
    // AC-1..AC-8 rules. Do NOT relax these to match the current weak wording — a
    // passing assertion here before C.2 is a false-RED targeting already-present
    // text. The non-specific length.toBeGreaterThan(0) check above is intentionally
    // NOT relied upon for the Phase 4.9 surface.
    describe('Phase 4.9 Test Design Coverage rule text (SFLW-27)', () => {
      const guide = (): string => {
        vi.spyOn(PathUtils, 'getWorkflowRoot').mockReturnValue('/test/project/.specflow');
        const res = specWorkflowGuideHandler({}, ctx);
        return res.data?.guide as string;
      };

      // AC-1 / AC-8: per-AC coverage rule via the Traceability "Test Tasks"
      // column — replacing the weak "≥1 task matching test/TDD/verify" wording.
      it('maps every acceptance criterion to a planned test task (AC-1, replaces :364)', () => {
        const g = guide();
        // The rule must reference per-AC coverage of every acceptance criterion.
        expect(g).toContain('acceptance criterion');
        // The mapping lives in the Traceability "Test Tasks" column (D-1) — not a
        // re-mapped sub-table. Assert both the table name and the column label.
        expect(g).toContain('Requirements → Tasks Traceability');
        expect(g).toContain('Test Tasks');
      });

      // AC-2: numbering-agnostic baseline → red → implementation SEQUENCE — the
      // rule must demand the sequence, not merely "a test-ish task exists".
      it('requires the baseline → red → implementation sequence, numbering-agnostic (AC-2)', () => {
        const g = guide();
        // The normative structural pattern, expressed as a sequence.
        expect(g).toContain('baseline → red → implementation');
        // It must require the SEQUENCE (baseline before red before implementation),
        // not just the presence of a test task.
        expect(g).toContain('before any implementation task');
        // Numbering-agnostic: the rule must NOT pin literal 0.4 / 0.5 task numbers.
        expect(g).not.toContain('0.4');
        expect(g).not.toContain('0.5');
      });

      // AC-5 / AC-6: structured N/A escape hatch with labelled sub-fields, and
      // AC-3 / AC-6 FAIL conditions.
      it('requires a structured N/A with justification + manual-validation sub-fields (AC-5, AC-6)', () => {
        const g = guide();
        expect(g).toContain('Not Applicable');
        expect(g).toContain('Justification for N/A');
        expect(g).toContain('Manual Validation Notes');
      });

      // AC-3 / AC-4: absent tests ⇒ FAIL, partial / mis-sequenced ⇒ CONCERNS.
      it('encodes FAIL when tests absent (AC-3) and CONCERNS when partial/mis-sequenced (AC-4)', () => {
        const g = guide();
        expect(g).toContain('CONCERNS');
        // AC-3: no planned test task and not a justified N/A ⇒ FAIL.
        expect(g).toContain('no planned test task');
        // AC-4: an unmapped AC or incorrect sequencing ⇒ CONCERNS.
        expect(g).toContain('unmapped');
      });

      // AC-7: a section FAIL propagates — neither top-level PASS signal may be PASS.
      it('propagates a section FAIL so no top-level signal can be PASS (AC-7)', () => {
        const g = guide();
        expect(g).toContain('Cross-Validation Summary');
        expect(g).toContain('Agent Recommendation');
        // The propagation rule must be explicit, not implied.
        expect(g).toMatch(/neither.*PASS/i);
      });

      // AC-8: the updated multi-row report-format EXAMPLE — per-AC mapping, the
      // N/A structured sub-fields, and a standardized verdict — replacing the
      // single-line :403-404 example.
      it('ships a multi-row report-format example with a standardized verdict (AC-8, replaces :403-404)', () => {
        const g = guide();
        // Standardized verdict line on the section (replaces the heterogeneous
        // single-line "✓ | [NO TEST TASK FOUND] ✗" example).
        expect(g).toContain('**Verdict:** [PASS | CONCERNS | FAIL]');
        // The example must surface the N/A structured sub-fields.
        expect(g).toContain('Manual Validation Notes');
      });
    });
  });

  describe('steering-guide', () => {
    it('returns a non-empty guide resolved from context.projectPath', () => {
      const spy = vi.spyOn(PathUtils, 'getWorkflowRoot').mockReturnValue('/test/project/.specflow');

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
