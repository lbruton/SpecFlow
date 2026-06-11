import { join } from 'path';
import { tmpdir } from 'os';
import { createDualServerConfig } from './e2e/helpers/dual-server-config';

// Guard flag: the smoke specs skip themselves unless launched through this
// config (they need the seeded backend below — under the default config they
// would fail vacuously with no projects registered).
process.env.SPECFLOW_SMOKE_CONFIG = '1';

export default createDualServerConfig({
  dashboardPort: 5085,
  frontendPort: 5185,
  specWorkflowHome: process.env.SPEC_WORKFLOW_HOME || join(tmpdir(), 'specwf-e2e-smoke-state'),
  testMatch: ['**/dashboard-route-sweep.spec.ts', '**/spec-viewer-mdx.spec.ts'],
});
