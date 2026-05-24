---
name: promote-skill
description: Promote a battle-tested user-level skill to the specflow shipped skills directory (specflow/skills/)
---

Promote a skill from `~/.Codex/skills/<name>/` to `specflow/skills/<name>/`.

**Usage:** `/promote-skill <name>` — e.g., `/promote-skill my-workflow`

## Steps

1. **Verify source exists**
   Read `~/.Codex/skills/<name>/SKILL.md`. If it doesn't exist, stop and report.

2. **Sanitization check**
   Scan the skill content for lbruton-specific paths or personal preferences:
   - Hardcoded paths like `/Volumes/DATA/GitHub/` that should be relative or omitted
   - Personal workspace assumptions that won't work for other users
   - Any `lbruton` username references
   Report findings and ask for confirmation if anything looks personal before proceeding.

3. **Check for existing shipped copy**
   Check if `specflow/skills/<name>/SKILL.md` already exists.
   If yes, show a diff of what would change.

4. **Copy**
   ```bash
   mkdir -p /Volumes/DATA/GitHub/specflow/skills/<name>
   cp ~/.Codex/skills/<name>/SKILL.md /Volumes/DATA/GitHub/specflow/skills/<name>/SKILL.md
   ```

5. **Verify diff**
   Run `diff ~/.Codex/skills/<name>/SKILL.md /Volumes/DATA/GitHub/specflow/skills/<name>/SKILL.md`.
   Only sanitization changes should appear. If other differences exist, flag them.

6. **README check**
   Grep the README.md for the skill name. If not found, note that the skills inventory section needs updating and show the user the relevant README section to update manually.

7. **Commit and push**
   ```bash
   cd /Volumes/DATA/GitHub/specflow
   git add skills/<name>/
   git commit -m "feat(skills): promote <name> to shipped skills"
   git push origin main
   ```

Confirm completion with the commit hash.
