import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

/**
 * Migration validation tests for v1.6.0 Skills-Native Subagents.
 *
 * Validates:
 * 1. Every agent has a corresponding instruction file with matching content
 * 2. No remaining custom subagent_type patterns in skills
 * 3. Skills that spawn agents use instruction files with agent-instructions wrapper
 */

/**
 * Agent-to-skill mapping. Each agent maps to a primary skill where its
 * instruction file lives. The instruction file path is:
 *   skills/{skillName}/references/{agentNameWithoutKataPrefix}-instructions.md
 */
const AGENT_MAPPINGS = {
  'kata-planner': 'kata-plan-phase',
  'kata-executor': 'kata-execute-phase',
  'kata-plan-checker': 'kata-plan-phase',
  'kata-phase-researcher': 'kata-plan-phase',
  'kata-project-researcher': 'kata-add-milestone',
  'kata-research-synthesizer': 'kata-add-milestone',
  'kata-roadmapper': 'kata-add-milestone',
  'kata-integration-checker': 'kata-audit-milestone',
  'kata-debugger': 'kata-debug',
  'kata-verifier': 'kata-verify-work',
  'kata-codebase-mapper': 'kata-track-progress',
  'kata-code-reviewer': 'kata-review-pull-requests',
  'kata-code-simplifier': 'kata-review-pull-requests',
  'kata-comment-analyzer': 'kata-review-pull-requests',
  'kata-pr-test-analyzer': 'kata-review-pull-requests',
  'kata-type-design-analyzer': 'kata-review-pull-requests',
  'kata-failure-finder': 'kata-review-pull-requests',
  'kata-silent-failure-hunter': 'kata-review-pull-requests',
  'kata-entity-generator': 'kata-review-pull-requests'
};

/**
 * Extract body content from an agent markdown file (everything after YAML frontmatter).
 */
function extractAgentBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1].trim() : content.trim();
}

/**
 * Recursively find all markdown files in a directory.
 */
function findMarkdownFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findMarkdownFiles(fullPath, files);
    } else if (entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Migration validation: agent-to-instruction-file mappings', () => {
  test('all 19 agents have corresponding instruction files', () => {
    const agentNames = Object.keys(AGENT_MAPPINGS);
    assert.strictEqual(agentNames.length, 19, `Expected 19 agent mappings, got ${agentNames.length}`);

    const errors = [];

    for (const [agentName, skillName] of Object.entries(AGENT_MAPPINGS)) {
      const shortName = agentName.replace(/^kata-/, '');
      const instructionPath = path.join(ROOT, 'skills', skillName, 'references', `${shortName}-instructions.md`);

      if (!fs.existsSync(instructionPath)) {
        errors.push(`${agentName}: instruction file not found at skills/${skillName}/references/${shortName}-instructions.md`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Missing instruction files:\n${errors.join('\n')}`);
    }
  });

  test('instruction file content matches agent body', () => {
    const errors = [];

    for (const [agentName, skillName] of Object.entries(AGENT_MAPPINGS)) {
      const agentPath = path.join(ROOT, 'agents', `${agentName}.md`);
      const shortName = agentName.replace(/^kata-/, '');
      const instructionPath = path.join(ROOT, 'skills', skillName, 'references', `${shortName}-instructions.md`);

      if (!fs.existsSync(agentPath) || !fs.existsSync(instructionPath)) {
        errors.push(`${agentName}: agent or instruction file missing, cannot compare`);
        continue;
      }

      const agentContent = fs.readFileSync(agentPath, 'utf8');
      const instructionContent = fs.readFileSync(instructionPath, 'utf8');
      const agentBody = extractAgentBody(agentContent);
      const instructionBody = instructionContent.trim();

      if (agentBody !== instructionBody) {
        // Show first difference for debugging
        const agentLines = agentBody.split('\n');
        const instrLines = instructionBody.split('\n');
        let diffLine = -1;
        const maxLines = Math.max(agentLines.length, instrLines.length);
        for (let i = 0; i < maxLines; i++) {
          if (agentLines[i] !== instrLines[i]) {
            diffLine = i + 1;
            break;
          }
        }
        errors.push(
          `${agentName}: body mismatch with instruction file ` +
          `(agent: ${agentBody.length} chars, instruction: ${instructionBody.length} chars, ` +
          `first diff at line ${diffLine})`
        );
      }
    }

    if (errors.length > 0) {
      assert.fail(`Content mismatches:\n${errors.join('\n')}`);
    }
  });
});

describe('Migration validation: no remaining custom subagent types', () => {
  test('zero custom subagent_type patterns in skills', () => {
    const skillsDir = path.join(ROOT, 'skills');
    const files = findMarkdownFiles(skillsDir);
    const errors = [];

    // Match both subagent_type="kata:kata-*" and subagent_type="kata-*"
    const customTypePatterns = [
      /subagent_type="kata:kata-[^"]*"/g,
      /subagent_type="kata-[^"]*"/g
    ];

    for (const file of files) {
      const relativePath = path.relative(ROOT, file);
      // Exclude this test file itself
      if (relativePath.includes('migration-validation')) continue;

      const content = fs.readFileSync(file, 'utf8');

      for (const pattern of customTypePatterns) {
        // Reset regex lastIndex
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          errors.push(`${relativePath}: found custom subagent type: ${match[0]}`);
        }
      }
    }

    if (errors.length > 0) {
      assert.fail(`Custom subagent_type patterns found:\n${errors.join('\n')}`);
    }
  });
});

describe('Migration validation: skills reference instruction files correctly', () => {
  /**
   * Skills that spawn agents via Task() must:
   * 1. Reference -instructions.md files
   * 2. Use subagent_type="general-purpose"
   * 3. Include agent-instructions wrapper tags
   */
  const SKILLS_WITH_AGENTS = [
    'kata-plan-phase',
    'kata-add-milestone',
    'kata-audit-milestone',
    'kata-debug',
    'kata-execute-quick-task',
    'kata-research-phase',
    'kata-execute-phase'
  ];

  test('skills that spawn agents reference instruction files', () => {
    const errors = [];

    for (const skillName of SKILLS_WITH_AGENTS) {
      const skillDir = path.join(ROOT, 'skills', skillName);
      const files = findMarkdownFiles(skillDir);
      const allContent = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

      if (!allContent.includes('-instructions.md')) {
        errors.push(`${skillName}: no reference to -instructions.md files`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Skills missing instruction file references:\n${errors.join('\n')}`);
    }
  });

  test('skills that spawn agents use general-purpose subagent type', () => {
    const errors = [];

    for (const skillName of SKILLS_WITH_AGENTS) {
      const skillDir = path.join(ROOT, 'skills', skillName);
      const files = findMarkdownFiles(skillDir);
      const allContent = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

      if (!allContent.includes('subagent_type="general-purpose"')) {
        errors.push(`${skillName}: does not use subagent_type="general-purpose"`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Skills not using general-purpose subagent type:\n${errors.join('\n')}`);
    }
  });

  test('skills that spawn agents use agent-instructions wrapper', () => {
    const errors = [];

    for (const skillName of SKILLS_WITH_AGENTS) {
      const skillDir = path.join(ROOT, 'skills', skillName);
      const files = findMarkdownFiles(skillDir);
      const allContent = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

      if (!allContent.includes('agent-instructions')) {
        errors.push(`${skillName}: does not use agent-instructions wrapper tags`);
      }
    }

    if (errors.length > 0) {
      assert.fail(`Skills missing agent-instructions wrapper:\n${errors.join('\n')}`);
    }
  });
});
