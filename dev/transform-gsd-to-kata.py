#!/usr/bin/env python3

import re
import shutil
from pathlib import Path

# Source and target directories
SOURCE_ROOT = Path("/Users/gannonhall/dev/oss/get-shit-done")
KATA_ROOT = Path("/Users/gannonhall/dev/oss/kata")
TRANSFORM_ROOT = KATA_ROOT / "dev" / "transform"
GSD_SOURCE = TRANSFORM_ROOT / "gsd-source"
KATA_STAGING = TRANSFORM_ROOT / "kata-staging"

# Track statistics
stats = {
    "gsd_source_files": 0,
    "agents_transformed": 0,
    "agents_renamed": 0,
    "workflows_copied": 0,
    "hooks_copied": 0,
    "scripts_copied": 0,
    "docs_copied": 0,
}

def copy_entire_repo_to_source(source_root, gsd_source):
    """Copy entire GSD repo to gsd-source/ for reference."""
    print(f"Copying GSD repo to {gsd_source}...")

    # Remove existing gsd-source if it exists
    if gsd_source.exists():
        shutil.rmtree(gsd_source)

    # Copy entire directory
    shutil.copytree(source_root, gsd_source, ignore=shutil.ignore_patterns('.git', 'node_modules', '__pycache__'))

    # Count files
    for item in gsd_source.rglob("*"):
        if item.is_file():
            stats["gsd_source_files"] += 1

    print(f"  ✓ Copied {stats['gsd_source_files']} files to gsd-source/")

def copy_with_tracking(source_dir, target_dir, stat_key):
    """Copy files from source to target, tracking count."""
    if not source_dir.exists():
        print(f"  Warning: Source directory '{source_dir}' not found, skipping...")
        return

    # Create target directory
    target_dir.mkdir(parents=True, exist_ok=True)

    # Copy all files recursively
    count = 0
    for item in source_dir.rglob("*"):
        if item.is_file():
            relative_path = item.relative_to(source_dir)
            target_path = target_dir / relative_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target_path)
            count += 1

    stats[stat_key] = count
    print(f"  ✓ Copied {count} files")

def transform_agents(source_dir, target_dir):
    """Transform agent files: gsd- → kata- in filename and frontmatter."""
    if not source_dir.exists():
        print(f"  Warning: Source directory '{source_dir}' not found, skipping...")
        return

    # Create target directory
    target_dir.mkdir(parents=True, exist_ok=True)

    # Transform all agent files
    for item in source_dir.rglob("*"):
        if item.is_file():
            original_name = item.name

            # Rename gsd- prefix to kata-
            if original_name.startswith("gsd-"):
                new_name = "kata-" + original_name[4:]
                stats["agents_renamed"] += 1

                # Read file and update frontmatter
                with open(item, 'r', encoding='utf-8') as f:
                    content = f.read()

                # Update name field in frontmatter (gsd-* → kata-*)
                content = re.sub(
                    r'^name:\s+gsd-(.*)$',
                    r'name: kata-\1',
                    content,
                    flags=re.MULTILINE
                )

                # Write to new location
                target_path = target_dir / new_name
                target_path.parent.mkdir(parents=True, exist_ok=True)
                with open(target_path, 'w', encoding='utf-8') as f:
                    f.write(content)
            else:
                # Just copy non-gsd files
                new_name = original_name
                target_path = target_dir / new_name
                target_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target_path)

            stats["agents_transformed"] += 1

    print(f"  ✓ Transformed {stats['agents_transformed']} agents ({stats['agents_renamed']} renamed)")

def copy_and_rename_file(source_path, target_path):
    """Copy a single file."""
    if source_path.exists():
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        return True
    return False

