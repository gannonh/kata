import { existsSync } from 'fs';
import { join } from 'path';
import { seedSystemSkills } from '../workspaces/storage.ts';

/**
 * Format session lifecycle context for injection into user messages.
 * Returns a context block for new sessions, empty string for continuing sessions.
 *
 * @param isNewSession - True if this is the first message in the session
 * @param workspaceRootPath - Absolute path to the workspace root
 */
export function formatSessionLifecycleContext(
  isNewSession: boolean,
  workspaceRootPath: string
): string {
  if (!isNewSession) return '';

  // Backfill system skills into workspaces created before seeding existed
  seedSystemSkills(workspaceRootPath);

  const specSkillPath = join(workspaceRootPath, 'skills', 'spec-elicitation', 'SKILL.md');
  const hasSpecSkill = existsSync(specSkillPath);

  return `<session_lifecycle>
This is a new project session with no prior conversation.${
    hasSpecSkill
      ? '\nThe spec-elicitation skill is available. Use it to guide the user through intent capture and specification development.'
      : ''
  }
</session_lifecycle>`;
}
