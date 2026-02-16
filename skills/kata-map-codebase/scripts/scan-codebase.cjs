#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SUPPORTED_EXTENSIONS = [
  'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx',
  'py', 'go', 'rs', 'java',
];

const GENERATED_PATTERNS = [
  /\.generated\.\w+$/,
  /\.gen\.\w+$/,
  /_pb\.\w+$/,
  /_grpc\.\w+$/,
];

const GENERATED_MARKERS = ['@generated', 'DO NOT EDIT'];

const DIR_PURPOSES = {
  components: 'UI components',
  hooks: 'React hooks',
  utils: 'Utility functions',
  util: 'Utility functions',
  lib: 'Shared library code',
  services: 'Service layer',
  service: 'Service layer',
  api: 'API endpoints',
  routes: 'Route definitions',
  types: 'Type definitions',
  models: 'Data models',
  model: 'Data models',
  tests: 'Test files',
  test: 'Test files',
  __tests__: 'Test files',
  middleware: 'Middleware',
  config: 'Configuration',
  scripts: 'Build/utility scripts',
  pages: 'Page components',
  layouts: 'Layout components',
  store: 'State management',
  styles: 'Stylesheets',
  assets: 'Static assets',
  public: 'Public assets',
  controllers: 'Controller layer',
  repositories: 'Data access layer',
  entities: 'Entity definitions',
  schemas: 'Schema definitions',
  fixtures: 'Test fixtures',
  helpers: 'Helper functions',
  constants: 'Constants',
  enums: 'Enumeration definitions',
  interfaces: 'Interface definitions',
  adapters: 'Adapter layer',
  providers: 'Provider layer',
  plugins: 'Plugin modules',
  bin: 'CLI entry points',
};

const SUFFIX_PURPOSES = {
  '.test.ts': 'test files',
  '.test.tsx': 'test files',
  '.test.js': 'test files',
  '.test.jsx': 'test files',
  '.spec.ts': 'test files',
  '.spec.tsx': 'test files',
  '.spec.js': 'test files',
  '.spec.jsx': 'test files',
  '.service.ts': 'service layer',
  '.service.js': 'service layer',
  '.controller.ts': 'controller layer',
  '.controller.js': 'controller layer',
  '.model.ts': 'data model',
  '.model.js': 'data model',
  '.entity.ts': 'entity definition',
  '.entity.js': 'entity definition',
  '.hook.ts': 'React hooks',
  '.hook.tsx': 'React hooks',
  '.component.tsx': 'UI components',
  '.component.jsx': 'UI components',
  '.module.ts': 'module definition',
  '.module.js': 'module definition',
  '.dto.ts': 'data transfer object',
  '.schema.ts': 'schema definition',
  '.util.ts': 'utility functions',
  '.util.js': 'utility functions',
  '.config.ts': 'configuration',
  '.config.js': 'configuration',
  '.config.cjs': 'configuration',
  '.config.mjs': 'configuration',
  '.d.ts': 'type declarations',
};

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

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

function getCurrentCommitHash(projectRoot) {
  return git('git rev-parse --short HEAD', projectRoot);
}

function getTrackedFiles(projectRoot) {
  const raw = git('git ls-files --cached --others --exclude-standard', projectRoot);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).filter(isSupportedFile);
}

function getChangedFiles(projectRoot, sinceCommit) {
  const raw = git(`git diff --name-only --diff-filter=ACMR ${sinceCommit}..HEAD`, projectRoot);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).filter(isSupportedFile);
}

