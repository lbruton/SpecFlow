---
tags: [readiness, spec]
created: {{YYYY-MM-DD}}
updated: {{YYYY-MM-DD}}
---

# Implementation Readiness Report — {{ISSUE-ID}}

## References

- **Issue:** {{ISSUE-ID}}
- **Spec Path:** `specs/{{spec-name}}/`
- **Generated:** {{YYYY-MM-DD}}

---

## Cross-Validation Summary

**Status:** [PASS | CONCERNS | FAIL] — [one-line rationale]

[2-3 sentence summary of the cross-validation. State the scope of the spec and whether coverage is complete, partial, or has gaps.]

> **Verdict propagation:** any section FAIL blocks both the Cross-Validation Summary Status and the Agent Recommendation from being PASS.

---

## Requirements → Tasks Traceability

| Requirement | Acceptance Criteria Coverage | Tasks | Test Tasks | Coverage |
|-------------|------------------------------|-------|------------|----------|
| REQ-1 [title] | [list ACs covered] | [task numbers] | [test task numbers per AC, or `N/A`] | [Complete / Partial / Missing] |
| REQ-2 [title] | [list ACs covered] | [task numbers] | [test task numbers per AC, or `N/A`] | [Complete / Partial / Missing] |

### Manual verification notes

- [For each requirement, explain HOW the tasks cover the ACs — not just that they do]
- [Call out any indirect coverage (e.g., "Task 3 covers AC5 because the restriction forbids changing the key")]

**Verdict:** [PASS | CONCERNS | FAIL] — [All requirements covered / N orphaned requirements found]

---

## Design → Tasks Alignment

| Design Decision | Task Reference | Status |
|-----------------|----------------|--------|
| [Decision from design.md] | [Task N] | [Covered / Missing] |
| [Decision from design.md] | [Task N] | [Covered / Missing] |

### Manual verification notes

- [Explain how the task structure preserves the design's constraints]
- [Note any "do not touch" boundaries from design that are enforced via task restrictions]

**Verdict:** [PASS | CONCERNS | FAIL] — [No missing design elements / N design elements lack implementing tasks]

---

## Contradictions

[None found | List contradictions between requirements, design, and tasks]

### Manual verification notes

- [For each potential contradiction area, explain why the documents are consistent]
- [If contradictions exist, cite the specific conflicting statements with document:section references]

**Verdict:** [PASS | CONCERNS | FAIL] — [Documents are consistent / N contradictions found requiring resolution]

---

## Prototype Consistency

[N/A — no prototype required | Verified — prototype artifacts present in tasks | MISSING — prototype required but not in task leverage]

[If applicable, verify that design.md `Prototype Required` field matches the presence/absence of Phase 3.5 tasks (0.1-0.3) and that artifact paths appear in relevant task `_Leverage` fields.]

**Verdict:** [PASS | CONCERNS | FAIL] — [use the descriptive note above as the rationale: N/A counts as PASS; prototype required but missing ⇒ FAIL]

---

## File Touch Map Validation

| File or Area Mentioned in Tasks | In File Touch Map? | Status |
|---------------------------------|--------------------|--------|
| [file path from task N] | [Yes / No] | [Accurate / Missing] |
| [file path from task N] | [Yes / No] | [Accurate / Missing] |

### Manual verification notes

- [Confirm the blast radius is accurately represented]
- [Note any closing-task artifacts (verification.md, etc.) that are acceptably absent from the map]
- [Flag any hidden file changes implied by task prompts but not in the map]

**Verdict:** [PASS | CONCERNS | FAIL] — [File Touch Map is accurate / N files missing from map]

---

## Test Design Coverage

> **Per-AC test mapping lives above.** This section does NOT re-map ACs to tests. For the per-AC `Test Tasks` mapping, read the `Test Tasks` column in the **Requirements → Tasks Traceability** table above. This section only audits the TDD *sequence* and the verdict conditions.

The TDD structure is a numbering-agnostic **structural pattern: baseline → red → implementation**. Match the *sequence*, not literal task numbers — a spec may use `0.4`/`0.5`, `C1`/`C2`, or human-chosen numbering. The pattern requires a baseline task, then a red (failing-tests) task, both sequenced *before* any implementation task.

| Structural Step | Task Reference | Status |
|-----------------|----------------|--------|
| Baseline — establish passing test state before changes | [task #] | [Covered / Missing] |
| Red — write failing tests for new behavior (TDD) | [task #] | [Covered / Missing] |
| Implementation — make the red tests green | [task #] | [Covered / Missing] |
| Green — full test suite passes after implementation | [task #] | [Covered / Missing] |
| Requirement-to-code verification with evidence | [task #] | [Covered / Missing] |

### Manual verification notes

- [Confirm the baseline → red → implementation sequence is correctly ordered: baseline, then failing tests, then implementation, then green suite]
- [Confirm each AC's `Test Tasks` entry in the Traceability table is real — not assumed]
- [Note any additional verification layers beyond automated tests]

### If a requirement has no planned test (N/A escape hatch)

Per-AC, an absent test task is only acceptable when explicitly justified. Fill BOTH sub-fields:

- **Justification for N/A:** [why this AC has no automated test — e.g. pure-content/template change with no executable behavior]
- **Manual Validation Notes:** [exactly how the AC was or will be validated by hand, and by whom]

**Verdict:** [PASS | CONCERNS | FAIL] — apply these conditions:

- **FAIL** — any AC has no planned test task AND no justified N/A (missing test, not justified).
- **CONCERNS** — test coverage is partial, or the baseline → red → implementation sequence is mis-ordered.
- **PASS** — every AC maps to a test task or a justified N/A, and the sequence is correctly ordered.

---

## Release Hygiene

| Hygiene Item | Coverage | Status |
|--------------|----------|--------|
| Version lock / worktree gate | [VERSION CHECKOUT GATE in tasks.md / N/A — no version lock] | [Covered / Missing / N/A] |
| Version bump | [task or workflow that handles it] | [Covered / Missing / N/A] |
| Changelog update | [task or workflow that handles it] | [Covered / Missing / N/A] |
| DocVault update | [task reference] | [Covered / Missing] |

### Manual verification notes

- [Explain how the project's release workflow covers version/changelog if not explicit tasks]
- [Confirm DocVault update is in a closing task, not just assumed]

**Verdict:** [PASS | CONCERNS | FAIL] — [Release hygiene accounted for / N gaps found]

---

## Agent Recommendation

### Recommendation: [PASS | CONCERNS | FAIL]

> **Verdict propagation:** any section FAIL blocks both the Cross-Validation Summary Status and the Agent Recommendation from being PASS.

[2-3 sentences on why this recommendation.]

### Why this is [ready / has concerns / not ready]

- [Bullet points supporting the recommendation]
- [Reference specific findings from sections above]

### Residual risk

- [Low/Medium/High]: [describe the main implementation hazard and how tasks mitigate it]

### Next step if approved

[If PASS: proceed to Phase 4 with execution-choice menu.]
[If CONCERNS: proceed to Phase 4 but log concerns in tasks.md.]
[If FAIL: list specific documents to fix and re-run readiness gate.]
