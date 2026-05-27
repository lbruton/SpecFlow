# SpecFlow

MCP server plugin for spec-driven development with a real-time web dashboard. Loaded by every project: StakTrakr, HexTrackr, Forge, MyMelo, WhoseOnFirst, Playground, claude-context, HomeNetwork, Portfolio, obsidian-mcp, TRMCompare.

## Quick Reference

| Field | Value |
|-------|-------|
| Package | `@lbruton/specflow` |
| Version | `3.7.2` |
| Origin | [lbruton/SpecFlow](https://github.com/lbruton/SpecFlow) - standalone (detached from upstream [Pimzino/spec-workflow-mcp](https://github.com/Pimzino/spec-workflow-mcp) on 2026-05-25) |
| Branch | `main` - signed commits + PR + status checks. Origin is **SSH** (`git@github.com:lbruton/SpecFlow.git`) - push via SSH since the OAuth token lacks `workflow` scope |
| Skills/commands ship | `skills/` and `commands/` - users copy to their harness skill/command dirs |
| Shared skill source | Project/user authored skills should be mirrored through `.agents/skills/` or `~/.agents/skills/` |
| MCP install (npm) | `npx -y @lbruton/specflow@latest .` in the client MCP config |
| Dashboard | Singleton Node process, default `:5000` (lbruton uses `:5051`). State: `~/.specflow-mcp/activeSession.json` |
| Issue prefix | `SFLW` - Plane workspace `https://plane.lbruton.cc/lbruton/projects/72fd0b33-6719-47fa-92a5-97e9ba511f32/` |
| Epic state | `bbc54749-2ec3-4f52-989e-5fff590b3efd` - use only for parent Epic issues; child issues use normal states (Todo -> In Progress -> In Review -> Done) |

## DocVault

Project docs: `/Volumes/DATA/GitHub/DocVault/Projects/SpecFlow/`. Start at `Overview.md`; there is currently no `_Index.md` in this folder. Run `/vault-update` after behavior-affecting changes. Key wikilinks: [[SpecFlow/Architecture]] - [[SpecFlow/Publish Pipeline]] - [[SpecFlow/Tools & Prompts]] - [[SpecFlow/Dashboard]].

## Distribution Model

Two independent channels (full diagram: [[SpecFlow/Architecture]] section Deployment Architecture):

- **npm `@lbruton/specflow`** - MCP server + dashboard. Built from `src/` to `dist/` and published.
- **GitHub repo direct** - skills + commands ship as raw markdown from top-level `skills/` and `commands/`. Users copy them into their harness-specific skill and command directories.

Installing one does not install the other. README must say both.

Hard rules:

- Orphan dirs from pre-v3.6.0 (`plugin/`, `.claude-plugin/`, `.Codex-plugin/`, legacy plugin marketplace dirs) - delete on sight, never edit.
- Shared authored skills live in `.agents/skills/` for project-local copies and `~/.agents/skills/` for user-level copies. Claude/Codex/OpenCode/Gemini-specific folders are runtime install targets, not the shared source of truth.
- User-level shared skill (`~/.agents/skills/<name>/SKILL.md`) and repo shipped copy (`skills/<name>/SKILL.md`) are intentionally separate files. Promote via `cp`, not symlinks.

## Project Agent Mirror

Project-local Claude assets that should be visible to Codex and other compatible agents must be mirrored under `.agents/`:

- `.claude/skills/<name>/SKILL.md` -> `.agents/skills/<name>/SKILL.md` with harness-specific paths adapted.
- `.claude/agents/<name>.md` -> `.agents/agents/<name>.md` when the instructions are generally useful outside Claude.
- `.claude/commands/` has no current project-local commands. If commands are added later, mirror compatible versions under `.agents/commands/`.

Do not mirror `.claude/settings*.json`, scheduled task locks, or hooks into `.agents/` unless a future tool explicitly loads them from there.

## DocVault SpecFlow Layout

All specflow artifacts live in DocVault. Local projects keep only `.specflow/config.json`. MCP resolves paths via `PathUtils.getWorkflowRoot()`.

```text
DocVault/specflow/
  templates/                  # global, bundled (overwritten on MCP boot)
  {Project}/
    steering/                 # product.md, tech.md, structure.md
    templates/                # project overrides ONLY - never copies of globals
    specs/                    # requirements, design, tasks, logs
    approvals/
    archive/specs/
```

Project config example: `{ "project": "StakTrakr", "docvault": "../DocVault", "issue_prefix": "STRK" }`.

Key modules: `config-loader.ts`, `migration.ts`, `index-updater.ts`.

## Source Structure

```text
src/
  tools/           # MCP tool definitions
    index.ts       # Tool registry - registerTools() + handleToolCall()
  prompts/         # MCP prompt definitions
    index.ts       # Prompt registry
  core/            # parser, task-parser, path-utils, convention-detector, template-generator, mdx-validator
  dashboard/       # dashboard backend
  dashboard_frontend/  # React 18 frontend (Vite + Tailwind)
  markdown/        # document templates (source of truth)
  types.ts
  server.ts
  index.ts
skills/            # repo-distributed skills
commands/          # repo-distributed commands
.agents/           # project-local shared agent assets mirrored from .claude where useful
```

## Templates - Source of Truth

`src/markdown/templates/{name}.md` is the only editable template source.

- `dist/markdown/templates/` - build output (npm).
- `DocVault/specflow/{project}/templates/` - runtime cache. Global filenames are clobbered on MCP boot. Override-only filenames are editable; StakTrakr is the only project with legitimate overrides today.
- `DocVault/Projects/SpecFlow/Templates/{name}-guide.md` - KB snapshot, auto-regenerated by `/publish-templates`. Hand-edits get overwritten.

Ship a template change with `/publish-templates`. Inspect a template by reading `src/markdown/templates/{name}.md` directly.

## Two Parsers

`src/core/parser.ts` (MCP tools) and `src/dashboard/parser.ts` (dashboard) parse the same files independently. Any parsing change must update both - grep the other parser for the same function names. Detail: [[SpecFlow/Architecture]] section Two Parsers Problem.

## Build / Test

```bash
npm run build            # validate:i18n -> clean -> tsc -> build:dashboard (Vite)
npm test                 # vitest unit (src/**/__tests__)
npm run test:e2e         # Playwright E2E
npm run test:e2e:worktree
npm run validate:mdx     # MDX template validator
npm run format           # prettier --write .
```

MCP picks up rebuilt `dist/` on next `/mcp` reconnect. Dashboard is long-running; kill the PID in `~/.specflow-mcp/activeSession.json` and relaunch `specflow --dashboard` to serve rebuilt UI assets.

## Local Dev Mode (SFLW-12)

For iterative MCP work, switch clients from npm to the local build. Edit-to-test drops from about 5 minutes (publish round-trip) to about 15 seconds.

| Client | Config | Local command |
|--------|--------|---------------|
| Codex CLI | `~/.codex/config.toml` / client MCP config | `node /Volumes/DATA/GitHub/specflow/dist/index.js .` |
| Codex Desktop | Codex Desktop MCP config | `node /Volumes/DATA/GitHub/specflow/dist/index.js .` |
| Claude Code | `~/.claude.json` -> `mcpServers.specflow` | `node /Volumes/DATA/GitHub/specflow/dist/index.js .` |
| Claude Desktop | `~/Library/Application Support/Claude/claude_desktop_config.json` -> `mcpServers.specflow` | `node /Volumes/DATA/GitHub/specflow/dist/index.js .` |
| OpenCode | `~/.config/opencode/opencode.json` -> `mcp.specflow` | `node /Volumes/DATA/GitHub/specflow/dist/index.js` (no trailing `.`) |

Dev loop: edit -> `npm run build` -> MCP reconnect (or restart Desktop/OpenCode) -> test. Switch back: restore `command: npx`, `args: ["-y", "@lbruton/specflow@latest", "."]`. Timestamped `.bak.<YYYYMMDD_HHMMSS>` backups are written before any switch.

## Post-Change Gate - MANDATORY

After any source edit:

1. `npm run build` - verify compile. In local-dev mode, building in `main` is expected. Shipping via PR: build in the worktree, not main; `rimraf` wipes `dist/` before `tsc`, and a failed build in main corrupts the live MCP.
2. `git status --short` - verify changes.
3. Worktree branch -> commit -> PR.
4. Merge after status checks pass.

Commit source promptly. `dist/` is gitignored; building without committing means the next `git pull` silently reverts your work.

## Publishing

Template-only changes -> `/publish-templates` (automates pipeline, stops before `npm publish` for passkey).

Code/MCP/dashboard changes:

1. Edit `package.json` version.
2. Run `npm run build`.
3. Run `npm test`.
4. Stage and commit: `git add package.json package-lock.json && commit && push` (worktree + PR).
5. Run `npm publish --access public` — PASSKEY required, manual user step, agents cannot run this.
6. Clear npx cache: `find ~/.npm/_npx -path "*/specflow/package.json" -exec dirname {} \; | xargs rm -rf`
7. Verify: `npm view @lbruton/specflow version`

Hand off step 5 to the user; wait for confirmation before step 6. Rationale: mem0 `feedback_npm_publish_passkey.md`.

## Post-Publish Verification

1. `npm view @lbruton/specflow version` matches the new version.
2. Clear npx cache if stale.
3. MCP reconnect to load the new version.
4. Run a test spec or `spec-status` to confirm tools work with DocVault paths.

## Promoting a Skill (shared -> shipped)

After battle-testing at `~/.agents/skills/<name>/SKILL.md`:

1. **Sanitize** - strip lbruton paths, personal preferences, and workspace assumptions. Must work for any user/project.
2. **Copy** - `cp ~/.agents/skills/<name>/SKILL.md skills/<name>/SKILL.md` (mkdir if new).
3. **Verify** - `diff` should show only sanitization changes.
4. **PR** - worktree -> commit -> push -> PR. Same flow as source.
5. **README** - update inventory in the same PR if the skill is new.

Same flow for `commands/`. No build, no npm.

Reverse-sync after a PR sanitizes the shipped copy and makes it cleaner than the shared user-level version:

1. `cp skills/<name>/SKILL.md ~/.agents/skills/<name>/SKILL.md`
2. Re-personalize any `{owner}` -> `lbruton` placeholders.
3. `diff` - only re-personalization changes should appear.

Test at shared user level first before editing shipped copy directly.

## Adding a New Tool

1. Create `src/tools/my-tool.ts` - export a `Tool` object + handler function.
2. Register in `src/tools/index.ts` - add to `registerTools()` array + `handleToolCall()` switch.
3. `npm run build`.

## Adding a New Prompt

1. Create `src/prompts/my-prompt.ts` - export a `PromptDefinition`.
2. Register in `src/prompts/index.ts`.
3. `npm run build`.

## DocVault Index Rule

Every DocVault folder needs `_Index.md`. Creating/deleting/moving files: update folder + parent `_Index.md` in the same commit. Run `/vault-reconcile` to detect drift. Moving an issue to `Closed/`: update both source and `Closed/_Index.md` atomically; partial updates create ghost entries.

## Quality Gates (OPS-143)

These gates fire automatically on Edit/Write/commit:

| Gate | What it does |
|------|-------------|
| prettier + lint-staged | Formats `.{ts,tsx,js,cjs,mjs,json,css,html}` on commit. Expect reformatting on top of your changes. |
| i18n validation | `npm run validate:i18n` — step 1 of every build. Blocks on missing, extra, or malformed keys. |
| MDX validation | `npm run validate:mdx` — use `PathUtils.getWorkflowRoot()` everywhere, never hardcode `.specflow/`. |
| Protect Main ruleset | Requires Codacy, CodeRabbit, CodeQL, copilot_code_review, signed commits, linear history. Merge via squash or rebase only. |

**Protect Main detail — Copilot re-request required after every push:**

`copilot_code_review` does not auto-trigger on push (`review_on_push:false`). After each push run:

```bash
gh api -X POST repos/lbruton/SpecFlow/pulls/{n}/requested_reviewers \
  -f 'reviewers[]=copilot-pull-request-reviewer[bot]'
```

Without this the PR will be BLOCKED. Pre-existing CodeQL alerts may appear as "new" when line numbers shift — these are not new findings.

**OAuth scope:** HTTPS pushes to `.github/workflows/` fail (missing `workflow` scope). Use SSH remote (`git@github.com:lbruton/SpecFlow.git`) for all pushes.

## Hooks

| Hook | Purpose |
|------|---------|
| gitleaks (pre-commit) | Scans staged files for leaked secrets: GitHub PATs, AWS access keys, Stripe keys, Slack tokens, private keys, and high-entropy strings. Configured via `pre-commit` framework (OPS-116, added 2026-04-14). |
| husky v9 | Sets `core.hooksPath=.husky`, taking over from `.git/hooks/`. The husky `pre-commit` script must call `pre-commit run` to chain gitleaks — omitting this silently disables secret scanning. |

## Gotchas

**mem0 API schema (issue SWF-90):** The mem0 cloud v1 API returns null for the top-level `agent_id` field. Store project identity in `metadata.project` instead.

- Fetch all records without filters.
- Filter client-side on `metadata.project`, case-insensitive.
- Legacy records alternate between `SpecFlow` and `specflow`.
- Do not use `filters: {AND: [{agent_id: <tag>}]}` — it returns nothing.
- Reference implementation: `~/.claude/hooks/mem0-session-start.py` lines 83-140.

**Squash-merge cleanup:** After a squash-merge, `git branch -d <branch>` refuses with "not fully merged".

- This happens because the squash commit hash differs from the branch tip.
- Confirm the merge by checking for `[gone]` status in `git branch -v`.
- Force-delete the local branch with `git branch -D <branch>`.

**Prompt path references:** All MCP prompts in `src/prompts/` embed filesystem paths. Always use `PathUtils.getWorkflowRoot()` — hardcoded `.specflow/` paths break when DocVault layout changes. When modifying path resolution, audit all five prompts: `create-spec`, `implement-task`, `spec-status`, `create-steering-doc`, `inject-steering-guide`.
