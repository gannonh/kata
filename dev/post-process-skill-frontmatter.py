#!/usr/bin/env python3

import yaml
from pathlib import Path

def add_skill_frontmatter(skill_md_path):
    """Add missing frontmatter fields to a skill file.

    Adds:
    - version: 0.1.0
    - user-invocable: false
    - disable-model-invocation: false
    - allowed-tools: [Read, Write, Bash]

    Returns True if frontmatter was modified, False otherwise.
    """
    try:
        with open(skill_md_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"  ✗ Error reading {skill_md_path.name}: {e}")
        return False

    # Parse frontmatter
    if not content.startswith('---'):
        print(f"  ✗ No frontmatter found in {skill_md_path.name}")
        return False

    parts = content.split('---', 2)
    if len(parts) < 3:
        print(f"  ✗ Invalid frontmatter structure in {skill_md_path.name}")
        return False

    try:
        frontmatter = yaml.safe_load(parts[1])
    except yaml.YAMLError as e:
        print(f"  ✗ Error parsing YAML in {skill_md_path.name}: {e}")
        return False

    if not isinstance(frontmatter, dict):
        print(f"  ✗ Frontmatter is not a dictionary in {skill_md_path.name}")
        return False

    body = parts[2]
    modified = False

    # Add missing fields
    if 'version' not in frontmatter:
        frontmatter['version'] = '0.1.0'
        modified = True

    if 'user-invocable' not in frontmatter:
        frontmatter['user-invocable'] = False
        modified = True

    if 'disable-model-invocation' not in frontmatter:
        frontmatter['disable-model-invocation'] = False
        modified = True

    if 'allowed-tools' not in frontmatter:
        frontmatter['allowed-tools'] = ['Read', 'Write', 'Bash']
        modified = True

    if not modified:
        return False

    # Reconstruct file with updated frontmatter
    # Use dump with explicit settings to maintain readability
    yaml_str = yaml.dump(frontmatter, default_flow_style=False, sort_keys=False, allow_unicode=True)
    new_content = f"---\n{yaml_str}---{body}"

    try:
        with open(skill_md_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    except Exception as e:
        print(f"  ✗ Error writing {skill_md_path.name}: {e}")
        return False

def main():
    print("=== Skill Frontmatter Post-Processor ===\n")

    # Process all skills in kata-staging/skills/
    skills_dir = Path('dev/transform/kata-staging/skills')

    if not skills_dir.exists():
        print(f"Error: Skills directory not found at {skills_dir}")
        print("Run the transformation script first to create kata-staging/")
        return 1

    print(f"Processing skills in: {skills_dir}\n")

    processed = 0
    updated = 0
    errors = 0

    # Find all SKILL.md files
    skill_files = list(skills_dir.rglob('SKILL.md'))

    if not skill_files:
        print("No SKILL.md files found.")
        return 1

    for skill_md in sorted(skill_files):
        skill_name = skill_md.parent.name
        processed += 1

        result = add_skill_frontmatter(skill_md)
        if result:
            print(f"  ✓ Updated {skill_name}/SKILL.md")
            updated += 1
        elif result is False and '✗' not in str(skill_md):
            # File was processed but no changes needed
            print(f"  - No changes needed for {skill_name}/SKILL.md")
        else:
            errors += 1

    # Display results
    print()
    print("─" * 60)
    print(f"Processed: {processed} skills")
    print(f"Updated:   {updated} skills")
    if errors > 0:
        print(f"Errors:    {errors} skills")
    print("─" * 60)

    return 0 if errors == 0 else 1

if __name__ == "__main__":
    exit(main())
