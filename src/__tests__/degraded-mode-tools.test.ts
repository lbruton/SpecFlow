import { describe, it, expect } from 'vitest';
import { DEGRADED_MODE_SAFE_TOOLS } from '../server.js';

// In degraded mode the CallTool handler blocks tools that cannot resolve a
// project. Pure read-only informational tools (the guides) do no filesystem
// I/O and must be exempt so a degraded server can still serve guidance.
describe('DEGRADED_MODE_SAFE_TOOLS', () => {
  it('includes the pure read-only guide tools', () => {
    expect(DEGRADED_MODE_SAFE_TOOLS.has('spec-workflow-guide')).toBe(true);
    expect(DEGRADED_MODE_SAFE_TOOLS.has('steering-guide')).toBe(true);
  });

  it('excludes filesystem-touching tools', () => {
    expect(DEGRADED_MODE_SAFE_TOOLS.has('spec-status')).toBe(false);
    expect(DEGRADED_MODE_SAFE_TOOLS.has('write-spec-doc')).toBe(false);
    expect(DEGRADED_MODE_SAFE_TOOLS.has('log-implementation')).toBe(false);
    expect(DEGRADED_MODE_SAFE_TOOLS.has('approvals')).toBe(false);
  });
});
