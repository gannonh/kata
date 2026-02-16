#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx',
  'py', 'go', 'rs', 'java',
]);

// ---------------------------------------------------------------------------
// Project root detection
// ---------------------------------------------------------------------------

function resolveProjectRoot() {
  const envRoot = process.env.KATA_PROJECT_ROOT;
  if (envRoot) {
    const resolved = path.resolve(envRoot);
    if (dirExists(path.join(resolved, '.planning'))) return resolved;
  }
  const cwd = process.cwd();
  for (const candidate of [cwd, path.join(cwd, 'main')]) {
    if (dirExists(path.join(candidate, '.planning'))) return path.resolve(candidate);
  }
  throw new Error(
    'Could not find project root. Expected .planning/ in CWD or CWD/main, or set KATA_PROJECT_ROOT.'
  );
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Comment stripping (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function stripComments(source) {
  // Remove block comments /* ... */
  let result = source.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments but not URLs (://), hashbangs (#!), or Python comments
  result = result.replace(/(?<!:)\/\/(?!\/).*$/gm, '');
  return result;
}

function stripPythonComments(source) {
  // Remove Python triple-quoted strings used as comments (simplified)
  let result = source.replace(/"""[\s\S]*?"""/g, '""""""');
  result = result.replace(/'''[\s\S]*?'''/g, "''''''");
  // Remove single-line comments
  result = result.replace(/#.*$/gm, '');
  return result;
}

// ---------------------------------------------------------------------------
// Identifier classification (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function classifyIdentifier(name) {
  if (/^[A-Z][A-Z0-9_]+$/.test(name) && name.includes('_')) return 'SCREAMING_SNAKE';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  return 'other';
}

// ---------------------------------------------------------------------------
// Language dispatch (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function getLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.js': case '.mjs': case '.cjs':
    case '.ts': case '.mts': case '.cts':
    case '.jsx': case '.tsx':
      return 'js';
    case '.py':
      return 'python';
    case '.go':
      return 'go';
    case '.rs':
      return 'rust';
    case '.java':
      return 'java';
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Export extraction: JavaScript/TypeScript (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function extractJSExports(source) {
  const cleaned = stripComments(source);
  const exports = [];

  // Named exports: export const/let/var/function/class/type/interface/enum NAME
  const named = /export\s+(?:const|let|var|function\*?|class|type|interface|enum|async\s+function)\s+(\w+)/g;
  for (const match of cleaned.matchAll(named)) {
    exports.push(match[1]);
  }

  // Default export with name: export default function/class NAME
  const defaultNamed = /export\s+default\s+(?:function\*?|class)\s+(\w+)/g;
  for (const match of cleaned.matchAll(defaultNamed)) {
    exports.push(match[1]);
  }

  // Re-exports: export { X, Y } from 'path'
  const reExport = /export\s*\{([^}]+)\}/g;
  for (const match of cleaned.matchAll(reExport)) {
    const names = match[1].split(',').map(s => {
      const trimmed = s.trim();
      // Handle 'X as Y' -- use original name
      const parts = trimmed.split(/\s+as\s+/);
      return parts[0].trim();
    }).filter(Boolean).filter(n => n !== 'default' && n !== 'type');
    exports.push(...names);
  }

  // module.exports = { name1, name2 }
  const cjsExports = /module\.exports\s*=\s*\{([^}]+)\}/g;
  for (const match of cleaned.matchAll(cjsExports)) {
    const names = match[1].split(',').map(s => s.trim().split(/[\s:]/)[0].trim());
    exports.push(...names.filter(Boolean));
  }

  // module.exports = NAME or exports.NAME
  const cjsSingle = /module\.exports\s*=\s*(\w+)\s*[;\n]/g;
  for (const match of cleaned.matchAll(cjsSingle)) {
    if (match[1] !== '{' && match[1] !== 'class' && match[1] !== 'function') {
      exports.push(match[1]);
    }
  }

  return [...new Set(exports)].sort();
}

// ---------------------------------------------------------------------------
// Export extraction: Python (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function extractPythonExports(source) {
  const cleaned = stripPythonComments(source);
  const exports = [];

  // class Name
  const classDef = /^class\s+(\w+)/gm;
  for (const match of cleaned.matchAll(classDef)) {
    exports.push(match[1]);
  }

  // def name (top-level only, no leading whitespace)
  const funcDef = /^def\s+(\w+)/gm;
  for (const match of cleaned.matchAll(funcDef)) {
    if (!match[1].startsWith('_')) {
      exports.push(match[1]);
    }
  }

  return [...new Set(exports)].sort();
}

// ---------------------------------------------------------------------------
// Export extraction: Go (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function extractGoExports(source) {
  const cleaned = stripComments(source);
  const exports = [];

  // Exported functions (capitalized)
  const funcDecl = /func\s+(?:\(\w+\s+\*?\w+\)\s+)?([A-Z]\w*)/g;
  for (const match of cleaned.matchAll(funcDecl)) {
    exports.push(match[1]);
  }

  // Exported types
  const typeDecl = /type\s+([A-Z]\w*)/g;
  for (const match of cleaned.matchAll(typeDecl)) {
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

// ---------------------------------------------------------------------------
// Export extraction: Rust (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function extractRustExports(source) {
  const cleaned = stripComments(source);
  const exports = [];

  // pub fn name
  const pubFn = /pub\s+(?:async\s+)?fn\s+(\w+)/g;
  for (const match of cleaned.matchAll(pubFn)) {
    exports.push(match[1]);
  }

  // pub struct/enum/trait/type
  const pubType = /pub\s+(?:struct|enum|trait|type)\s+(\w+)/g;
  for (const match of cleaned.matchAll(pubType)) {
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

// ---------------------------------------------------------------------------
// Export extraction: Java (copied from scan-codebase.cjs)
// ---------------------------------------------------------------------------

function extractJavaExports(source) {
  const cleaned = stripComments(source);
  const exports = [];

  // public class/interface/enum/record
  const pubDecl = /public\s+(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/g;
  for (const match of cleaned.matchAll(pubDecl)) {
    exports.push(match[1]);
  }

  return [...new Set(exports)].sort();
}

// ---------------------------------------------------------------------------
// Extraction dispatch
// ---------------------------------------------------------------------------

function extractExports(source, lang) {
  switch (lang) {
    case 'js': return extractJSExports(source);
    case 'python': return extractPythonExports(source);
    case 'go': return extractGoExports(source);
    case 'rust': return extractRustExports(source);
    case 'java': return extractJavaExports(source);
    default: return [];
  }
}

// ---------------------------------------------------------------------------
// Convention checking
// ---------------------------------------------------------------------------

function isSupportedFile(filePath) {
  const ext = filePath.split('.').pop();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function checkConventions(filePaths, conventionsPath, projectRoot) {
  // Filter to supported extensions
  const supported = filePaths.filter(isSupportedFile);

  // Read conventions.json
  let conventions;
  try {
    conventions = JSON.parse(fs.readFileSync(conventionsPath, 'utf8'));
  } catch {
    return { violations: [], checked: 0, skipped: 'conventions.json missing or unreadable' };
  }

  const expectedPattern = conventions.naming && conventions.naming.exports && conventions.naming.exports.pattern;
  const confidence = (conventions.naming && conventions.naming.exports && conventions.naming.exports.confidence) || 0;

  // Skip conditions
  if (!expectedPattern || expectedPattern === 'insufficient_data' || expectedPattern === 'mixed') {
    return { violations: [], checked: 0, skipped: 'insufficient convention data' };
  }
  if (confidence < 0.7) {
    return { violations: [], checked: 0, skipped: `low confidence (${confidence})` };
  }
  if (supported.length === 0) {
    return { violations: [], checked: 0, skipped: 'no supported code files in input' };
  }

  const violations = [];
  let checked = 0;

  for (const filePath of supported) {
    const fullPath = path.join(projectRoot, filePath);
    let source;
    try {
      source = fs.readFileSync(fullPath, 'utf8');
    } catch {
      continue; // file might not exist or be unreadable
    }

    const lang = getLanguage(filePath);
    if (!lang) continue;

    const exports = extractExports(source, lang);
    checked++;

    for (const name of exports) {
      const style = classifyIdentifier(name);
      if (style !== expectedPattern && style !== 'other') {
        violations.push({
          file: filePath,
          type: 'naming',
          export: name,
          found: style,
          expected: expectedPattern,
          severity: 'warning',
        });
      }
    }
  }

  return {
    violations,
    checked,
    passed: checked - new Set(violations.map(v => v.file)).size,
    conventionPattern: expectedPattern,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    files: [],
    conventions: null,
  };

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--files') {
      i++;
      while (i < argv.length && !argv[i].startsWith('--')) {
        args.files.push(argv[i]);
        i++;
      }
      i--; // back up one since the loop will increment
    } else if (argv[i] === '--conventions' && argv[i + 1]) {
      args.conventions = argv[i + 1];
      i++;
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  const projectRoot = resolveProjectRoot();
  const conventionsPath = args.conventions || path.join(projectRoot, '.planning', 'intel', 'conventions.json');

  const result = checkConventions(args.files, conventionsPath, projectRoot);
  console.log(JSON.stringify(result, null, 2));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { checkConventions };

if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check-conventions.cjs failed: ${message}`);
    process.exit(0); // Always exit 0 (non-blocking)
  }
}
