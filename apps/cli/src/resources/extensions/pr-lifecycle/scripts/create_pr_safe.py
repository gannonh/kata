#!/usr/bin/env python3
"""
Safely create a GitHub PR from the current branch using a file-backed body.

Why this exists:
- Avoid shell interpolation corruption from inline `gh pr create --body "..."`
- Verify created PR body content
- Auto-repair body mismatches via `gh pr edit --body-file`
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def run(cmd: list[str], *, env: dict[str, str] | None = None) -> str:
    completed = subprocess.run(cmd, text=True, capture_output=True, env=env)
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed ({completed.returncode}): {' '.join(cmd)}\n{completed.stderr.strip()}"
        )
    return completed.stdout


def normalize_markdown(value: str) -> str:
    return value.replace("\r\n", "\n").rstrip("\n") + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create PR with file-backed body, verify body integrity, and auto-repair mismatches."
        )
    )
    parser.add_argument("--title", required=True, help="Pull request title")
    parser.add_argument("--base", default="main", help="Target base branch (default: main)")
    parser.add_argument("--head", default="", help="Head branch (default: current branch)")
    parser.add_argument(
        "--body-file",
        default="",
        help="Path to markdown body file. If omitted, read body from stdin.",
    )
    return parser.parse_args()


def require_tools() -> None:
    if shutil.which("gh") is None:
        raise RuntimeError("gh CLI is required but was not found in PATH")
    if shutil.which("git") is None:
        raise RuntimeError("git is required but was not found in PATH")


def resolve_head_branch(explicit_head: str) -> str:
    if explicit_head:
        return explicit_head
    return run(["git", "branch", "--show-current"]).strip()


def resolve_body_file(path_arg: str) -> tuple[Path, Path | None]:
    """
    Returns (body_file, temp_file_to_cleanup).
    """
    if path_arg:
        path = Path(path_arg).expanduser().resolve()
        if not path.exists():
            raise RuntimeError(f"--body-file does not exist: {path}")
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            raise RuntimeError(f"PR body file is empty: {path}")
        return path, None

    stdin_content = sys.stdin.read()
    if not stdin_content.strip():
        raise RuntimeError(
            "No --body-file provided and stdin is empty. Pipe markdown via stdin or pass --body-file."
        )

    temp = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".md", delete=False)
    temp.write(stdin_content)
    temp.flush()
    temp.close()
    return Path(temp.name), Path(temp.name)


def gh_env() -> dict[str, str]:
    env = dict(**os.environ)
    env["GH_PAGER"] = ""
    return env


def get_current_pr_number() -> str:
    return run(["gh", "pr", "view", "--json", "number", "--jq", ".number"], env=gh_env()).strip()


def get_current_pr_body() -> str:
    return run(["gh", "pr", "view", "--json", "body", "--jq", ".body"], env=gh_env())


def get_current_pr_url() -> str:
    return run(["gh", "pr", "view", "--json", "url", "--jq", ".url"], env=gh_env()).strip()


def main() -> int:
    args = parse_args()
    require_tools()

    body_file: Path | None = None
    temp_file: Path | None = None
    try:
        head = resolve_head_branch(args.head)
        body_file, temp_file = resolve_body_file(args.body_file)

        run(
            [
                "gh",
                "pr",
                "create",
                "--title",
                args.title,
                "--base",
                args.base,
                "--head",
                head,
                "--body-file",
                str(body_file),
            ]
        )

        expected = normalize_markdown(body_file.read_text(encoding="utf-8"))
        actual = normalize_markdown(get_current_pr_body())

        if expected != actual:
            pr_number = get_current_pr_number()
            run(["gh", "pr", "edit", pr_number, "--body-file", str(body_file)])
            repaired = normalize_markdown(get_current_pr_body())
            if expected != repaired:
                raise RuntimeError(f"Failed to reconcile PR body for #{pr_number}")

        print(get_current_pr_url())
        return 0
    except Exception as exc:  # noqa: BLE001
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        if temp_file is not None:
            try:
                temp_file.unlink(missing_ok=True)
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