function getDeletedFiles(projectRoot, sinceCommit) {
  const raw = git(`git diff --name-only --diff-filter=D ${sinceCommit}..HEAD`, projectRoot);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

function isSupportedFile(filePath) {
  const ext = filePath.split('.').pop();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

// ---------------------------------------------------------------------------
// Comment stripping
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
// Generated file detection
// ---------------------------------------------------------------------------

function isGeneratedFile(filePath, source) {
  for (const pattern of GENERATED_PATTERNS) {
    if (pattern.test(filePath)) return true;
  }
  // Check first 5 lines for generation markers
  const firstLines = source.split('\n').slice(0, 5).join('\n');
  for (const marker of GENERATED_MARKERS) {
    if (firstLines.includes(marker)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Import/export extraction: JavaScript/TypeScript
// ---------------------------------------------------------------------------

function extractJSImports(source) {
  const cleaned = stripComments(source);
  const packages = [];
  const local = [];

  function classify(importPath) {
    if (!importPath) return;
    // Treat @/ ~/ #/ as local aliases
    if (importPath.startsWith('.') || importPath.startsWith('@/') ||
        importPath.startsWith('~/') || importPath.startsWith('#/')) {
      local.push(importPath);
    } else {
      packages.push(importPath);
    }
  }

  // ES module imports: import X from 'path', import { X } from 'path', import 'path'
  const esImport = /import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\}\s*,?\s*)?(?:\*\s+as\s+\w+\s*,?\s*)?from\s+['"]([^'"]+)['"]/g;
  for (const match of cleaned.matchAll(esImport)) {
    classify(match[3]);
  }

  // Side-effect imports: import 'path'
  const sideEffect = /import\s+['"]([^'"]+)['"]/g;
  for (const match of cleaned.matchAll(sideEffect)) {
    classify(match[1]);
  }

  // CommonJS require
  const cjsRequire = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of cleaned.matchAll(cjsRequire)) {
    classify(match[1]);
  }

  // Dynamic imports
  const dynamicImport = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of cleaned.matchAll(dynamicImport)) {
    classify(match[1]);
  }

  return {
    packages: [...new Set(packages)].sort(),
    local: [...new Set(local)].sort(),
  };
}

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
// Import/export extraction: Python
// ---------------------------------------------------------------------------

function extractPythonImports(source) {
  const cleaned = stripPythonComments(source);
  const packages = [];
  const local = [];

  // from X import Y
  const fromImport = /from\s+([\w.]+)\s+import\s+(.+)/g;
  for (const match of cleaned.matchAll(fromImport)) {
    const pkg = match[1];
    if (pkg.startsWith('.')) {
      local.push(pkg);
    } else {
      packages.push(pkg);
    }
  }

  // import X
  const plainImport = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
  for (const match of cleaned.matchAll(plainImport)) {
    const names = match[1].split(',').map(s => s.trim()).filter(Boolean);
    for (const name of names) {
      packages.push(name);
    }
  }

  return {
    packages: [...new Set(packages)].sort(),
    local: [...new Set(local)].sort(),
  };
}

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
// Import/export extraction: Go
// ---------------------------------------------------------------------------

function extractGoImports(source) {
  const cleaned = stripComments(source);
  const packages = [];

  // Single import
  const singleImport = /import\s+"([^"]+)"/g;
  for (const match of cleaned.matchAll(singleImport)) {
    packages.push(match[1]);
  }

  // Block import
  const blockImport = /import\s*\(([\s\S]*?)\)/g;
  for (const match of cleaned.matchAll(blockImport)) {
    const lines = match[1].split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const pkgMatch = trimmed.match(/(?:\w+\s+)?"([^"]+)"/);
      if (pkgMatch) packages.push(pkgMatch[1]);
    }
  }

  return {
    packages: [...new Set(packages)].sort(),
    local: [],
  };
}

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
// Import/export extraction: Rust
// ---------------------------------------------------------------------------

function extractRustImports(source) {
  const cleaned = stripComments(source);
  const packages = [];
  const local = [];

  const useDecl = /use\s+([\w:]+(?:::\{[^}]+\})?)/g;
  for (const match of cleaned.matchAll(useDecl)) {
    const usePath = match[1];
    if (usePath.startsWith('crate::') || usePath.startsWith('super::') || usePath.startsWith('self::')) {
      local.push(usePath);
    } else {
      packages.push(usePath);
    }
  }

  return {
    packages: [...new Set(packages)].sort(),
    local: [...new Set(local)].sort(),
  };
}

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
// Import/export extraction: Java
// ---------------------------------------------------------------------------

function extractJavaImports(source) {
  const cleaned = stripComments(source);
  const packages = [];

  const importDecl = /import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/g;
  for (const match of cleaned.matchAll(importDecl)) {
    packages.push(match[1]);
  }

  return {
    packages: [...new Set(packages)].sort(),
    local: [],
  };
}

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
// Language dispatch
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

