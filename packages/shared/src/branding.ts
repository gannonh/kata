/**
 * Centralized branding assets for Kata Agents
 * Used by OAuth callback pages and branding displays
 */

/** Simple text logo for terminal/ASCII contexts */
export const KATA_LOGO = [
  ' ╦╔═ ╔═╗ ╔╦╗ ╔═╗',
  ' ╠╩╗ ╠═╣  ║  ╠═╣',
  ' ╩ ╩ ╩ ╩  ╩  ╩ ╩',
] as const;

/** Logo as a single string for HTML templates */
export const KATA_LOGO_HTML = KATA_LOGO.map((line) => line.trimEnd()).join('\n');

/** Session viewer base URL - placeholder until kata.sh viewer exists */
export const VIEWER_URL = '';  // Disabled until Kata infrastructure ready