def main():
    print("=== GSD to Kata Transformation Script ===\n")

    # Verify source exists
    if not SOURCE_ROOT.exists():
        print(f"Error: Source directory '{SOURCE_ROOT}' not found.")
        print("Ensure get-shit-done repository is cloned to expected location.")
        return 1

    print(f"Source: {SOURCE_ROOT}")
    print(f"Target staging: {TRANSFORM_ROOT}")
    print()

    # Remove existing kata-staging if it exists
    if KATA_STAGING.exists():
        print("Removing existing kata-staging/...")
        shutil.rmtree(KATA_STAGING)

    # Step 1: Copy entire GSD repo to gsd-source/
    print("Step 1: Copying GSD repo to gsd-source/...")
    copy_entire_repo_to_source(SOURCE_ROOT, GSD_SOURCE)
    print()

    # Step 2: Transform agents to kata-staging/agents/
    print("Step 2: Transforming agents to kata-staging/agents/...")
    transform_agents(
        GSD_SOURCE / "agents",
        KATA_STAGING / "agents"
    )
    print()

    # Step 3: Copy workflows to kata-staging/kata/
    print("Step 3: Copying workflows to kata-staging/kata/...")
    copy_with_tracking(
        GSD_SOURCE / "get-shit-done",
        KATA_STAGING / "kata",
        "workflows_copied"
    )
    print()

    # Step 4: Copy hooks to kata-staging/hooks/
    print("Step 4: Copying hooks to kata-staging/hooks/...")
    copy_with_tracking(
        GSD_SOURCE / "hooks",
        KATA_STAGING / "hooks",
        "hooks_copied"
    )
    print()

    # Step 5: Copy scripts to kata-staging/scripts/
    print("Step 5: Copying scripts to kata-staging/scripts/...")
    copy_with_tracking(
        GSD_SOURCE / "scripts",
        KATA_STAGING / "scripts",
        "scripts_copied"
    )
    print()

    # Step 6: Copy and rename documentation files
    print("Step 6: Copying documentation files...")

    # GSD-STYLE.md → KATA-STYLE.md
    if copy_and_rename_file(GSD_SOURCE / "GSD-STYLE.md", KATA_STAGING / "KATA-STYLE.md"):
        print("  ✓ GSD-STYLE.md → KATA-STYLE.md")
        stats["docs_copied"] += 1

    # CHANGELOG.md
    if copy_and_rename_file(GSD_SOURCE / "CHANGELOG.md", KATA_STAGING / "CHANGELOG.md"):
        print("  ✓ CHANGELOG.md")
        stats["docs_copied"] += 1

    # README.md
    if copy_and_rename_file(GSD_SOURCE / "README.md", KATA_STAGING / "README.md"):
        print("  ✓ README.md")
        stats["docs_copied"] += 1

    print()

    # Display results
    print("═" * 60)
    print("  TRANSFORMATION COMPLETE")
    print("═" * 60)
    print()
    print(f"GSD Source (reference):")
    print(f"  {GSD_SOURCE}")
    print(f"  Files: {stats['gsd_source_files']}")
    print()
    print(f"Kata Staging (transformed):")
    print(f"  {KATA_STAGING}")
    print(f"  Agents:    {stats['agents_transformed']} ({stats['agents_renamed']} renamed gsd→kata)")
    print(f"  Workflows: {stats['workflows_copied']}")
    print(f"  Hooks:     {stats['hooks_copied']}")
    print(f"  Scripts:   {stats['scripts_copied']}")
    print(f"  Docs:      {stats['docs_copied']}")
    print()

    total_staging = (stats['agents_transformed'] + stats['workflows_copied'] +
                     stats['hooks_copied'] + stats['scripts_copied'] + stats['docs_copied'])
    print(f"  Total staging files: {total_staging}")
    print()
    print("Next steps:")
    print("  1. Run text replacements on kata-staging/")
    print("  2. Convert commands to skills")
    print("  3. Generate Kata commands")
    print("  4. Validate transformation")
    print("─" * 60)

    return 0

if __name__ == "__main__":
    exit(main())
