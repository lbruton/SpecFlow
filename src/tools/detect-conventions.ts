import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolContext, ToolResponse } from '../types.js';
import { PathUtils, validateProjectPath } from '../core/path-utils.js';
import { ensureConventions, type ProjectConventions } from '../core/convention-detector.js';

export const detectConventionsTool: Tool = {
  name: 'detect-conventions',
  description: `Detect and persist a project's release-hygiene conventions to project-conventions.json.

# Instructions
Scans the project's source files (test framework + command, version-lock / package version, changelog) and writes the result to the workflow root (DocVault specflow root, or local .specflow/ when DocVault is not configured). The file is a regenerable, source-derived artifact consumed by the Phase 4.9 readiness gate and spec-status — it is never a hand-maintained copy. The server seeds it automatically on boot when missing; call this tool to refresh it after the project's tooling changes (e.g. a new test framework or changelog).`,
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description:
          'Absolute path to the project root (optional — uses server context path if not provided)',
      },
      force: {
        type: 'boolean',
        description:
          'Regenerate even if the file already exists (default: true). When false, only writes if the file is missing.',
      },
    },
    required: [],
  },
  annotations: {
    title: 'Detect Conventions',
    readOnlyHint: false,
  },
};

export async function detectConventionsHandler(
  args: any,
  context: ToolContext,
): Promise<ToolResponse> {
  const projectPath = args.projectPath || context.projectPath;

  if (!projectPath) {
    return {
      success: false,
      message: 'Project path is required but not provided in context or arguments',
    };
  }

  try {
    const translatedPath = PathUtils.translatePath(projectPath);
    // Validate the path before any filesystem write; validateProjectPath
    // resolves to the canonical, security-checked absolute path.
    const validatedPath = await validateProjectPath(translatedPath);
    const force = args.force ?? true;
    return buildResult(await ensureConventions(validatedPath, { force }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to detect conventions: ${errorMessage}`,
      nextSteps: ['Verify the project path is correct and accessible'],
    };
  }
}

/** Build the success response from an ensureConventions result. */
function buildResult(result: {
  created: boolean;
  path: string;
  conventions: ProjectConventions | null;
}): ToolResponse {
  const { created, path, conventions } = result;
  const summary = conventions
    ? `framework: ${conventions.testing.framework ?? 'none'}, version-lock: ${conventions.versioning.hasVersionLock}, changelog: ${conventions.changelog.hasChangelog}`
    : 'unchanged';
  return {
    success: true,
    message: created
      ? `Wrote project-conventions.json to ${path} (${summary})`
      : `project-conventions.json already exists at ${path} — pass force:true to regenerate`,
    data: { path, created, conventions },
    nextSteps: [
      'These conventions drive the Phase 4.9 readiness gate and spec-status. Re-run with force:true to refresh after the test framework, version lock, or changelog changes.',
    ],
  };
}
