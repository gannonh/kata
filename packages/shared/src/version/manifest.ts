import { debug } from "../utils/debug";

// Disable version manifest until kata.sh hosts it
// Was: 'https://agents.craft.do/electron'
const VERSIONS_URL = '';

export async function getLatestVersion(): Promise<string | null> {
    // Version checking is disabled until kata.sh hosts a version manifest
    if (!VERSIONS_URL) {
      debug('[manifest] Version checking disabled (no VERSIONS_URL configured)');
      return null;
    }

    try {
      const response = await fetch(`${VERSIONS_URL}/latest`);
      const data = await response.json();
      const version = (data as { version?: string }).version;
      if (typeof version !== 'string') {
        debug('[manifest] Latest version is not a valid string');
        return null;
      }
      return version ?? null;
    } catch (error) {
      debug(`[manifest] Failed to get latest version: ${error}`);
    }
    return null;
}

export async function getManifest(version: string): Promise<VersionManifest | null> {
    // Version manifest is disabled until kata.sh hosts it
    if (!VERSIONS_URL) {
      debug('[manifest] Manifest disabled (no VERSIONS_URL configured)');
      return null;
    }

    try {
        const url = `${VERSIONS_URL}/${version}/manifest.json`;
        debug(`[manifest] Getting manifest for version: ${url}`);
        const response = await fetch(url);
        const data = await response.json();
        return data as VersionManifest;
    } catch (error) {
        debug(`[manifest] Failed to get manifest: ${error}`);
    }
    return null;
}


export interface BinaryInfo {
  url: string;
  sha256: string;
  size: number;
  filename?: string;
}

export interface VersionManifest {
  version: string;
  build_time: string;
  build_timestamp: number;
  binaries: Record<string, BinaryInfo>;
}
