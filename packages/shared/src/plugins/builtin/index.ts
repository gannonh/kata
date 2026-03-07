/**
 * Builtin Plugins
 *
 * All first-party plugins bundled with Kata Agents.
 * The PluginManager loads these during initialization.
 */

import type { KataPlugin } from '../types.ts';
import { slackPlugin } from './slack-plugin.ts';
import { whatsappPlugin } from './whatsapp-plugin.ts';

const BUILTIN_PLUGINS: readonly KataPlugin[] = [slackPlugin, whatsappPlugin];

/** Return all builtin first-party plugins. */
export function getBuiltinPlugins(): readonly KataPlugin[] {
  return BUILTIN_PLUGINS;
}