function extractImports(source, lang) {
  switch (lang) {
    case 'js': return extractJSImports(source);
    case 'python': return extractPythonImports(source);
    case 'go': return extractGoImports(source);
    case 'rust': return extractRustImports(source);
    case 'java': return extractJavaImports(source);
    default: return { packages: [], local: [] };
  }
}

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
// File type and layer classification
// ---------------------------------------------------------------------------

function classifyType(filePath) {
  const p = filePath.toLowerCase();
  if (p.includes('.test.') || p.includes('.spec.') || p.includes('/test/') ||
      p.includes('/tests/') || p.includes('/__tests__/')) return 'test';
  if (p.includes('/component') || p.endsWith('.component.tsx') || p.endsWith('.component.jsx')) return 'component';
  if (p.includes('/service') || p.endsWith('.service.ts') || p.endsWith('.service.js')) return 'service';
  if (p.includes('/route') || p.includes('/routes/') || p.includes('/controller') ||
      p.includes('/api/')) return 'route';
  if (p.includes('/model') || p.includes('/models/') || p.includes('/schema') ||
      p.includes('/entity')) return 'model';
  if (p.endsWith('.config.js') || p.endsWith('.config.ts') || p.endsWith('.config.cjs') ||
      p.endsWith('.config.mjs') || p.includes('/config/')) return 'config';
  if (p.includes('/hook') || p.endsWith('.hook.ts') || p.endsWith('.hook.tsx')) return 'hook';
  if (p.includes('/middleware')) return 'middleware';
  return 'util';
}

function classifyLayer(filePath) {
  const p = filePath.toLowerCase();
  if (p.includes('/component') || p.includes('/ui/') || p.includes('/view/') ||
      p.includes('/pages/') || p.includes('/layouts/')) return 'ui';
  if (p.includes('/api/') || p.includes('/route') || p.includes('/controller') ||
      p.includes('/server/')) return 'api';
  if (p.includes('/db/') || p.includes('/data/') || p.includes('/model') ||
      p.includes('/schema') || p.includes('/repository')) return 'data';
  return 'shared';
}

// ---------------------------------------------------------------------------
// Naming convention detection
// ---------------------------------------------------------------------------

function classifyIdentifier(name) {
  if (/^[A-Z][A-Z0-9_]+$/.test(name) && name.includes('_')) return 'SCREAMING_SNAKE';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) return 'PascalCase';
  if (/^[a-z][a-zA-Z0-9]*$/.test(name)) return 'camelCase';
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(name)) return 'snake_case';
  return 'other';
}

function detectConventions(fileIndex) {
  const allExports = [];
  for (const [filePath, entry] of Object.entries(fileIndex)) {
    for (const name of entry.exports) {
      allExports.push({ name, file: filePath });
    }
  }

  if (allExports.length < 5) {
    return {
      pattern: 'insufficient_data',
      confidence: 0,
      sampleSize: allExports.length,
      breakdown: {},
    };
  }

  const counts = {};
  for (const { name } of allExports) {
    const style = classifyIdentifier(name);
    counts[style] = (counts[style] || 0) + 1;
  }

  const total = allExports.length;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0];
  const confidence = dominant[1] / total;

  if (confidence < 0.7) {
    return {
      pattern: 'mixed',
      confidence: Math.round(confidence * 100) / 100,
      sampleSize: total,
      breakdown: counts,
    };
  }

  return {
    pattern: dominant[0],
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: total,
    breakdown: counts,
  };
}

// ---------------------------------------------------------------------------
// Directory purpose detection
// ---------------------------------------------------------------------------

