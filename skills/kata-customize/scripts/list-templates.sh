#!/usr/bin/env bash
# Usage: list-templates.sh
# Discovers all schema-backed templates from sibling skill directories
# Output: JSON array of template metadata to stdout
# Exit: Always 0
set -euo pipefail

# Sibling discovery: scripts/ -> kata-customize/ -> skills/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SKILLS_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd -P)"

SKILLS_DIR="$SKILLS_DIR" node << 'NODE_EOF'
const fs = require('fs');
const path = require('path');

try {
  const skillsDir = process.env.SKILLS_DIR;
  const templates = [];
  const skillDirs = fs.readdirSync(skillsDir).filter(d => d.startsWith('kata-'));

  for (const skillDir of skillDirs) {
    const refsDir = path.join(skillsDir, skillDir, 'references');
    if (!fs.existsSync(refsDir)) continue;

    const files = fs.readdirSync(refsDir).filter(f => f.endsWith('.md'));
    for (const filename of files) {
      const filePath = path.join(refsDir, filename);
      const content = fs.readFileSync(filePath, 'utf8');

      const schemaMatch = content.match(/<!--\s*kata-template-schema\n([\s\S]*?)-->/);
      if (!schemaMatch) continue;

      const schema = schemaMatch[1];

      // Parse required fields
      const reqFm = schema.match(/required-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
      const reqBody = schema.match(/required-fields:[\s\S]*?body:\s*\[([^\]]*)\]/);

      // Parse optional fields
      const optFm = schema.match(/optional-fields:\s*\n\s*frontmatter:\s*\[([^\]]*)\]/);
      const optBody = schema.match(/optional-fields:[\s\S]*?body:\s*\[([^\]]*)\]/);

      const parseList = (match) => {
        if (!match || !match[1].trim()) return [];
        return match[1].split(',').map(f => f.trim()).filter(Boolean);
      };

      // Extract description from first heading (any level)
      const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
      const description = headingMatch ? headingMatch[1] : filename;

      // Check if project override exists
      const overridePath = path.join(process.cwd(), '.planning', 'templates', filename);
      const hasOverride = fs.existsSync(overridePath);

      templates.push({
        filename,
        skill: skillDir,
        description,
        hasOverride,
        required: {
          frontmatter: parseList(reqFm),
          body: parseList(reqBody)
        },
        optional: {
          frontmatter: parseList(optFm),
          body: parseList(optBody)
        }
      });
    }
  }

  console.log(JSON.stringify(templates, null, 2));
} catch (e) {
  console.log('[]');
}
NODE_EOF

exit 0
