<p align="center">
  <img src="assets/logo-wide.svg" alt="SpecFlow" height="48">
</p>

<p align="center">
  An MCP server plugin for spec-driven development with a real-time approval dashboard.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@lbruton/specflow"><img src="https://img.shields.io/npm/v/@lbruton/specflow" alt="npm version"></a>
  <a href="https://github.com/lbruton/specflow"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="License"></a>
  <img src="https://img.shields.io/badge/MCP_Server-Plugin-6366f1" alt="MCP Server Plugin">
</p>

<p align="center">
  <a href="https://lbruton.github.io/specflow/"><strong>About</strong></a> &bull;
  <a href="docs/USER-GUIDE.md">User Guide</a> &bull;
  <a href="docs/WORKFLOW.md">Workflow</a> &bull;
  <a href="CHANGELOG.md">Changelog</a>
</p>

> **Work in progress.** SpecFlow is in active development and used daily by the author across multiple projects, but the API surface, skill interfaces, and documentation are still evolving. Expect rough edges. Issues and feedback welcome.

---

SpecFlow gives AI coding agents a structured development lifecycle. Instead of jumping straight to code, features go through Requirements → Design → Tasks → Implementation, with human approval gates at each transition. A real-time web dashboard lets you review, approve, or reject at every phase.

Built on [Pimzino/spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp)'s core engine (sequential spec workflow, real-time dashboard, blocking approval gates). This project extends the lifecycle with additional phases, multi-project support, and a shipped skill system.

## What You Get

**The npm package** (`@lbruton/specflow`) ships:

- 7 MCP tools and 7 MCP prompts for spec lifecycle management
- A real-time web dashboard for approvals and progress tracking
- 11 spec templates (requirements, discovery, design, tasks, readiness report, steering docs, review prompts)
- Multi-project support via project config files

**The GitHub repo** additionally ships:

- 13 lifecycle skills (`/spec`, `/start`, `/prime`, `/wrap`, `/retro`, `/audit`, `/discover`, `/chat`, `/issue`, `/pr-cleanup`, `/codacy-resolve`, `/publish-templates`, `/migrate-skill`)
- 11 slash commands and background subagent definitions
- Agent-specific instruction files (CLAUDE.md, GEMINI.md, CODEX.md)

These are plain markdown files, installed by copying — not bundled in npm.

## Quick Start

### Install the MCP server

