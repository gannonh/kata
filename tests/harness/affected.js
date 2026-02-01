import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KATA_ROOT = join(__dirname, '..', '..');

// Cache for agent-to-skill mappings
let agentSkillCache = null;

/**
 * Get list of skills that use a specific agent.
 * Scans all SKILL.md files for references to the agent.
 *
 * @param {string} agentName - Agent name (e.g., 'kata-executor')
 * @returns {string[]} Array of skill names that reference this agent
 */
export function getSkillsUsingAgent(agentName) {
  // Build cache on first call
  if (!agentSkillCache) {
    agentSkillCache = buildAgentSkillCache();
  }

  return agentSkillCache[agentName] || [];
}

/**
 * Build a mapping of agent names to skills that use them.
 * Scans all SKILL.md files in the skills directory.
 *
 * @returns {Object} Map of agent name to array of skill names
 */
function buildAgentSkillCache() {
  const cache = {};
  const skillsDir = join(KATA_ROOT, 'skills');

  if (!existsSync(skillsDir)) {
    return cache;
  }

  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('kata-'))
    .map(d => d.name);

  for (const skillDir of skillDirs) {
    const skillMdPath = join(skillsDir, skillDir, 'SKILL.md');
    if (!existsSync(skillMdPath)) {
      continue;
    }

    try {
      const content = readFileSync(skillMdPath, 'utf8');

      // Find agent references in Task() calls or subagent_type mentions
      // Pattern: subagent_type="kata-..." or agent="kata-..."
      const agentMatches = content.matchAll(/(?:subagent_type|agent)[=:]["']?(kata-[a-z-]+)["']?/gi);

      for (const match of agentMatches) {
        const agentName = match[1];
        if (!cache[agentName]) {
          cache[agentName] = [];
        }
        if (!cache[agentName].includes(skillDir)) {
          cache[agentName].push(skillDir);
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return cache;
}

/**
 * Get list of skills affected by changes in a git diff.
 *
 * Detects affected skills based on:
 * 1. Direct changes to skills/kata-{name}/ -> skill affected
 * 2. Agent changes: agents/kata-{agent}.md -> find skills that spawn that agent
 *
 * @param {string} [baseBranch='origin/main'] - Base branch for comparison
 * @returns {string[]} Array of skill names (e.g., ['kata-track-progress', 'kata-add-phase'])
 */
export function getAffectedSkills(baseBranch = 'origin/main') {
  let changedFiles;

  try {
    // Get changed files between base branch and HEAD
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD 2>/dev/null`, {
      encoding: 'utf8',
      cwd: KATA_ROOT,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    changedFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    // If git diff fails (e.g., no upstream, detached HEAD), try uncommitted changes
    try {
      const output = execSync('git diff --name-only HEAD 2>/dev/null', {
        encoding: 'utf8',
        cwd: KATA_ROOT,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      changedFiles = output.trim().split('\n').filter(Boolean);
    } catch {
      // If all git commands fail, return empty array
      return [];
    }
  }

  if (changedFiles.length === 0) {
    return [];
  }

  const affectedSkills = new Set();

  for (const file of changedFiles) {
    // Direct skill changes: skills/kata-{name}/...
    const skillMatch = file.match(/^skills\/(kata-[a-z-]+)\//);
    if (skillMatch) {
      affectedSkills.add(skillMatch[1]);
      continue;
    }

    // Agent changes: agents/kata-{agent}.md
    const agentMatch = file.match(/^agents\/(kata-[a-z-]+)\.md$/);
    if (agentMatch) {
      const agentName = agentMatch[1];
      const usingSkills = getSkillsUsingAgent(agentName);
      for (const skill of usingSkills) {
        affectedSkills.add(skill);
      }
    }
  }

  return Array.from(affectedSkills).sort();
}

/**
 * Get list of test files for affected skills.
 *
 * Maps skill names to test file paths and filters to only existing files.
 * Convention: kata-{name} -> tests/skills/{name}.test.js
 *
 * @param {string} [baseBranch='origin/main'] - Base branch for comparison
 * @returns {string[]} Array of test file paths that exist
 */
export function getAffectedTestFiles(baseBranch = 'origin/main') {
  const affectedSkills = getAffectedSkills(baseBranch);
  const testFiles = [];

  for (const skill of affectedSkills) {
    // Convert kata-{name} to {name}
    const testName = skill.replace(/^kata-/, '');
    const testPath = join(KATA_ROOT, 'tests', 'skills', `${testName}.test.js`);

    if (existsSync(testPath)) {
      testFiles.push(testPath);
    }
  }

  return testFiles;
}
