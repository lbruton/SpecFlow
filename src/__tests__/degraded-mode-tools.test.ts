import { describe, it, expect } from 'vitest';
import { DEGRADED_MODE_SAFE_TOOLS, SpecWorkflowMCPServer } from '../server.js';

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

// Verify the CallTool router itself (routeToolCall) applies the degraded-mode
// policy: safe tools bypass the gate and render; other tools are blocked.
describe('routeToolCall degraded-mode gate', () => {
  const degradedContext = {
    projectPath: '/tmp/specflow-degraded-test',
    degraded: true,
    degradedReason: 'simulated init failure',
    dashboardUrl: undefined,
  };

  it('bypasses the gate for a whitelisted safe tool (no projectPath)', async () => {
    const server = new SpecWorkflowMCPServer();
    const res = await server.routeToolCall('spec-workflow-guide', {}, degradedContext);

    expect(res.isError).not.toBe(true);
    expect(res.content[0].text).not.toContain('degraded mode');
  });

  it('still renders a safe tool when on-the-fly projectPath recovery fails', async () => {
    const server = new SpecWorkflowMCPServer();
    // The router defensively attempts recovery for any supplied projectPath. A
    // non-existent one makes validateProjectPath/loadConfig throw; a safe tool
    // must fall through to render rather than surface the config error. (Guide
    // tools no longer advertise projectPath, but the router stays robust if one
    // is passed anyway.)
    const res = await server.routeToolCall(
      'spec-workflow-guide',
      { projectPath: '/nonexistent/path/does-not-exist-xyz' },
      degradedContext,
    );

    expect(res.isError).not.toBe(true);
    expect(res.content[0].text).not.toContain('degraded mode');
  });

  it('blocks a non-safe tool in degraded mode', async () => {
    const server = new SpecWorkflowMCPServer();
    const res = await server.routeToolCall('spec-status', { specName: 'anything' }, degradedContext);

    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('degraded mode');
  });
});
