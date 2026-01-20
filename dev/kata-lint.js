#!/usr/bin/env node
// Kata output template linter
// Detects anti-pattern: output templates wrapped in code blocks containing renderable markdown

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const dim = '\x1b[2m';
const reset = '\x1b[0m';

/**
 * Extract code blocks from markdown content
 * Returns array of { content, startLine, hasLanguage }
 */
function extractCodeBlocks(content) {
  const blocks = [];
  const lines = content.split('\n');
  let inBlock = false;
  let blockContent = [];
  let blockStartLine = 0;
  let hasLanguage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match opening triple backticks (with optional language specifier)
    if (!inBlock && /^```(\w+)?$/.test(line.trim())) {
      inBlock = true;
      blockStartLine = i + 1; // 1-indexed
      hasLanguage = /^```\w+$/.test(line.trim());
      blockContent = [];
    } else if (inBlock && line.trim() === '```') {
      // Closing triple backticks
      blocks.push({
        content: blockContent.join('\n'),
        startLine: blockStartLine,
        hasLanguage
      });
      inBlock = false;
    } else if (inBlock) {
      blockContent.push(line);
    }
  }

  return blocks;
}

/**
 * Check if content contains renderable markdown
 */
function hasRenderableMarkdown(content) {
  const patterns = [
    { regex: /\|.+\|.+\|/, name: 'table' },           // Tables: | col | col |
    { regex: /\*\*[^*]+\*\*/, name: 'bold' },         // Bold: **text**
    { regex: /<sub>.*<\/sub>/i, name: '<sub> tag' },  // Sub tags
    { regex: /^##?\s+.+/m, name: 'heading' },         // Headings: ## text
  ];

  const found = [];
  for (const { regex, name } of patterns) {
    if (regex.test(content)) {
      found.push(name);
    }
  }
  return found;
}

/**
 * Check context around a code block to determine if it's an output template
 */
function isLikelyOutputTemplate(content, blockStartLine, blockContent) {
  const lines = content.split('\n');

  // Check 10 lines before the block for output template signals
  const contextStart = Math.max(0, blockStartLine - 11);
  const contextEnd = blockStartLine - 1;
  const contextBefore = lines.slice(contextStart, contextEnd).join('\n').toLowerCase();

  const outputSignals = [
    'output this',
    'present results',
    'present this',
    'display this',
    'show this',
    'render this',
    'output:',
    'template:',
  ];

  const hasOutputSignal = outputSignals.some(signal => contextBefore.includes(signal));

  // Check for Kata UI patterns in the block content
  const kataPatterns = [
    /kata\s*>/i,                     // KATA > banner
    /##\s*▶\s*next action/i,         // ## ▶ Next Action
    /───+/,                          // Horizontal separator lines
    /<sub>.*\/clear.*<\/sub>/i,      // /clear hints
  ];

  const hasKataPattern = kataPatterns.some(pattern => pattern.test(blockContent));

  return hasOutputSignal || hasKataPattern;
}

/**
 * Check if block is in a documentation section (DO/DON'T examples)
 */
function isInDocumentationSection(content, blockStartLine) {
  const lines = content.split('\n');

  // Check 20 lines before for DO/DON'T markers or "Anti-Patterns" section
  const contextStart = Math.max(0, blockStartLine - 21);
  const contextEnd = blockStartLine - 1;
  const contextBefore = lines.slice(contextStart, contextEnd).join('\n');

  const docMarkers = [
    /\*\*DO:\*\*/i,
    /\*\*DON'T:\*\*/i,
    /\*\*DO\*\*:/i,
    /\*\*DON'T\*\*:/i,
    /## Anti-Patterns/i,
    /### Anti-Patterns/i,
    /Bad one-liner:/i,
    /Good one-liner:/i,
    /<!-- BAD -->/i,
    /<!-- GOOD -->/i,
  ];

  return docMarkers.some(marker => marker.test(contextBefore));
}

/**
 * Lint a single markdown file
 * Returns array of violations
 */
function lintFile(filePath) {
  const violations = [];

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return violations;
  }

  const blocks = extractCodeBlocks(content);

  for (const block of blocks) {
    // Skip blocks with language specifiers (bash, js, etc.) - legitimate code
    if (block.hasLanguage) continue;

    // Check for renderable markdown
    const renderableTypes = hasRenderableMarkdown(block.content);
    if (renderableTypes.length === 0) continue;

    // Skip if in documentation section
    if (isInDocumentationSection(content, block.startLine)) continue;

    // Check if it looks like an output template
    if (isLikelyOutputTemplate(content, block.startLine, block.content)) {
      // Extract preview (first 2 non-empty lines)
      const previewLines = block.content
        .split('\n')
        .filter(l => l.trim())
        .slice(0, 2)
        .map(l => l.substring(0, 50) + (l.length > 50 ? '...' : ''));

      violations.push({
        file: filePath,
        line: block.startLine,
        types: renderableTypes,
        preview: previewLines
      });
    }
  }

  return violations;
}

/**
 * Get staged markdown files
 */
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8'
    });
    return output
      .split('\n')
      .filter(f => f.endsWith('.md'))
      .map(f => path.resolve(f));
  } catch (e) {
    return [];
  }
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip hidden directories, node_modules, .git
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') {
        continue;
      }
      findMarkdownFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Expand a path argument to file list (handles directories)
 */
function expandPath(filePath) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return [];
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return findMarkdownFiles(resolved);
  } else if (stat.isFile() && resolved.endsWith('.md')) {
    return [resolved];
  }

  return [];
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const isStaged = args.includes('--staged');

  let files = [];

  if (isStaged) {
    files = getStagedFiles();
  } else {
    // Filter out flags and expand paths (handles directories)
    const pathArgs = args.filter(a => !a.startsWith('--'));
    for (const p of pathArgs) {
      files = files.concat(expandPath(p));
    }
  }

  if (files.length === 0) {
    process.exit(0);
  }

  let allViolations = [];

  for (const file of files) {
    const violations = lintFile(file);
    allViolations = allViolations.concat(violations);
  }

  if (allViolations.length > 0) {
    console.error(`\n${red}Output template lint errors:${reset}\n`);

    for (const v of allViolations) {
      const relPath = path.relative(process.cwd(), v.file);
      console.error(`${yellow}${relPath}:${v.line}:${reset} Output template in code block contains ${v.types.join(', ')} that won't render`);
      if (v.preview.length > 0) {
        console.error(`  ${dim}Preview: ${v.preview[0]}${reset}`);
        if (v.preview[1]) {
          console.error(`  ${dim}         ${v.preview[1]}${reset}`);
        }
      }
      console.error('');
    }

    console.error(`${dim}Fix: Remove triple backticks around output templates. Use "Output this markdown directly:" instead.${reset}\n`);
    process.exit(1);
  }

  process.exit(0);
}

main();
