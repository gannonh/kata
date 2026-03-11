import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { debug } from '../utils/debug.ts';

interface ManifestSection {
  file: string;
  required?: boolean;
}

interface Manifest {
  sections: ManifestSection[];
}

/** Cache: templatesDir -> assembled (pre-interpolation) template string */
const templateCache = new Map<string, string>();

/**
 * Replace {{variableName}} placeholders with values from the variables map.
 * Supports dotted names like {{DOC_REFS.sources}}.
 * Unknown variables are left as-is.
 */
export function interpolateVariables(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (match: string, key: string): string => {
    const trimmed = key.trim();
    return trimmed in variables ? variables[trimmed]! : match;
  });
}

/**
 * Load prompt template sections from a manifest, concatenate them,
 * and interpolate variables. Results are cached per directory.
 *
 * @param templatesDir - Absolute path to the templates directory
 * @param variables - Key-value pairs for interpolation
 * @returns The assembled and interpolated prompt string
 */
export function loadPromptTemplates(
  templatesDir: string,
  variables: Record<string, string>
): string {
  let assembled = templateCache.get(templatesDir);

  if (!assembled) {
    const manifestPath = join(templatesDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Template manifest not found: ${manifestPath}`);
    }

    const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const parts: string[] = [];

    for (const section of manifest.sections) {
      const filePath = join(templatesDir, section.file);

      if (!existsSync(filePath)) {
        if (section.required) {
          throw new Error(`Required template section not found: ${section.file}`);
        }
        debug(`[template-loader] Skipping missing optional section: ${section.file}`);
        continue;
      }

      const content = readFileSync(filePath, 'utf-8').trim();
      if (content) {
        parts.push(content);
      }
    }

    assembled = parts.join('\n\n');
    templateCache.set(templatesDir, assembled);
    debug(`[template-loader] Loaded ${parts.length} sections from ${templatesDir}`);
  }

  return interpolateVariables(assembled, variables);
}

/**
 * Clear the template cache. Call when workspace changes.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}
