#!/usr/bin/env python3

import yaml
import re
from pathlib import Path

def skill_name_to_command_name(skill_name):
    """Convert skill name (gerund form) to command name (imperative form).

    Examples:
        kata-adding-phases → add-phase
        kata-planning-phases → plan-phase
        kata-executing-plans → execute-plan
        kata-verifying-work → verify-work

    Algorithm:
        1. Remove 'kata-' prefix
        2. Convert gerund to imperative (remove -ing suffix)
        3. Singularize plural nouns (phases → phase, plans → plan)
    """
    # Remove kata- prefix
    if skill_name.startswith('kata-'):
        name = skill_name[5:]
    else:
        name = skill_name

    # Split into words
    words = name.split('-')

    # Process each word
    result_words = []
    for word in words:
        # Convert gerund to imperative (remove -ing)
        if word.endswith('ing'):
            # Handle special cases
            if word.endswith('dding'):  # adding → add
                word = word[:-4]
            elif word.endswith('nning'):  # planning → plan
                word = word[:-4]
            elif word.endswith('tting'):  # setting → set
                word = word[:-4]
            else:
                word = word[:-3]  # general case

        # Singularize common plurals
        if word.endswith('es'):
            word = word[:-2]  # phases → phase
        elif word.endswith('s') and not word.endswith('ss'):
            word = word[:-1]  # plans → plan

        result_words.append(word)

    return '-'.join(result_words)

def generate_command(skill_name, skill_description):
    """Generate a thin wrapper command that invokes a skill.

    Args:
        skill_name: The skill name (e.g., "kata-adding-phases")
        skill_description: The skill description

    Returns:
        tuple: (command_name, command_content)
    """
    command_name = skill_name_to_command_name(skill_name)

    # Extract first sentence for command description
    description_parts = skill_description.split('.')
    short_description = description_parts[0] if description_parts else skill_description
    short_description = short_description.strip()

    command_template = f'''---
name: {command_name}
description: {short_description}
argument-hint: <description>
version: 0.1.0
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
---

## Step 1: Parse Context

Arguments: "$ARGUMENTS"

## Step 2: Invoke Skill

Run the following skill:
`Skill("{skill_name}")`
'''

    return command_name, command_template

def main():
    print("=== Kata Command Generator ===\n")

    # Process all skills in kata-staging/skills/
    skills_dir = Path('dev/transform/kata-staging/skills')
    commands_dir = Path('dev/transform/kata-staging/commands/kata')

    if not skills_dir.exists():
        print(f"Error: Skills directory not found at {skills_dir}")
        print("Run the skill conversion step first.")
        return 1

    print(f"Reading skills from: {skills_dir}")
    print(f"Generating commands in: {commands_dir}\n")

    # Create commands directory
    commands_dir.mkdir(parents=True, exist_ok=True)

    generated = 0
    errors = 0

    # Find all skill directories
    skill_dirs = [d for d in skills_dir.iterdir() if d.is_dir()]

    if not skill_dirs:
        print("No skill directories found.")
        return 1

    for skill_dir in sorted(skill_dirs):
        skill_md = skill_dir / 'SKILL.md'

        if not skill_md.exists():
            print(f"  ⚠ Skipping {skill_dir.name}: No SKILL.md found")
            continue

        try:
            # Read skill frontmatter
            with open(skill_md, 'r', encoding='utf-8') as f:
                content = f.read()

            # Parse frontmatter
            if not content.startswith('---'):
                print(f"  ✗ {skill_dir.name}: No frontmatter found")
                errors += 1
                continue

            parts = content.split('---', 2)
            if len(parts) < 3:
                print(f"  ✗ {skill_dir.name}: Invalid frontmatter structure")
                errors += 1
                continue

            frontmatter = yaml.safe_load(parts[1])

            if not isinstance(frontmatter, dict):
                print(f"  ✗ {skill_dir.name}: Frontmatter is not a dictionary")
                errors += 1
                continue

            skill_name = frontmatter.get('name')
            skill_description = frontmatter.get('description', '')

            if not skill_name:
                print(f"  ✗ {skill_dir.name}: No 'name' field in frontmatter")
                errors += 1
                continue

            # Generate command
            command_name, command_content = generate_command(skill_name, skill_description)

            # Write command file
            command_path = commands_dir / f'{command_name}.md'

            with open(command_path, 'w', encoding='utf-8') as f:
                f.write(command_content)

            print(f"  ✓ {skill_name} → {command_name}.md")
            generated += 1

        except Exception as e:
            print(f"  ✗ {skill_dir.name}: Error - {e}")
            errors += 1

    # Display results
    print()
    print("─" * 60)
    print(f"Generated: {generated} commands")
    if errors > 0:
        print(f"Errors:    {errors} skills")
    print(f"Output:    {commands_dir}")
    print("─" * 60)

    return 0 if errors == 0 else 1

if __name__ == "__main__":
    exit(main())
