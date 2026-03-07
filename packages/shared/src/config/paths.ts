/**
 * Centralized path configuration for Kata Agents.
 *
 * Supports multi-instance development via KATA_CONFIG_DIR environment variable.
 * When running from a numbered folder (e.g., kata-agents-1), the detect-instance.sh
 * script sets KATA_CONFIG_DIR to ~/.kata-agents-1, allowing multiple instances to run
 * simultaneously with separate configurations.
 *
 * Default (non-numbered folders): ~/.kata-agents/
 * Instance 1 (-1 suffix): ~/.kata-agents-1/
 * Instance 2 (-2 suffix): ~/.kata-agents-2/
 */

import { homedir } from 'os';
import { join } from 'path';

// Allow override via environment variable for multi-instance dev
// Supports KATA_CONFIG_DIR and legacy CRAFT_CONFIG_DIR
export const CONFIG_DIR = process.env.KATA_CONFIG_DIR || process.env.CRAFT_CONFIG_DIR || join(homedir(), '.kata-agents');
