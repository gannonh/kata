#!/usr/bin/env python3
"""
Validate SKILL.md frontmatter after conversion.
Runs as a PostToolUse hook to ensure converted skills follow conventions.
"""

import json
import sys
import re
from pathlib import Path

# Valid frontmatter fields for skills
VALID_FIELDS = {
    'name', 'description', 'argument-hint', 'disable-model-invocation',
    'user-invocable', 'model', 'context', 'agent', 'hooks',
    'version', 'allowed-tools'
}

# Deprecated command-specific fields that should not be in skills
DEPRECATED_FIELDS = set()  # No deprecated fields currently

def is_gerund(name):
    """Check if name follows gerund form convention."""
    # Common gerund patterns
    if name.endswith('-ing') or name.endswith('ing'):
        return True

    # Some valid gerund-like skill names that don't end in -ing
    gerund_exceptions = {
        'review', 'commit', 'deploy', 'test', 'build', 'setup'
    }

    parts = name.split('-')
    return any(part.endswith('ing') or part in gerund_exceptions for part in parts)

def check_third_person(text):
    """Check if description uses third person (not first or second person)."""
    if not text:
        return True

    # Check for first/second person indicators at start
    first_words = text.split()[:5]  # Check first 5 words
    first_text = ' '.join(first_words).lower()

    problematic_patterns = [
        r'\bI\b', r'\bwe\b', r'\byou\b',
        r'\bmy\b', r'\bour\b', r'\byour\b'
    ]

    for pattern in problematic_patterns:
        if re.search(pattern, first_text, re.IGNORECASE):
            return False

    return True

def check_triggers(text):
    """Check if description includes trigger keywords or phrases."""
    if not text:
        return False

    # Common trigger patterns in good skill descriptions
    trigger_indicators = [
        'trigger', 'invoke', 'use when', 'use this skill when',
        'handles', 'applies to', 'for', 'includes'
    ]

    text_lower = text.lower()
    return any(indicator in text_lower for indicator in trigger_indicators)

def check_grammar(text):
    """Check for basic grammar issues in description."""
    issues = []

    if not text:
        return issues

    # Check capitalization
    if text[0].islower():
        issues.append("Description should start with a capital letter")

    # Check ending punctuation
    if not text.rstrip().endswith('.'):
        issues.append("Description should end with a period")

    # Check for multiple sentences without proper punctuation
    sentences = text.split('.')
    for i, sentence in enumerate(sentences[:-1]):  # Exclude last empty string after final period
        sentence = sentence.strip()
        if sentence and not sentence[0].isupper():
            issues.append(f"Sentence should start with capital letter: '{sentence[:50]}...'")

    return issues

def extract_frontmatter(content):
    """Extract YAML frontmatter from markdown file."""
    lines = content.split('\n')

    if not lines or lines[0].strip() != '---':
        return None

    frontmatter_lines = []
    in_frontmatter = False

    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            in_frontmatter = True
            break
        frontmatter_lines.append(line)

    if not in_frontmatter:
        return None

    # Parse YAML frontmatter manually (simple parsing)
    frontmatter = {}
    current_key = None

    for line in frontmatter_lines:
        if ':' in line and not line.startswith(' '):
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()
            frontmatter[key] = value
            current_key = key
        elif current_key and line.startswith(' '):
            # Multi-line value
            if isinstance(frontmatter[current_key], str):
                frontmatter[current_key] += ' ' + line.strip()

    return frontmatter

def validate_skill(file_path):
    """Validate a SKILL.md file's frontmatter."""
    path = Path(file_path)

    # Only validate SKILL.md files
    if path.name != 'SKILL.md':
        return True, []

    if not path.exists():
        return False, [f"File not found: {file_path}"]

    content = path.read_text()
    frontmatter = extract_frontmatter(content)

    if frontmatter is None:
        return False, ["No valid YAML frontmatter found"]

    errors = []
    warnings = []

    # Check name
    name = frontmatter.get('name', '')
    if not name:
        errors.append("'name' field is required")
    else:
        if len(name) > 64:
            errors.append(f"Name '{name}' exceeds 64 characters ({len(name)} chars)")

        if not is_gerund(name):
            warnings.append(f"Name '{name}' should use gerund form (verb + -ing)")

    # Check description
    description = frontmatter.get('description', '')
    if not description:
        errors.append("'description' field is required")
    else:
        if len(description) > 1024:
            errors.append(f"Description exceeds 1024 characters ({len(description)} chars)")

        if not check_third_person(description):
            warnings.append("Description should use third person (avoid 'I', 'we', 'you')")

        if not description.lower().startswith('use this skill'):
            warnings.append("Description should start with 'Use this skill when...'")

        if not check_triggers(description):
            warnings.append("Description should include trigger keywords (e.g., 'triggers include', 'invoke when', 'use when')")

        # Check grammar
        grammar_issues = check_grammar(description)
        warnings.extend(grammar_issues)

    # Check for deprecated fields
    for field in frontmatter.keys():
        if field in DEPRECATED_FIELDS:
            errors.append(f"Field '{field}' should not be in skill frontmatter (deprecated)")
        elif field not in VALID_FIELDS:
            warnings.append(f"Unknown field '{field}' in frontmatter")

    return len(errors) == 0, errors + warnings

def main():
    """Main validation function called by hook or CLI."""
    try:
        # Check for command-line argument first (direct invocation)
        if len(sys.argv) > 1:
            file_path = sys.argv[1]
        else:
            # Read hook input from stdin
            input_data = json.load(sys.stdin)
            file_path = input_data.get('tool_input', {}).get('file_path', '')

        if not file_path:
            # Not a Write operation with file_path
            sys.exit(0)

        # Validate the skill
        is_valid, messages = validate_skill(file_path)

        if messages:
            print(f"\n{'='*60}")
            print(f"SKILL VALIDATION: {file_path}")
            print('='*60)

            # Separate errors from warnings based on position in list
            # (errors are returned first from validate_skill)
            for msg in messages:
                # Check if it's from the errors list (contains specific error keywords)
                if any(keyword in msg for keyword in ['exceeds', 'required', 'should not be in']):
                    print(f"❌ ERROR: {msg}")
                else:
                    print(f"⚠️  WARNING: {msg}")

            print('='*60)

            if not is_valid:
                print("Validation FAILED. Please fix errors before proceeding.")
                sys.exit(1)  # Exit with error if validation failed
        else:
            print(f"✅ Skill validation passed: {file_path}")

        sys.exit(0)

    except Exception as e:
        print(f"Validation script error: {e}", file=sys.stderr)
        sys.exit(0)  # Don't fail the conversion on script errors

if __name__ == '__main__':
    main()
