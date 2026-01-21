#!/usr/bin/env python3

import os
import re
from pathlib import Path

# Directories to search
DIRS = ["agents", "kata", "hooks", "commands", "skills"]

# Track statistics
total_files = 0
modified_files = 0
total_replacements = 0
modifications = []

def replace_in_file(file_path):
    """Replace gsd and get-shit-done with kata in a file."""
    global total_files, modified_files, total_replacements

    total_files += 1

    # Read file content
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    replacements = 0

    # Replace patterns with correct capitalization
    patterns = [
        (r'get-shit-done', 'kata'),
        (r'Get-Shit-Done', 'kata'),
        (r'GET-SHIT-DONE', 'kata'),
        # Replace "gsd" with word boundaries (case variations)
        (r'\bgsd\b', 'kata'),
        (r'\bGSD\b', 'Kata'),
        (r'\bGsd\b', 'Kata'),
    ]

    for pattern, replacement in patterns:
        matches = len(re.findall(pattern, content))
        replacements += matches
        content = re.sub(pattern, replacement, content)

    # If changes were made, write back
    if content != original_content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        modified_files += 1
        total_replacements += replacements
        modifications.append((file_path, replacements))
        return True

    return False

def main():
    print("=== GSD to KATA Replacement Script ===\n")

    # Process each directory
    for dir_name in DIRS:
        dir_path = Path(dir_name)

        if not dir_path.exists():
            print(f"Warning: Directory '{dir_name}' not found, skipping...")
            continue

        print(f"Processing directory: {dir_name}")

        # Find all .md files
        for md_file in dir_path.rglob("*.md"):
            replace_in_file(md_file)

    # Display results
    print("\n=== Results ===\n")

    if modifications:
        print("Modified files:\n")
        for file_path, count in modifications:
            print(f"  {file_path}: {count} replacements")
        print()

    print("Summary:")
    print(f"  Total files scanned: {total_files}")
    print(f"  Files modified: {modified_files}")
    print(f"  Total replacements: {total_replacements}")

    print("\n=== Complete ===")

if __name__ == "__main__":
    main()
