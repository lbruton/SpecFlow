#!/usr/bin/env python3
"""Post-edit test hook — runs vitest on the matching test file after edits to src/core/, src/tools/, or src/prompts/."""

import json
import os
import subprocess
import sys

PROJECT_DIR = "/Volumes/DATA/GitHub/specflow"
COVERED_DIRS = ("src/core/", "src/tools/", "src/prompts/")
VITEST_TIMEOUT = 60
VITEST_MAX_LINES = 25


def main():
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, EOFError):
        return

    tool_name = data.get("tool_name", "")
    if tool_name not in ("Edit", "Write"):
        return

    file_path = data.get("tool_input", {}).get("file_path", "")
    if not file_path or not file_path.endswith(".ts"):
        return

    rel = os.path.relpath(file_path, PROJECT_DIR)
    if not any(rel.startswith(d) for d in COVERED_DIRS):
        return

    # Skip test files themselves — they trigger their own run via vitest watch
    if ".test." in os.path.basename(file_path):
        return

    stem = os.path.splitext(os.path.basename(file_path))[0]

    try:
        result = subprocess.run(
            ["npx", "vitest", "run", "--reporter=verbose", stem],
            cwd=PROJECT_DIR,
            capture_output=True,
            text=True,
            timeout=VITEST_TIMEOUT,
        )
        if result.returncode != 0:
            lines = (result.stdout + result.stderr).strip().splitlines()
            print(f"[test] FAILED — {stem}")
            for line in lines[:VITEST_MAX_LINES]:
                print(f"[test] {line}")
            if len(lines) > VITEST_MAX_LINES:
                print(f"[test] ... ({len(lines) - VITEST_MAX_LINES} more lines)")
        else:
            # Only print on pass if tests actually ran (not "no tests found")
            output = result.stdout + result.stderr
            if "passed" in output:
                passed_lines = [l for l in output.splitlines() if "passed" in l or "Tests" in l]
                for line in passed_lines[:3]:
                    print(f"[test] {line.strip()}")
    except subprocess.TimeoutExpired:
        print(f"[test] vitest timed out after {VITEST_TIMEOUT}s for {stem}")
    except FileNotFoundError:
        pass


if __name__ == "__main__":
    main()
