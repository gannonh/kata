/**
 * Channel Config Delivery
 *
 * Reads channel configuration from disk and delivers it to the daemon via IPC.
 * Loads all workspace channel configs, resolves credentials, and sends
 * a configure_channels command to the daemon.
 *
 * Called on two trigger points:
 * 1. Daemon reaches 'running' state (initial delivery via deliverChannelConfigs)
 * 2. Channel IPC mutations via scheduleChannelConfigDelivery (debounced to coalesce rapid changes)
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { DaemonManager } from './daemon-manager'
import type { ChannelConfig } from '@craft-agent/shared/channels'
import { getWorkspaces } from '@craft-agent/shared/config'
import type { CredentialManager } from '@craft-agent/shared/credentials'
import { mainLog } from './logger'

/** Slug validation — duplicates ipc.ts isValidSlug (intentional to avoid circular dependency) */
const VALID_SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export interface WorkspaceChannelPayload {
  workspaceId: string
  configs: ChannelConfig[]
  tokens: Record<string, string>
  enabledPlugins: string[]
}

/**
 * Load all enabled channel configs across all workspaces, resolve their
 * credentials, and send a configure_channels command to the daemon.
 *
 * Always sends the command even if no workspaces have channels, so the
 * daemon can clear previously running adapters.
 *
 * @param daemonManager - The daemon manager instance
 * @param credentialManagerGetter - Getter to avoid circular dependency between daemon-manager and credentials
 */
export async function deliverChannelConfigs(
  daemonManager: DaemonManager,
  credentialManagerGetter: () => CredentialManager,
): Promise<void> {
  if (daemonManager.getState() !== 'running') {
    return
  }

  const workspaces = getWorkspaces()
  const credManager = credentialManagerGetter()

  const workspacePayloads: WorkspaceChannelPayload[] = []

  for (const workspace of workspaces) {
    const rootPath = workspace.rootPath.replace(/^~/, homedir())
    const channelsDir = join(rootPath, 'channels')

    if (!existsSync(channelsDir)) {
      continue
    }

    let slugs: string[]
    try {
      slugs = readdirSync(channelsDir)
    } catch (err) {
      mainLog.warn(`[channel-config-delivery] Cannot read channels directory for workspace ${workspace.id}:`, err)
      continue
    }

    const configs: ChannelConfig[] = []
    const tokens: Record<string, string> = {}

    for (const slug of slugs) {
      if (!VALID_SLUG_RE.test(slug)) {
        continue
      }

      const configPath = join(channelsDir, slug, 'config.json')
      if (!existsSync(configPath)) {
        continue
      }

      let config: ChannelConfig
      try {
        const raw = readFileSync(configPath, 'utf-8')
        config = JSON.parse(raw) as ChannelConfig
      } catch (err) {
        mainLog.error(`[channel-config-delivery] Skipping malformed config at "${configPath}" (workspace: ${workspace.id}, slug: "${slug}"):`, err)
        continue
      }

      if (!config.enabled) {
        continue
      }

      // Resolve credential: channelSlug (preferred) then sourceSlug (legacy fallback)
      if (config.credentials.channelSlug) {
        const token = await credManager.getChannelCredential(workspace.id, config.credentials.channelSlug)
        if (token) {
          tokens[config.credentials.channelSlug] = token
        } else {
          mainLog.warn(`[channel-config-delivery] Missing credential for channel "${slug}" (channelSlug: ${config.credentials.channelSlug})`)
        }
      } else if (config.credentials.sourceSlug) {
        const cred = await credManager.get({
          type: 'source_apikey',
          workspaceId: workspace.id,
          sourceId: config.credentials.sourceSlug,
        })
        if (cred?.value) {
          tokens[config.credentials.sourceSlug] = cred.value
        } else {
          mainLog.warn(`[channel-config-delivery] Missing source credential for channel "${slug}" (sourceSlug: ${config.credentials.sourceSlug})`)
        }
      }

      // Resolve app-level token for Socket Mode (slash commands)
      if (config.credentials.appTokenSlug) {
        const appToken = await credManager.getChannelCredential(workspace.id, config.credentials.appTokenSlug)
        if (appToken) {
          tokens[config.credentials.appTokenSlug] = appToken
        } else {
          mainLog.warn(`[channel-config-delivery] Missing app-level token for channel "${slug}" (appTokenSlug: ${config.credentials.appTokenSlug})`)
        }
      }

      configs.push(config)
    }

    if (configs.length > 0) {
      const adapterTypes = new Set(configs.map((c) => c.adapter))
      // Map adapter types to plugin IDs (slack → kata-slack, whatsapp → kata-whatsapp)
      const pluginIds = Array.from(adapterTypes).map(type => `kata-${type}`)
      workspacePayloads.push({
        workspaceId: workspace.id,
        configs,
        tokens,
        enabledPlugins: pluginIds,
      })
    }
  }

  // Always send, even if empty (clears previously running adapters)
  daemonManager.sendCommand({
    type: 'configure_channels',
    workspaces: workspacePayloads,
  })
}

/**
 * Debounced wrapper for IPC mutation triggers.
 * Coalesces rapid consecutive calls (e.g., config write + credential set)
 * so only the final filesystem state is delivered to the daemon.
 */
let deliveryTimer: ReturnType<typeof setTimeout> | null = null

export function scheduleChannelConfigDelivery(
  daemonManager: DaemonManager,
  credentialManagerGetter: () => CredentialManager,
): void {
  if (deliveryTimer) clearTimeout(deliveryTimer)
  deliveryTimer = setTimeout(() => {
    deliveryTimer = null
    deliverChannelConfigs(daemonManager, credentialManagerGetter).catch((err) => {
      mainLog.error('[channel-config-delivery] Scheduled delivery failed:', err)
    })
  }, 100)
}
