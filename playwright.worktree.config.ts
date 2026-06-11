import { join } from 'path';
import { tmpdir } from 'os';
import { createDualServerConfig } from './e2e/helpers/dual-server-config';

export default createDualServerConfig({
  dashboardPort: 5084,
  frontendPort: 5184,
  specWorkflowHome: process.env.SPEC_WORKFLOW_HOME || join(tmpdir(), 'specwf-e2e-worktree-state'),
  testMatch: '**/worktree-no-shared.spec.ts',
});
