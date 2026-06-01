import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { registerTools, handleToolCall } from './tools/index.js';
import { registerPrompts, handlePromptList, handlePromptGet } from './prompts/index.js';
import { ToolContext, MCPToolResponse } from './types.js';
import { validateProjectPath, PathUtils } from './core/path-utils.js';
import { WorkspaceInitializer } from './core/workspace-initializer.js';
import { loadOrCreateConfig, loadConfig, ResolvedConfig } from './core/config-loader.js';
import { needsMigration, migrateToDocVault } from './core/migration.js';
import { ProjectRegistry } from './core/project-registry.js';
import { DashboardSessionManager } from './core/dashboard-session.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Tools that perform NO filesystem I/O and only return static guidance. They
 * substitute a workflow-root string into a template, so they remain usable even
 * when project initialization failed (degraded mode). The degraded-mode gate
 * exempts these instead of returning the blanket "no valid project" error —
 * unlike the data tools, they don't depend on a resolved project.
 */
export const DEGRADED_MODE_SAFE_TOOLS = new Set(['spec-workflow-guide', 'steering-guide']);

export class SpecWorkflowMCPServer {
  private server: Server;
  private projectPath!: string; // workflowRootPath for .specflow operations
  private workspacePath!: string; // workspace/worktree path for identity in registry
  private projectRegistry: ProjectRegistry;
  private lang?: string;

  constructor() {
    // Get version from package.json
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    // Get all registered tools and prompts
    const tools = registerTools();
    const prompts = registerPrompts();

    // Create tools capability object with each tool name
    const toolsCapability = tools.reduce(
      (acc, tool) => {
        acc[tool.name] = {};
        return acc;
      },
      {} as Record<string, {}>,
    );

    this.server = new Server(
      {
        name: 'specflow',
        version: packageJson.version,
      },
      {
        capabilities: {
          tools: toolsCapability,
          prompts: {
            listChanged: true,
          },
        },
      },
    );

    this.projectRegistry = new ProjectRegistry();
  }

  async initialize(projectPath: string, workspacePath: string, lang?: string) {
    this.projectPath = projectPath;
    this.workspacePath = workspacePath;
    this.lang = lang;

    // Track whether project initialization succeeded (degraded mode if not)
    let projectInitialized = false;
    let initError: string | undefined;

    try {
      // Validate project path
      await validateProjectPath(this.projectPath);
      await validateProjectPath(this.workspacePath);

      // Load or create DocVault config
      const config = await loadOrCreateConfig(this.projectPath);
      console.error(`DocVault config loaded: ${config.specflowRoot}`);

      // Initialize PathUtils with DocVault resolution
      PathUtils.initializeDocVault(config);

      // Initialize workspace
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const packageJsonPath = join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const workspaceInitializer = new WorkspaceInitializer(
        this.projectPath,
        packageJson.version,
        config,
      );
      await workspaceInitializer.initializeWorkspace();

      // Check for and run migration if needed
      if (await needsMigration(this.projectPath, config)) {
        console.error('Migrating existing .specflow/ content to DocVault...');
        const migrationResult = await migrateToDocVault(this.projectPath, config);
        console.error(
          `Migration complete: ${migrationResult.migratedDirs.length} migrated, ${migrationResult.skippedDirs.length} skipped, ${migrationResult.errors.length} errors`,
        );
      }

      // Register this project in the global registry (non-essential — see method).
      await this.registerProjectSafely(config);
      projectInitialized = true;
    } catch (error: any) {
      // Project initialization failed — enter degraded mode instead of crashing.
      // This allows the MCP server to start and report the error via tool calls,
      // rather than silently dying and leaving the client with no connection.
      initError = error.message || String(error);
      console.error(`WARNING: Project initialization failed — starting in degraded mode.`);
      console.error(`  Path: ${this.projectPath}`);
      console.error(`  Error: ${initError}`);
      console.error(`  Hint: Launch specflow with an explicit project path, e.g.:`);
      console.error(`    npx -y @lbruton/specflow@latest /path/to/your/project`);
      console.error(
        `  The MCP server will start, but tools will return errors until a valid project is configured.`,
      );
    }

    // Try to get the dashboard URL from session manager
    let dashboardUrl: string | undefined = undefined;
    try {
      const sessionManager = new DashboardSessionManager();
      const dashboardSession = await sessionManager.getDashboardSession();
      if (dashboardSession) {
        dashboardUrl = dashboardSession.url;
      }
    } catch (error) {
      // Dashboard not running, continue without it
    }

    // Create context for tools — include degraded mode info
    const context: any = {
      projectPath: this.projectPath,
      dashboardUrl: dashboardUrl,
      lang: this.lang,
    };

    if (!projectInitialized) {
      context.degraded = true;
      context.degradedReason = initError;
    }

    // Register handlers
    this.setupHandlers(context);

    // Connect to stdio transport
    const transport = new StdioServerTransport();

    // Handle client disconnection - exit gracefully when transport closes
    transport.onclose = async () => {
      await this.stop();
      process.exit(0);
    };

    await this.server.connect(transport);

    // Monitor stdin for client disconnection (additional safety net)
    process.stdin.on('end', async () => {
      await this.stop();
      process.exit(0);
    });

    // Handle stdin errors
    process.stdin.on('error', async (error) => {
      console.error('stdin error:', error);
      await this.stop();
      process.exit(1);
    });

    if (projectInitialized) {
      console.error('MCP server initialized successfully');
    } else {
      console.error('MCP server started in degraded mode — tools will report configuration errors');
    }
  }

