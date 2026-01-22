#!/bin/bash
# Validation hook for GSD → Kata transformation
# Runs after /kata:transform-from-gsd completes
# Validates files in dev/transform/kata-staging/ before deployment

set -e

echo "🔍 Validating GSD → Kata transformation..."
echo ""

EXIT_CODE=0
STAGING="dev/transform/kata-staging"

# Check 1: Agent frontmatter has kata- prefix
echo "✓ Checking agent frontmatter..."
if [ -d "$STAGING/agents" ]; then
  AGENT_NAME_ISSUES=$(grep -l "^name: gsd-" $STAGING/agents/kata-*.md 2>/dev/null | wc -l | tr -d ' ')
  if [ "$AGENT_NAME_ISSUES" -gt 0 ]; then
    echo "  ❌ FAIL: $AGENT_NAME_ISSUES agent files still have 'name: gsd-' in frontmatter"
    grep -l "^name: gsd-" $STAGING/agents/kata-*.md 2>/dev/null | sed 's/^/    /'
    EXIT_CODE=1
  else
    AGENT_COUNT=$(find $STAGING/agents -name "kata-*.md" 2>/dev/null | wc -l | tr -d ' ')
    echo "  ✓ Agent frontmatter correct (all $AGENT_COUNT agents use kata- prefix)"
  fi
else
  echo "  ❌ FAIL: No agents directory found in kata-staging/"
  EXIT_CODE=1
fi

# Check 2: No remaining GSD references in kata-staging content (excluding name field and README.md)
echo ""
echo "✓ Checking for GSD references in kata-staging..."

# Check for 'gsd' references
GSD_REFS=$(grep -ri "gsd" $STAGING 2>/dev/null | grep -v "^[^:]*:name:" | grep -v "gsd-source" | grep -v "README.md:" | wc -l | tr -d ' ')

# Check for 'get-shit-done' references (the full name)
GET_SHIT_DONE_REFS=$(grep -ri "get-shit-done" $STAGING 2>/dev/null | grep -v "gsd-source" | grep -v "README.md:" | wc -l | tr -d ' ')

TOTAL_REFS=$((GSD_REFS + GET_SHIT_DONE_REFS))

if [ "$TOTAL_REFS" -gt 0 ]; then
  echo "  ❌ FAIL: Found GSD references in kata-staging/"
  if [ "$GSD_REFS" -gt 0 ]; then
    echo "  'gsd' references ($GSD_REFS):"
    grep -ri "gsd" $STAGING 2>/dev/null | grep -v "^[^:]*:name:" | grep -v "gsd-source" | grep -v "README.md:" | head -3 | sed 's/^/    /'
  fi
  if [ "$GET_SHIT_DONE_REFS" -gt 0 ]; then
    echo "  'get-shit-done' references ($GET_SHIT_DONE_REFS):"
    grep -ri "get-shit-done" $STAGING 2>/dev/null | grep -v "gsd-source" | grep -v "README.md:" | head -3 | sed 's/^/    /'
  fi
  EXIT_CODE=1
else
  echo "  ✓ No GSD/get-shit-done references in kata-staging/ (README.md excluded)"
fi

# Check 3: Verify kata references exist (replacement worked)
echo ""
echo "✓ Checking kata references exist..."
KATA_REFS=$(grep -ri "kata" $STAGING 2>/dev/null | wc -l | tr -d ' ')
if [ "$KATA_REFS" -gt 0 ]; then
  echo "  ✓ Found $KATA_REFS kata references in kata-staging/"
else
  echo "  ❌ FAIL: No kata references found in kata-staging/"
  EXIT_CODE=1
fi