function detectDirectoryPurposes(filePaths) {
  // Group files by parent directory
  const dirFiles = {};
  for (const fp of filePaths) {
    const dir = path.dirname(fp);
    if (!dirFiles[dir]) dirFiles[dir] = [];
    dirFiles[dir].push(fp);
  }

  const directories = {};

  for (const [dir, files] of Object.entries(dirFiles)) {
    const dirName = path.basename(dir);

    // Count suffixes in this directory
    const suffixCounts = {};
    for (const fp of files) {
      for (const suffix of Object.keys(SUFFIX_PURPOSES)) {
        if (fp.endsWith(suffix)) {
          suffixCounts[suffix] = (suffixCounts[suffix] || 0) + 1;
        }
      }
    }

    // Count extensions
    const extCounts = {};
    for (const fp of files) {
      const ext = path.extname(fp);
      if (ext) {
        extCounts[ext] = (extCounts[ext] || 0) + 1;
      }
    }

    // Determine dominant suffix and extension
    const dominantSuffix = Object.entries(extCounts).sort((a, b) => b[1] - a[1])[0];

    // Detect purpose: suffix analysis overrides name-lookup when 3+ files match
    let purpose = null;
    let detectedBy = null;

    // Check suffix-based detection first (needs 3+ matches)
    const topSuffix = Object.entries(suffixCounts).sort((a, b) => b[1] - a[1])[0];
    if (topSuffix && topSuffix[1] >= 3) {
      purpose = SUFFIX_PURPOSES[topSuffix[0]];
      detectedBy = 'suffix-analysis';
    }

    // Fall back to name-based lookup
    if (!purpose && DIR_PURPOSES[dirName]) {
      purpose = DIR_PURPOSES[dirName];
      detectedBy = 'name-lookup';
    }

    if (purpose) {
      directories[dir + '/'] = {
        purpose,
        detectedBy,
        fileCount: files.length,
        dominantSuffix: dominantSuffix ? dominantSuffix[0] : null,
      };
    }
  }

  return directories;
}

// ---------------------------------------------------------------------------
// File suffix pattern detection
// ---------------------------------------------------------------------------

function detectFileSuffixes(filePaths) {
  const suffixCounts = {};
  for (const fp of filePaths) {
    for (const suffix of Object.keys(SUFFIX_PURPOSES)) {
      if (fp.endsWith(suffix)) {
        if (!suffixCounts[suffix]) {
          suffixCounts[suffix] = { purpose: SUFFIX_PURPOSES[suffix], count: 0 };
        }
        suffixCounts[suffix].count += 1;
      }
    }
  }
  return suffixCounts;
}

// ---------------------------------------------------------------------------
// Scan a single file
// ---------------------------------------------------------------------------