Add to your agent's MCP config (Claude Code example — `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "specflow": {
      "command": "npx",
      "args": ["-y", "@lbruton/specflow@latest", "."]
    }
  }
}
```

Works with any MCP-compatible agent. Verified with Claude Code, Gemini CLI, Codex CLI, and OpenCode.

### Install skills and commands (optional, recommended for Claude Code)

```bash
git clone https://github.com/lbruton/specflow.git ~/specflow-source
cp -r ~/specflow-source/skills/* ~/.claude/skills/
cp -r ~/specflow-source/commands/* ~/.claude/commands/
cp -r ~/specflow-source/agents/* ~/.claude/agents/
```

### Start the dashboard

```bash
npx @lbruton/specflow@latest --dashboard --port 5051
```

## Spec Workflow

Every non-trivial feature follows the same path. Approval required at each gate.

```
[Discovery]  →  Requirements  →  Design  →  Tasks  →  Implementation
  optional          ↑              ↑          ↑            ↑
                 approval       approval   approval    log artifacts
```

An optional Discovery phase (`/discover`) supports structured research before committing to a spec. Specs live on disk as structured markdown — not in any agent's memory. This means you can start a spec in one agent and continue in another. The dashboard tracks progress regardless of which agent is driving.

## MCP Tools

| Tool                  | Description                       |
| --------------------- | --------------------------------- |
| `spec-status`         | Get detailed status of a spec     |
| `spec-list`           | List all specs across projects    |
| `approvals`           | Manage phase approval workflow    |
| `log-implementation`  | Record implementation artifacts   |
| `write-spec-doc`      | Create or update spec documents   |
| `spec-workflow-guide` | Get workflow guidance             |
| `steering-guide`      | Access project steering documents |

## MCP Prompts

| Prompt                       | Description                                     |
| ---------------------------- | ----------------------------------------------- |
| `create-spec`                | Create a new spec from requirements             |
| `create-steering-doc`        | Create project steering documentation           |
| `implement-task`             | Generate implementation plan for a task         |
| `refresh-tasks`              | Re-sync task state from spec files              |
| `spec-status`                | Phase and completion summary for a spec         |
| `inject-spec-workflow-guide` | Inject the spec workflow guide into the session |
| `inject-steering-guide`      | Inject the steering doc guide into the session  |

## Shipped Skills

These are markdown skill definitions installed by copying from the repo, not MCP tools.

| Skill                  | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `/spec`                | Full spec lifecycle orchestrator                  |
| `/discover`            | Structured research before committing to a spec   |
| `/chat`                | Exploratory conversation with context             |
| `/start`               | Quick session resume (~15s)                       |
| `/prime`               | Full session boot with health checks              |
| `/wrap`                | End-of-session cleanup and summary                |
| `/retro`               | Extract prescriptive lessons from the session     |
| `/audit`               | On-demand project health check                    |
| `/issue`               | Create and manage project issues                  |
| `/pr-cleanup`          | Post-merge branch and worktree cleanup            |
| `/codacy-resolve`      | Triage and resolve Codacy dashboard findings      |
| `/publish-templates`   | Promote a template into the plugin                |
| `/migrate-skill`       | Port a user-level skill into the plugin           |

## Knowledge Structure

Spec documents, steering docs, and templates are stored as structured markdown in an Obsidian-compatible layout. If you use [Obsidian](https://obsidian.md), you get graph visualization and wikilink navigation for free. If not, it's still just a folder of markdown files.

```
your-vault/specflow/
  templates/                  # global spec templates (auto-populated)
  {Project}/
    steering/                 # product.md, tech.md, structure.md
    specs/                    # requirements, design, tasks, logs
    approvals/
```

Each project needs a thin config file (`.specflow/config.json`) pointing to the vault:

```json
{ "project": "MyProject", "docvault": "../my-vault" }
```

## Multi-Agent Support

SpecFlow is an MCP server — any agent that speaks MCP can use it. Spec state lives on disk, so you can start a spec in one agent and continue in another.

| Agent           | Status   | Notes                          |
| --------------- | -------- | ------------------------------ |
| **Claude Code** | Verified | Full MCP + skills support      |
| **Gemini CLI**  | Verified | MCP tools, uses GEMINI.md      |
| **Codex CLI**   | Verified | MCP tools, uses CODEX.md       |
| **OpenCode**    | Verified | MCP tools                      |

## Extending the Stack

SpecFlow handles the spec lifecycle — it doesn't try to be a memory system, code search engine, or knowledge base. Those are separate concerns best served by separate tools. The author's personal stack includes:

- **[SessionFlow](https://github.com/lbruton/SessionFlow)** — session history indexing and recall
- **[claude-context](https://github.com/lbruton/claude-context)** — semantic code search via Milvus (hardened fork of [zilliztech/claude-context](https://github.com/zilliztech/claude-context))
- **[mem0](https://mem0.ai)** — cross-session episodic memory
- **[Obsidian](https://obsidian.md)** — knowledge base (DocVault)
- **[Code Graph Context](https://github.com/nicholasgriffintn/code-graph-context)** — structural code analysis via Neo4j

None of these are required to use SpecFlow. The MCP server and dashboard work standalone with just Node.js.

## Prerequisites

- **Node.js** (18+) — required
- **An MCP-compatible agent** — Claude Code, Gemini CLI, Codex CLI, or similar

## Development

```bash
npm install
npm run build        # TypeScript + Vite dashboard
npm test             # vitest unit tests
npm run test:e2e     # Playwright E2E
npm run dev          # Development mode with hot reload
```

## Credits

**[Pimzino/spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp)** — the foundation. Pimzino designed and built the core: MCP server, sequential spec workflow, real-time dashboard with blocking approval gates, approval storage, markdown parser, implementation logging, template engine, multi-language support, VSCode extension, Docker deployment, and security hardening.

**[zilliztech/claude-context](https://github.com/zilliztech/claude-context)** — upstream for the semantic code search fork.

**[mwgreen/claude-code-session-rag](https://github.com/mwgreen/claude-code-session-rag)** — upstream for SessionFlow.

## License

GPL-3.0 — same as upstream.
