# specflow — Domain Glossary

Spec-driven development MCP server — the workflow engine.

Canonical vocabulary for SpecFlow. Use these terms in requirements, ACs, issue
descriptions, commit messages, and docs. Pick the listed term; avoid the synonyms.

## MCP Tools

**spec-workflow-guide**:
The MCP tool that loads the full spec workflow instructions (Requirements →
Discovery → Design → Tasks → Implementation).

**steering-guide**:
The MCP tool that loads guidance for authoring a project's steering documents.

**spec-status**:
The MCP tool reporting a spec's phase completion and task progress.

**spec-list**:
The MCP tool listing all specs in a project, with filtering and search.

**write-spec-doc**:
The MCP tool that writes a single spec phase document to disk after validating
phase gates; the caller supplies the markdown content.

**approvals**:
The MCP tool that requests, checks, and deletes human approvals through the
dashboard.

**log-implementation**:
The MCP tool that records completed-task artifacts (files, tests, endpoints,
components) into the implementation log.

## Spec Artifacts

**Spec**:
The full document set for one feature, stored in
`specs/{ISSUE-ID}-{kebab-title}/` with one phase per file.
_Avoid_: specification, spec suite.

**Requirements**:
Phase 1 — WHAT to build: user stories, acceptance criteria, and measurable
quality targets.
_Avoid_: putting design or architecture here.

**Discovery**:
Phase 2 (optional) — research: codebase analysis, prior art, competing
approaches, and open questions.

**Design**:
Phase 3 — HOW to build it: architecture, code-reuse analysis, security
considerations, and key technical decisions.

**Tasks**:
Phase 4 — a TDD checklist: file touch map, parallel dispatch plan, and numbered
implementation tasks with prompts and restrictions.

**Readiness Report**:
Phase 4.9 — a cross-document consistency check (Requirements ↔ Tasks ↔ Design)
run before implementation begins.

**Implementation Log**:
The searchable record of completed-task execution; queried by future agents to
avoid duplicating existing code.

## Steering

**Steering**:
The project-level documents (`product.md`, `tech.md`, `structure.md`) defining
vision, technology stack, and conventions that all specs must follow. Created
once per project, not per spec.

## Workflow Concepts

**Phase Gate**:
A checkpoint that blocks creating the next phase document until its
prerequisites are met. Each gate is named for the document it guards: G1
(requirements — issue-ID prefix check) → G2 (discovery — needs approved
requirements) → G3 (design — needs approved requirements, and discovery if it
exists) → G4 (tasks — needs approved design).

**Approval**:
A human sign-off on a document; creates an immutable snapshot with a status of
pending, approved, needs-revision, rejected, or concerns.

**TDD Gate**:
The STOP checkpoint requiring failing tests to exist *before* implementation
code is written.

**Closing Tasks**:
The mandatory closing block appended verbatim to every `tasks.md`: the N…N+5
verification loop followed by the N+6…N+8 shipping tasks.

**Two Parsers**:
`src/core/parser.ts` (MCP tools) and `src/dashboard/parser.ts` (dashboard) parse
the same spec files independently — parsing changes must be made to both in sync.

## Architecture & Config

**workflowRoot**:
The resolved path to a project's spec artifacts —
`DocVault/specflow/{Project}/` when DocVault is configured, otherwise
`.specflow/`. Always resolved via `PathUtils.getWorkflowRoot()`.
_Avoid_: hardcoding `.specflow/`.

**DocVault**:
The central store holding all projects' specs, steering docs, and global
templates.

**.specflow/config.json**:
The per-repo configuration file mapping a project to DocVault (`project`,
`docvault`, `issue_prefix`).

**Dashboard (singleton)**:
The single Node process serving the web UI (default `:5000`); every MCP server
registers with it via `~/.specflow-mcp/activeSession.json`.

**Templates Source of Truth**:
`src/markdown/templates/{name}.md` — the editable source for all global/bundled
templates. The DocVault runtime cache and `dist/` copies are overwritten on MCP
boot. The exception is project-specific override files in
`{workflowRoot}/templates/`, which are editable and not clobbered.

## Relationships

- A **Spec** contains Requirements, Design, and Tasks, and optionally Discovery
  and a Readiness Report — one **Phase Gate** between each.
- Each phase document passes through an **Approval** before the next phase opens.
- **Steering** is read by Discovery and Design to keep a spec aligned with
  project conventions.
- Every **MCP Tool** resolves spec paths through **workflowRoot**, never a
  hardcoded path.

## Flagged Ambiguities

- "spec" — refers to the entire feature folder and all its phase files, not a
  single requirements document. Use **Requirements** for the Phase 1 doc.
- "workflow root" vs "workspace path" — **workflowRoot** is where spec artifacts
  live (DocVault); the workspace path is the git worktree root. In monorepos
  they differ.