function scanFile(filePath, projectRoot, commitHash, now) {
  const fullPath = path.join(projectRoot, filePath);
  let source;
  try {
    source = fs.readFileSync(fullPath, 'utf8');
  } catch {
    return null;
  }

  if (isGeneratedFile(filePath, source)) return null;

  const lang = getLanguage(filePath);
  if (!lang) return null;

  const imports = extractImports(source, lang);
  const exports = extractExports(source, lang);

  return {
    exports,
    imports,
    type: classifyType(filePath),
    layer: classifyLayer(filePath),
    lastIndexed: commitHash,
    indexedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Incremental merge
// ---------------------------------------------------------------------------

function mergeIndex(existing, scanned, deletedFiles) {
  const merged = {};

  // Copy existing entries
  if (existing.files) {
    for (const [k, v] of Object.entries(existing.files)) {
      merged[k] = v;
    }
  }

  // Remove deleted files
  for (const f of deletedFiles) {
    delete merged[f];
  }

  // Add/update scanned files
  for (const [filePath, entry] of Object.entries(scanned)) {
    merged[filePath] = entry;
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

function computeStats(fileIndex) {
  const byType = {};
  const byLayer = {};
  const byExtension = {};

  for (const [filePath, entry] of Object.entries(fileIndex)) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
    byLayer[entry.layer] = (byLayer[entry.layer] || 0) + 1;
    const ext = path.extname(filePath);
    if (ext) {
      byExtension[ext] = (byExtension[ext] || 0) + 1;
    }
  }

  return {
    totalFiles: Object.keys(fileIndex).length,
    byType,
    byLayer,
    byExtension,
  };
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    incremental: false,
    since: null,
    pathFilter: null,
  };

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--incremental') {
      args.incremental = true;
    } else if (argv[i] === '--since' && argv[i + 1]) {
      args.since = argv[i + 1];
      i++;
    } else if (argv[i] === '--path' && argv[i + 1]) {
      args.pathFilter = argv[i + 1];
      i++;
    }
  }

  if (args.incremental && !args.since) {
    throw new Error('--incremental requires --since COMMIT');
  }

  return args;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv);
  const projectRoot = resolveProjectRoot();
  const commitHash = getCurrentCommitHash(projectRoot);
  const now = new Date().toISOString();
  const intelDir = path.join(projectRoot, '.planning', 'intel');

  fs.mkdirSync(intelDir, { recursive: true });

  // Discover files
  let filesToScan;
  let deletedFiles = [];

  if (args.incremental) {
    filesToScan = getChangedFiles(projectRoot, args.since);
    deletedFiles = getDeletedFiles(projectRoot, args.since);
    if (args.pathFilter) {
      filesToScan = filesToScan.filter(f => f.startsWith(args.pathFilter));
      deletedFiles = deletedFiles.filter(f => f.startsWith(args.pathFilter));
    }
  } else {
    filesToScan = getTrackedFiles(projectRoot);
    if (args.pathFilter) {
      filesToScan = filesToScan.filter(f => f.startsWith(args.pathFilter));
    }
  }

  // Scan files
  const scannedFiles = {};
  for (const filePath of filesToScan) {
    const entry = scanFile(filePath, projectRoot, commitHash, now);
    if (entry) {
      scannedFiles[filePath] = entry;
    }
  }

  // Build or merge file index
  let fileIndex;
  if (args.incremental) {
    const existingPath = path.join(intelDir, 'index.json');
    let existing = {};
    if (fileExists(existingPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      } catch {
        existing = {};
      }
    }
    fileIndex = mergeIndex(existing, scannedFiles, deletedFiles);
  } else {
    fileIndex = scannedFiles;
  }

  // Build index.json v2
  const indexJson = {
    version: 2,
    generated: now,
    source: 'code-scan',
    generatedBy: 'scan-codebase',
    commitHash,
    files: fileIndex,
    stats: computeStats(fileIndex),
  };

  // Build conventions.json v2
  const allFilePaths = Object.keys(fileIndex);
  const namingConventions = detectConventions(fileIndex);
  const directoryPurposes = detectDirectoryPurposes(allFilePaths);
  const fileSuffixes = detectFileSuffixes(allFilePaths);

  const conventionsJson = {
    version: 2,
    generated: now,
    commitHash,
    naming: {
      exports: namingConventions,
    },
    directories: directoryPurposes,
    fileSuffixes,
  };

  // Write output
  fs.writeFileSync(
    path.join(intelDir, 'index.json'),
    JSON.stringify(indexJson, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(intelDir, 'conventions.json'),
    JSON.stringify(conventionsJson, null, 2) + '\n'
  );

  // Report
  const mode = args.incremental ? 'incremental' : 'full';
  console.log(`scan-codebase.cjs: ${mode} scan complete`);
  console.log(`  commit: ${commitHash}`);
  console.log(`  files scanned: ${Object.keys(scannedFiles).length}`);
  console.log(`  files indexed: ${Object.keys(fileIndex).length}`);
  if (args.incremental && deletedFiles.length > 0) {
    console.log(`  files removed: ${deletedFiles.length}`);
  }
  console.log(`  naming pattern: ${namingConventions.pattern} (confidence: ${namingConventions.confidence}, samples: ${namingConventions.sampleSize})`);
  console.log(`  directories mapped: ${Object.keys(directoryPurposes).length}`);
  console.log(`  output: ${intelDir}/`);
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

module.exports = {
  stripComments,
  stripPythonComments,
  extractJSImports,
  extractJSExports,
  extractPyImports: extractPythonImports,
  extractPyExports: extractPythonExports,
  extractGoImports,
  extractGoExports,
  classifyIdentifier,
  detectConventions,
  mergeIndex,
  isGeneratedFile,
  classifyType,
  classifyLayer,
  scanFile,
  computeStats,
  detectDirectoryPurposes,
  detectFileSuffixes,
};

// Run as CLI when executed directly
if (require.main === module) {
  try {
    main();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`scan-codebase.cjs failed: ${message}`);
    process.exit(1);
  }
}