# Check 4: Verify skills have complete frontmatter
echo ""
echo "✓ Checking skill frontmatter..."
if [ -d "$STAGING/skills" ]; then
  SKILL_COUNT=$(find $STAGING/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')

  # Check for name field with kata- prefix
  SKILL_NAME_ERRORS=$(find $STAGING/skills -name "SKILL.md" -exec grep -L "^name: kata-" {} \; 2>/dev/null | wc -l | tr -d ' ')

  # Check for required fields: version, user-invocable, disable-model-invocation
  SKILL_VERSION_MISSING=$(find $STAGING/skills -name "SKILL.md" -exec grep -L "^version:" {} \; 2>/dev/null | wc -l | tr -d ' ')
  SKILL_USER_INV_MISSING=$(find $STAGING/skills -name "SKILL.md" -exec grep -L "^user-invocable:" {} \; 2>/dev/null | wc -l | tr -d ' ')
  SKILL_DISABLE_MODEL_MISSING=$(find $STAGING/skills -name "SKILL.md" -exec grep -L "^disable-model-invocation:" {} \; 2>/dev/null | wc -l | tr -d ' ')

  if [ "$SKILL_NAME_ERRORS" -gt 0 ]; then
    echo "  ❌ FAIL: $SKILL_NAME_ERRORS skills missing 'name: kata-' prefix"
    find $STAGING/skills -name "SKILL.md" -exec grep -L "^name: kata-" {} \; 2>/dev/null | sed 's/^/    /'
    EXIT_CODE=1
  elif [ "$SKILL_VERSION_MISSING" -gt 0 ] || [ "$SKILL_USER_INV_MISSING" -gt 0 ] || [ "$SKILL_DISABLE_MODEL_MISSING" -gt 0 ]; then
    echo "  ❌ FAIL: Some skills missing required frontmatter fields"
    if [ "$SKILL_VERSION_MISSING" -gt 0 ]; then
      echo "    - $SKILL_VERSION_MISSING skills missing 'version' field"
    fi
    if [ "$SKILL_USER_INV_MISSING" -gt 0 ]; then
      echo "    - $SKILL_USER_INV_MISSING skills missing 'user-invocable' field"
    fi
    if [ "$SKILL_DISABLE_MODEL_MISSING" -gt 0 ]; then
      echo "    - $SKILL_DISABLE_MODEL_MISSING skills missing 'disable-model-invocation' field"
    fi
    EXIT_CODE=1
  else
    echo "  ✓ All $SKILL_COUNT skills have complete frontmatter"
  fi
else
  echo "  ❌ FAIL: No skills directory found in kata-staging/"
  EXIT_CODE=1
fi

# Check 5: Verify Kata commands exist for skills
echo ""
echo "✓ Checking Kata commands..."
if [ -d "$STAGING/commands/kata" ]; then
  COMMAND_COUNT=$(find $STAGING/commands/kata -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$COMMAND_COUNT" -gt 0 ]; then
    echo "  ✓ Found $COMMAND_COUNT Kata commands"

    # Verify commands have required fields
    COMMAND_DISABLE_MODEL_MISSING=$(find $STAGING/commands/kata -name "*.md" -exec grep -L "^disable-model-invocation: true" {} \; 2>/dev/null | wc -l | tr -d ' ')

    if [ "$COMMAND_DISABLE_MODEL_MISSING" -gt 0 ]; then
      echo "  ⚠️  WARNING: $COMMAND_DISABLE_MODEL_MISSING commands missing 'disable-model-invocation: true'"
    fi
  else
    echo "  ❌ FAIL: No Kata commands found"
    EXIT_CODE=1
  fi
else
  echo "  ❌ FAIL: No commands/kata/ directory found in kata-staging/"
  EXIT_CODE=1
fi

# Check 6: Verify files in correct kata-staging locations
echo ""
echo "✓ Checking file locations in kata-staging..."
AGENTS_COUNT=$(find $STAGING/agents -name "kata-*.md" 2>/dev/null | wc -l | tr -d ' ')
WORKFLOWS_COUNT=$(find $STAGING/kata -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
HOOKS_COUNT=$(find $STAGING/hooks -type f 2>/dev/null | wc -l | tr -d ' ')
SCRIPTS_COUNT=$(find $STAGING/scripts -type f 2>/dev/null | wc -l | tr -d ' ')
SKILLS_COUNT=$(find $STAGING/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
COMMANDS_COUNT=$(find $STAGING/commands/kata -name "*.md" 2>/dev/null | wc -l | tr -d ' ')

echo "  Agents:    $AGENTS_COUNT files"
echo "  Workflows: $WORKFLOWS_COUNT files"
echo "  Hooks:     $HOOKS_COUNT files"
echo "  Scripts:   $SCRIPTS_COUNT files"
echo "  Skills:    $SKILLS_COUNT files"
echo "  Commands:  $COMMANDS_COUNT files"

# Verify key files exist
if [ ! -f "$STAGING/KATA-STYLE.md" ]; then
  echo "  ❌ FAIL: KATA-STYLE.md not found"
  EXIT_CODE=1
else
  echo "  ✓ KATA-STYLE.md found"
fi

if [ "$AGENTS_COUNT" -eq 0 ]; then
  echo "  ❌ FAIL: No agents found in kata-staging/agents/"
  EXIT_CODE=1
fi
if [ "$WORKFLOWS_COUNT" -eq 0 ]; then
  echo "  ❌ FAIL: No workflows found in kata-staging/kata/"
  EXIT_CODE=1
fi
if [ "$SKILLS_COUNT" -eq 0 ]; then
  echo "  ❌ FAIL: No skills found in kata-staging/skills/"
  EXIT_CODE=1
fi
if [ "$COMMANDS_COUNT" -eq 0 ]; then
  echo "  ❌ FAIL: No commands found in kata-staging/commands/kata/"
  EXIT_CODE=1
fi

echo ""
if [ "$EXIT_CODE" -eq 0 ]; then
  echo "✅ Validation passed - transformation looks good!"
  echo ""
  echo "Kata-staging is ready for deployment."
  echo "Review the transformed files before approving deployment."
else
  echo "❌ Validation failed - please review errors above"
  echo ""
  echo "Fix the issues before deploying to final destinations."
fi

exit $EXIT_CODE
