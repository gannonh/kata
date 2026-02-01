#!/usr/bin/env python3
"""Update GitHub issue body with plan checklist.

Usage:
    update-issue-plans.py <issue_number> <checklist_file>

The checklist file should contain markdown checkbox items, one per line:
    - [ ] Plan 01: Description
    - [ ] Plan 02: Description

The script:
1. Reads current issue body via gh CLI
2. Finds the ## Plans section
3. Replaces placeholder text with the checklist
4. Updates the issue via gh CLI
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path


def run_gh(args: list[str]) -> str:
    """Run gh CLI command and return output."""
    result = subprocess.run(
        ["gh"] + args,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gh command failed: {result.stderr}")
    return result.stdout.strip()


def get_issue_body(issue_number: str) -> str:
    """Get current issue body."""
    return run_gh(["issue", "view", issue_number, "--json", "body", "--jq", ".body"])


def update_issue_body(issue_number: str, body: str) -> None:
    """Update issue with new body."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
        f.write(body)
        temp_path = f.name

    try:
        run_gh(["issue", "edit", issue_number, "--body-file", temp_path])
    finally:
        Path(temp_path).unlink(missing_ok=True)


def insert_checklist(body: str, checklist: str) -> str:
    """Insert checklist into ## Plans section, replacing placeholder."""
    # Pattern matches: ## Plans section with optional comment and placeholder
    pattern = r"(## Plans\n\n(?:<!-- [^>]*-->\n)?)_Plans will be added[^\n]*\n?"

    # Check if pattern exists
    if re.search(pattern, body):
        # Replace placeholder with checklist
        return re.sub(pattern, rf"\1{checklist}\n", body)

    # If no ## Plans section, append it
    if "## Plans" not in body:
        return f"{body}\n\n## Plans\n\n{checklist}\n"

    # ## Plans exists but no placeholder - append checklist after section header
    pattern_append = r"(## Plans\n\n)"
    return re.sub(pattern_append, rf"\1{checklist}\n\n", body)


def main() -> int:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <issue_number> <checklist_file>", file=sys.stderr)
        return 1

    issue_number = sys.argv[1]
    checklist_file = sys.argv[2]

    # Read checklist
    checklist = Path(checklist_file).read_text().strip()
    if not checklist:
        print("Warning: Empty checklist file", file=sys.stderr)
        return 0

    # Get current body
    try:
        body = get_issue_body(issue_number)
    except RuntimeError as e:
        print(f"Warning: Could not read issue #{issue_number}: {e}", file=sys.stderr)
        return 0  # Non-blocking

    if not body:
        print(f"Warning: Issue #{issue_number} has empty body", file=sys.stderr)
        return 0

    # Insert checklist
    new_body = insert_checklist(body, checklist)

    if new_body == body:
        print(f"No changes needed for issue #{issue_number}")
        return 0

    # Update issue
    try:
        update_issue_body(issue_number, new_body)
        print(f"Updated issue #{issue_number} with plan checklist")
    except RuntimeError as e:
        print(f"Warning: Failed to update issue #{issue_number}: {e}", file=sys.stderr)
        return 0  # Non-blocking

    return 0


if __name__ == "__main__":
    sys.exit(main())
