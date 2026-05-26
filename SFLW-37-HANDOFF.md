# SFLW-37 Codacy Quality Hygiene — Sonnet Handoff

## Context

This handoff covers the remaining Codacy warning-level quality issues after Opus
fixed the 6 `src/` ESLint findings (4× prefer-nullish-coalescing, 2× require-await).

Total remaining: ~320 warnings. None are security issues. All are code style,
complexity, and best-practice items.

## Scope for this session

Focus on **vscode-extension/** ESLint fixes only — these are mechanical and safe.
Do NOT touch Lizard complexity/length findings (those require design judgment).
Do NOT touch markdownlint/Agentlinter findings (low value, docs-only).

## Build/Test

```bash
npm run build   # must pass
npm test         # 284 pass, 1 pre-existing flake (docs-index-html.test.ts)
```

## Worktree workflow

Work in a worktree branching from `main`. Commit, push, PR. See CLAUDE.md for
full PR gate requirements (Codacy, CodeRabbit, CodeQL, Copilot review, signed
commits, linear history).

## ESLint Findings in vscode-extension/ (~90 issues)

### prefer-nullish-coalescing (27 instances)
Replace `||` with `??` where the left operand could be `""` or `0` (falsy but valid).

**Files:**
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~8 instances
- `vscode-extension/src/extension/providers/SidebarProvider.ts` — ~6 instances
- `vscode-extension/src/webview/App.tsx` — ~5 instances
- `vscode-extension/src/extension/services/ImplementationLogService.ts` — ~3 instances
- `vscode-extension/src/extension/services/ApprovalEditorService.ts` — ~2 instances
- `vscode-extension/src/extension/services/CommentModalService.ts` — ~2 instances
- `vscode-extension/src/webview/pages/LogsPage.tsx` — ~1 instance

### no-confusing-void-expression (20 instances)
Arrow functions returning void expressions need braces: `() => { doSomething(); }`
instead of `() => doSomething()` when the called function returns void.

**Files:**
- `vscode-extension/src/webview/App.tsx` — ~8 instances
- `vscode-extension/src/extension/providers/SidebarProvider.ts` — ~5 instances
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~4 instances
- `vscode-extension/src/webview/pages/LogsPage.tsx` — ~3 instances

### no-redundant-type-constituents (15 instances)
`any` in union/intersection types makes other types redundant.
Usually means `| any` should be removed or the type narrowed.

**Files:**
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~5 instances
- `vscode-extension/src/webview/App.tsx` — ~3 instances
- `vscode-extension/src/extension/providers/SidebarProvider.ts` — ~3 instances
- `vscode-extension/src/webview/components/LogEntryCard.tsx` — ~2 instances
- `vscode-extension/src/extension/services/ImplementationLogService.ts` — ~2 instances

### no-unused-vars (14 + 5 = 19 instances)
Both ESLint and @typescript-eslint variants. Remove unused imports/variables,
or prefix with `_` if the parameter is required by an interface.

**Files:**
- `vscode-extension/src/webview/App.tsx` — ~4 instances
- `vscode-extension/src/extension/providers/SidebarProvider.ts` — ~4 instances
- `vscode-extension/src/webview/components/ui/dropdown-menu.tsx` — ~3 instances
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~3 instances
- `vscode-extension/src/extension/services/ApprovalEditorService.ts` — ~2 instances
- `vscode-extension/src/webview/components/LogEntryCard.tsx` — ~2 instances
- `vscode-extension/src/webview/components/CommentModal.tsx` — ~1 instance

### prefer-optional-chain (7 instances)
Replace `foo && foo.bar` with `foo?.bar`.

**Files:**
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~3 instances
- `vscode-extension/src/extension/providers/SidebarProvider.ts` — ~2 instances
- `vscode-extension/src/webview/App.tsx` — ~2 instances

### require-await (6 instances)
Async functions with no `await`. Either add `await` or remove `async`.

**Files:**
- `vscode-extension/src/extension/services/SpecWorkflowService.ts` — ~3 instances
- `vscode-extension/src/extension/services/ImplementationLogService.ts` — ~2 instances
- `vscode-extension/src/extension/utils/taskParser.ts` — ~1 instance

### Other (2 instances)
- `no-empty-interface` (1) — empty interface, convert to type alias
- `use-unknown-in-catch-callback-variable` (1) — catch param should be `: unknown`

## NOT in scope (leave for future sessions)

- **Lizard complexity/length** (~55 findings in `src/`): functions too long or too
  complex. Requires design judgment to refactor — not mechanical.
- **markdownlint MD024** (~54 findings): duplicate headings in docs/ and CHANGELOG.md.
  Low value, mostly in upstream docs.
- **Agentlinter skill metadata**: missing author fields in skill frontmatter.
  Track separately.

## Verification

After fixes, run:
```bash
npm run build && npm test
```

Codacy will re-scan after merge. Use `codacy_list_repository_issues` with
`languages: ["TypeScript"]` and filter on `vscode-extension/` to verify reduction.