  /**
   * Register this project in the shared global registry (~/.specflow-mcp).
   *
   * This write is NON-ESSENTIAL for tool operation: by the time it runs, config
   * is loaded and PathUtils is initialized, so tools resolve paths without it —
   * only the dashboard's multi-project list depends on the registry. A failure
   * here (read-only $HOME in a sandboxed subagent, or a transient corrupted
   * registry) must NOT trip degraded mode and break every tool, so it is caught
   * and downgraded to a warning. DocVault specflow root (where specs/approvals/
   * steering live) is used as the workflowRootPath, not the git root.
   */
  private async registerProjectSafely(config: ResolvedConfig): Promise<void> {
    try {
      const projectId = await this.projectRegistry.registerProject(
        this.workspacePath,
        process.pid,
        {
          workflowRootPath: config.specflowRoot,
        },
      );
      console.error(`Project registered: ${projectId} (workflow root: ${config.specflowRoot})`);
    } catch (registryError: any) {
      console.error(
        `WARNING: Global project registry update failed — the dashboard may not list this ` +
          `project, but tools will work normally. Error: ${registryError?.message || registryError}`,
      );
    }
  }

  /**
   * Route a single CallTool request to its handler, applying degraded-mode
   * policy. Extracted from the request-handler closure so it can be unit-tested
   * directly (the MCP transport need not be wired up).
   *
   * Degraded-mode policy:
   * - If args.projectPath is supplied, attempt on-the-fly config load and run
   *   the tool against that project.
   * - Pure read-only guide tools (DEGRADED_MODE_SAFE_TOOLS) do no filesystem I/O,
   *   so they are exempt: they render even when no project resolves and even when
   *   an on-the-fly load fails.
   * - All other tools return a structured "no valid project" error.
   */
  async routeToolCall(name: string, args: any, context: any): Promise<MCPToolResponse> {
    if (context.degraded) {
      const overridePath = args.projectPath as string | undefined;
      const isSafeTool = DEGRADED_MODE_SAFE_TOOLS.has(name);

      if (overridePath) {
        let callContext: ToolContext | undefined;
        try {
          await validateProjectPath(overridePath);
          const config = await loadConfig(overridePath);
          // Global state — acceptable here because degraded mode has no prior
          // config set, so we're going from nothing to something. Concurrent
          // calls with different projectPath values would race; a future refactor
          // should thread config through ToolContext instead.
          PathUtils.initializeDocVault(config);
          callContext = {
            projectPath: overridePath,
            dashboardUrl: context.dashboardUrl,
            lang: context.lang,
          };
        } catch (configError: any) {
          // Pure read-only guide tools don't need config/filesystem access, so a
          // failed on-the-fly load must not block them — fall through to render
          // them below. Only the data tools surface the config-load error.
          if (!isSafeTool) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text:
                    `SpecFlow MCP server started without a valid project (startup error: ${context.degradedReason}).\n\n` +
                    `Attempted on-demand config load for projectPath="${overridePath}" but it also failed:\n` +
                    `${configError.message}\n\n` +
                    `Ensure the project has a valid .specflow/config.json with a "docvault" path.`,
                },
              ],
              isError: true,
            };
          }
        }

        // Dispatch OUTSIDE the config-load try so a tool-execution error is never
        // misreported as a config-load failure (handleToolCall does its own error
        // mapping). Only reached when recovery succeeded.
        if (callContext) {
          return await handleToolCall(name, args, callContext);
        }
      }

      // Pure read-only guide tools do no filesystem I/O and still render from
      // context.projectPath (set even in degraded mode), so let them through
      // instead of erroring — whether or not a projectPath was supplied.
      if (isSafeTool) {
        try {
          return await handleToolCall(name, args, context);
        } catch (error: any) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to execute ${name} in degraded mode: ${error?.message || error}`,
              },
            ],
            isError: true,
          };
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text:
              `SpecFlow MCP server is running in degraded mode — no valid project found.\n\n` +
              `Error: ${context.degradedReason}\n\n` +
              `To use this tool, pass the "projectPath" parameter with the absolute path to your project directory.\n` +
              `The project must have a .specflow/config.json file.\n\n` +
              `Example: { "projectPath": "/path/to/your/project", ... }\n\n` +
              `Alternatively, fix the MCP config to pass the project path at startup:\n` +
              `  npx -y @lbruton/specflow@latest /path/to/your/project`,
          },
        ],
        isError: true,
      };
    }

    try {
      return await handleToolCall(name, args, context);
    } catch (error: any) {
      throw new McpError(ErrorCode.InternalError, error.message);
    }
  }

  private setupHandlers(context: any) {
    // Tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: registerTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.routeToolCall(request.params.name, request.params.arguments || {}, context),
    );

    // Prompt handlers
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      try {
        return await handlePromptList();
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      // In degraded mode, return a helpful error for prompt requests too
      if (context.degraded) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text:
                  `SpecFlow MCP server is in degraded mode — no valid project found at: ${context.projectPath}\n` +
                  `Error: ${context.degradedReason}\n` +
                  `Fix: Add the project path to your MCP config args, e.g.: npx -y @lbruton/specflow@latest .`,
              },
            },
          ],
        };
      }

      try {
        return await handlePromptGet(request.params.name, request.params.arguments || {}, context);
      } catch (error: any) {
        throw new McpError(ErrorCode.InternalError, error.message);
      }
    });
  }

  /**
   * Check if running in Docker mode (path translation enabled)
   * When in Docker, we can't verify host PIDs and want projects to persist
   */
  private isDockerMode(): boolean {
    const hostPrefix = process.env.SPEC_WORKFLOW_HOST_PATH_PREFIX;
    const containerPrefix = process.env.SPEC_WORKFLOW_CONTAINER_PATH_PREFIX;
    return !!(hostPrefix && containerPrefix);
  }

  async stop() {
    try {
      // Only unregister when NOT in Docker mode
      // In Docker, projects should persist across sessions since we can't verify host PIDs
      if (!this.isDockerMode()) {
        try {
          // Pass current PID to only remove this specific instance
          await this.projectRegistry.unregisterProject(this.workspacePath, process.pid);
          console.error('Project instance unregistered from global registry');
        } catch (error) {
          // Ignore errors during cleanup
        }
      } else {
        console.error(
          'Docker mode: skipping project unregistration (projects persist across sessions)',
        );
      }

      // Stop MCP server
      await this.server.close();
    } catch (error) {
      console.error('Error during shutdown:', error);
      // Continue with shutdown even if there are errors
    }
  }
}
