/**
 * Channel Session Resolver
 *
 * Deterministic mapping from channel thread identifiers to daemon session keys.
 * Produces collision-resistant session IDs using SHA-256 hashing.
 */
import { createHash } from 'crypto';

/**
 * Derive a stable session key from channel + thread context.
 *
 * Format: daemon-{channelSlug}-{hash12}
 * where hash12 is the first 12 hex characters of SHA-256("{channelSlug}:{workspaceId}:{threadKey}[:r{resetCount}]").
 * threadKey is threadId if defined, otherwise channelSourceId.
 * resetCount > 0 appends a suffix to produce a new session key after conversation reset.
 */
export function resolveSessionKey(
  channelSlug: string,
  workspaceId: string,
  threadId: string | undefined,
  channelSourceId: string,
  resetCount: number = 0,
): string {
  const threadKey = threadId ?? channelSourceId;
  const suffix = resetCount > 0 ? `:r${resetCount}` : '';
  const input = `${channelSlug}:${workspaceId}:${threadKey}${suffix}`;
  const hash = createHash('sha256').update(input).digest('hex').slice(0, 12);
  return `daemon-${channelSlug}-${hash}`;
}
