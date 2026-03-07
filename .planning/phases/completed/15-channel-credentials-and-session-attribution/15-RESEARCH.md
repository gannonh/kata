# Phase 15: Channel Credentials and Session Attribution - Research

**Researched:** 2026-02-10
**Domain:** Credential storage extension, session type augmentation, JSONL persistence
**Confidence:** HIGH

## Summary

Phase 15 closes two implementation gaps identified during Phase 14 verification: Gap 1 (Channel Credential Storage) and Gap 4 (Session Channel Attribution). Both gaps are well-scoped internal changes to existing systems with no new external dependencies.

Channel credential storage needs a new credential type (`channel_credential`) in the existing `CredentialManager` system. The current `ChannelConfig.credentials.sourceSlug` pattern references source credentials, but no source type exists for channel auth. Adding a dedicated credential type using the existing `CredentialId` system is the clean solution.

Session channel attribution is partially implemented. The `channel` field already exists on `SessionConfig`, `SessionHeader`, `SessionMetadata`, and `SessionMeta` in the shared and renderer layers. The gaps are: (1) `jsonl.ts` does not serialize/deserialize the `channel` field, (2) `createSession` in `storage.ts` does not accept a `channel` parameter, (3) the core `Session` type in `packages/core` lacks the field, and (4) the daemon has no code path to create sessions with channel attribution.

**Primary recommendation:** Use the existing credential manager infrastructure with a new `channel_credential` type. Fix the JSONL serialization gap for session channel attribution. Both changes are additive and backward-compatible.

## Standard Stack

No new libraries needed. This phase extends existing infrastructure.

### Core (Existing)
| Library | Version | Purpose | Status |
| --- | --- | --- | --- |
| CredentialManager | internal | AES-256-GCM encrypted credential CRUD | Extend with new type |
| JSONL persistence | internal | Session header/message serialization | Fix missing field |
| Jotai atoms | existing | Renderer state management | Already has `channel` field |

### No New Dependencies
This phase is purely internal. All required infrastructure exists.

## Architecture Patterns

### Recommended Approach: Option A (Dedicated Channel Credentials)

The gap analysis lists three options. Option A is the correct choice.

**Why Option A:**
- The existing `CredentialType` union (`source_oauth`, `source_bearer`, etc.) is designed for source credentials. Channels are not sources.
- The existing `CredentialId` system supports workspace-scoped keys with arbitrary discriminators.
- The `CredentialManager` already handles CRUD, encryption, and listing with filters.
- A new `channel_credential` type follows the established pattern without conceptual confusion.

**Why NOT Option B (Inline in channel config):**
- Channel configs are JSON files on disk at `{rootPath}/channels/{slug}/config.json`. Storing secrets in config files, even encrypted, violates the existing security model where all secrets live in `credentials.enc`.
- The IPC handlers (`CHANNELS_GET`, `CHANNELS_UPDATE`) pass config objects through IPC. Credential values in those objects would transit through the IPC bridge.

**Why NOT Option C (Piggyback on sources):**
- Sources are MCPs, APIs, and folders. Creating a fake source to hold channel credentials is conceptually confusing and couples two unrelated systems.
- The brainstorm recommendation says "compose with existing Source infrastructure" for OAuth flows, not for credential storage types.

### Credential Key Format

Follow the existing `credentialIdToAccount` pattern:

```
channel_credential::{workspaceId}::{channelSlug}
```

Example: `channel_credential::ws-abc123::my-slack-channel`

### Changes Required for Credential Storage

1. **`packages/shared/src/credentials/types.ts`** - Add `'channel_credential'` to the `CredentialType` union and `VALID_CREDENTIAL_TYPES` array. Add to the source-like credential handling in `credentialIdToAccount`/`accountToCredentialId`.

2. **`packages/shared/src/credentials/manager.ts`** - Add convenience methods for channel credentials (get/set/delete by workspaceId + channelSlug).

3. **`packages/shared/src/channels/types.ts`** - Change `ChannelConfig.credentials` from `{ sourceSlug: string }` to support either source reference or direct channel credential reference. A simple approach: add an optional `channelSlug` field alongside `sourceSlug`, with one or the other populated.

4. **IPC layer** - Add `CHANNEL_CREDENTIAL_SET` and `CHANNEL_CREDENTIAL_DELETE` handlers, or extend existing `CHANNELS_UPDATE` to handle credential storage separately.

### Changes Required for Session Channel Attribution

Five files need changes:

1. **`packages/shared/src/sessions/jsonl.ts`** - Add `channel` to `createSessionHeader()` (line ~133) and `readSessionJsonl()` (line ~58-79).

2. **`packages/shared/src/sessions/storage.ts`** - Add `channel` to `createSession()` options parameter.

3. **`packages/core/src/types/session.ts`** - Add `channel?: { adapter: string; slug: string; displayName?: string }` to the core `Session` interface. (Optional but recommended for type consistency across packages.)

4. **`packages/shared/src/daemon/channel-runner.ts`** - When enqueueing a message, attach channel metadata to the message so downstream session creation can propagate it.

5. **Daemon session creation path** - When the daemon creates a session for a channel message, pass the `channel` field through to `createSession()`.

### Anti-Patterns to Avoid

- **Storing credentials in channel config JSON** - Config files are not encrypted, pass through IPC, and may be read by multiple processes. Credentials belong in `credentials.enc`.
- **Using source slugs for channel credentials** - This creates a dependency between two unrelated concepts. A user deleting a source should not break a channel's credential reference.
- **Adding channel field to core Session without updating downstream** - The core type is used for type-checking across packages. If you add `channel` there, ensure all consumers handle it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
| --- | --- | --- | --- |
| Encrypted credential storage | Custom encryption for channel creds | `CredentialManager.set()` / `.get()` | AES-256-GCM, key derivation, atomic writes already handled |
| Credential key format | Custom key string building | `credentialIdToAccount()` / `accountToCredentialId()` | Delimiter handling, type validation already handled |
| Session persistence | Custom file writing for channel field | Extend `createSessionHeader()` / `readSessionJsonl()` | Atomic writes, portable paths, resilient parsing already handled |
| Session ID generation for daemon sessions | Custom ID generation | `resolveSessionKey()` from `session-resolver.ts` | SHA-256 hash-based, collision-resistant, already tested |

## Common Pitfalls

### Pitfall 1: JSONL Header Field Omission
**What goes wrong:** Adding `channel` to `SessionConfig` and `SessionHeader` types but forgetting to include it in `createSessionHeader()` and `readSessionJsonl()` in `jsonl.ts`. These functions manually pick fields (not spread), so new fields are silently dropped.
**Why it happens:** The JSONL functions use explicit field listing, not `...session`. Easy to add a field to the type and forget the serialization.
**How to avoid:** After adding any field to `SessionConfig`, grep for `createSessionHeader` and `readSessionJsonl` and verify the field appears in both.
**Warning signs:** Session list shows no channel badge even though sessions have channel data set at creation time.

### Pitfall 2: Credential Type Validation Mismatch
**What goes wrong:** Adding `channel_credential` to the `CredentialType` union but forgetting to add it to `VALID_CREDENTIAL_TYPES` array or the `isSourceCredential()` check. The `accountToCredentialId()` parser will return `null` for channel credential keys.
**Why it happens:** `types.ts` has three separate locations that need updating for a new credential type: the type union, the validation array, and the key parsing logic.
**How to avoid:** Add a test that round-trips a `channel_credential` through `credentialIdToAccount()` and `accountToCredentialId()`.
**Warning signs:** `CredentialManager.list()` returns no channel credentials despite successful `set()` calls.

### Pitfall 3: ChannelConfig Backward Compatibility
**What goes wrong:** Changing `ChannelConfig.credentials` from `{ sourceSlug: string }` to a new shape breaks existing channel configs on disk.
**Why it happens:** Channel configs are JSON files at `{rootPath}/channels/{slug}/config.json`. Existing configs reference `sourceSlug`.
**How to avoid:** Make the change additive. Keep `sourceSlug` as optional and add `channelSlug` as an alternative. The `ChannelRunner` credential resolution should check both.
**Warning signs:** Existing channels fail to start after the update because credential resolution returns null.

### Pitfall 4: IPC Credential Exposure
**What goes wrong:** Passing credential values through IPC in channel config objects. The renderer should never see raw credential values.
**Why it happens:** If credentials are stored inline in `ChannelConfig`, the `CHANNELS_GET` handler returns them to the renderer.
**How to avoid:** Store credentials via `CredentialManager` (separate from config). The renderer only needs to know whether a credential exists (boolean), not its value.
**Warning signs:** Opening DevTools in the renderer shows credential values in IPC message logs.

### Pitfall 5: Core Type Drift
**What goes wrong:** The core `Session` type in `packages/core/src/types/session.ts` diverges from the shared `SessionConfig` type. The core type is minimal (lacks many fields the shared type has). Adding `channel` only to shared but not core creates inconsistency.
**Why it happens:** The core package is documented as a future migration target. Types are maintained independently.
**How to avoid:** Either add to both, or document the intentional divergence. The shared types are the source of truth for production code.
**Warning signs:** Type errors when consuming sessions across package boundaries.

## Code Examples

### Adding a New Credential Type

Current credential type pattern in `types.ts`:

```typescript
// packages/shared/src/credentials/types.ts

// 1. Add to union
export type CredentialType =
  | 'anthropic_api_key'
  | 'claude_oauth'
  | 'workspace_oauth'
  | 'source_oauth'
  | 'source_bearer'
  | 'source_apikey'
  | 'source_basic'
  | 'channel_credential';  // NEW

// 2. Add to validation array
const VALID_CREDENTIAL_TYPES: readonly CredentialType[] = [
  'anthropic_api_key',
  'claude_oauth',
  'workspace_oauth',
  'source_oauth',
  'source_bearer',
  'source_apikey',
  'source_basic',
  'channel_credential',  // NEW
] as const;

// 3. Add channel credential types array (parallel to SOURCE_CREDENTIAL_TYPES)
const CHANNEL_CREDENTIAL_TYPES = ['channel_credential'] as const;

function isChannelCredential(type: CredentialType): boolean {
  return (CHANNEL_CREDENTIAL_TYPES as readonly string[]).includes(type);
}

// 4. Update credentialIdToAccount for channel_credential::{workspaceId}::{channelSlug}
// Uses same pattern as source credentials but with channelSlug instead of sourceId
```

### Extending ChannelConfig Credentials

```typescript
// packages/shared/src/channels/types.ts

export interface ChannelConfig {
  slug: string;
  enabled: boolean;
  adapter: string;
  pollIntervalMs?: number;
  credentials: {
    /** Source slug whose credentials this channel uses (legacy/alternative) */
    sourceSlug?: string;
    /** Channel slug for dedicated channel credentials */
    channelSlug?: string;
  };
  filter?: ChannelFilter;
}
```

### Fixing JSONL Serialization

```typescript
// packages/shared/src/sessions/jsonl.ts - createSessionHeader()
// Add channel field alongside other metadata fields:

export function createSessionHeader(session: StoredSession): SessionHeader {
  return {
    // ... existing fields ...
    channel: session.channel,  // ADD THIS
    // Pre-computed fields
    messageCount: session.messages.length,
    // ...
  };
}

// readSessionJsonl() - add channel to the returned object:
return {
  // ... existing fields ...
  channel: header.channel,  // ADD THIS
  messages,
  tokenUsage: header.tokenUsage,
};
```

### Channel Runner Credential Resolution (Updated)

```typescript
// packages/shared/src/daemon/channel-runner.ts - startAll()
// Updated to support both sourceSlug and channelSlug:

const token = config.credentials.channelSlug
  ? wsConfig.tokens.get(config.credentials.channelSlug)
  : wsConfig.tokens.get(config.credentials.sourceSlug!);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
| --- | --- | --- | --- |
| `credentials.sourceSlug` only | Dual `sourceSlug` / `channelSlug` | Phase 15 | Channels can have dedicated credentials |
| No channel field in JSONL | `channel` persisted in JSONL header | Phase 15 | Channel badge renders from persisted data |

**Already in place (from Phase 14):**
- `channel` field on `SessionConfig`, `SessionHeader`, `SessionMetadata` (shared/sessions/types.ts)
- `channel` field on renderer `Session` and `SessionMeta` types
- Channel badge rendering code in `SessionList.tsx` (lines 395-412)
- `extractSessionMeta()` propagates `channel` field

**Still missing (this phase):**
- `channel` in JSONL serialization (createSessionHeader, readSessionJsonl)
- `channel` in createSession options
- Channel credential type in CredentialManager
- ChannelConfig.credentials dual-reference support
- Core Session type alignment (optional)

## Open Questions

1. **Should `channel_credential` use `sourceId` or a new `channelSlug` field on `CredentialId`?**
   - What we know: The current `CredentialId` has `sourceId` as an optional field. Reusing it for channel slugs would work mechanically but is semantically confusing.
   - What's unclear: Whether adding a `channelSlug` field to `CredentialId` is worth the type expansion, or if repurposing `sourceId` (which is just a string discriminator) is acceptable.
   - Recommendation: Add a `channelSlug` field. The `CredentialId` interface should be clear about what it identifies. The field cost is one optional string.

2. **Should the core `Session` type in `packages/core` be updated?**
   - What we know: The core type is minimal and documented as a future migration target. The shared types are the production source of truth. Many fields exist in shared but not core (todoState, labels, permissionMode, etc.).
   - What's unclear: Whether aligning core now creates maintenance burden or simplifies future migration.
   - Recommendation: Skip for now. The core type is intentionally minimal and the migration is deferred. Focus on shared types where the field is actually used.

3. **How should credential resolution work in the configure_channels command?**
   - What we know: The `configure_channels` DaemonCommand sends `tokens: Record<string, string>` keyed by source slug. The daemon's `ChannelRunner` looks up tokens by `config.credentials.sourceSlug`.
   - What's unclear: Whether the main process (which sends `configure_channels`) should resolve channel credentials separately from source credentials, or merge them into the same `tokens` map.
   - Recommendation: Merge into the same `tokens` map. The daemon doesn't need to know whether a token came from a source credential or a channel credential. The main process resolves credentials before sending them.

## Sources

### Primary (HIGH confidence)
- Codebase analysis of `packages/shared/src/credentials/types.ts` - credential type system, key format
- Codebase analysis of `packages/shared/src/credentials/manager.ts` - CRUD operations, convenience methods
- Codebase analysis of `packages/shared/src/sessions/jsonl.ts` - JSONL serialization, field handling
- Codebase analysis of `packages/shared/src/sessions/types.ts` - SessionConfig, SessionHeader, SessionMetadata (channel field present)
- Codebase analysis of `apps/electron/src/renderer/atoms/sessions.ts` - SessionMeta (channel field present)
- Codebase analysis of `apps/electron/src/shared/types.ts` - renderer Session (channel field present)
- Codebase analysis of `packages/shared/src/daemon/channel-runner.ts` - credential resolution, adapter configuration
- Codebase analysis of `packages/core/src/types/session.ts` - core Session type (channel field absent)
- Gap analysis at `.planning/phases/completed/14-ui-integration/gaps.txt`

### Secondary (MEDIUM confidence)
- Brainstorm SUMMARY at `.planning/brainstorms/2026-02-07T06-16-brainstorm/SUMMARY.md` - architectural decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, purely internal changes
- Architecture: HIGH - follows established patterns, extending existing credential system
- Pitfalls: HIGH - identified from direct code analysis of serialization and type validation patterns

**Research date:** 2026-02-10
**Valid until:** 2026-03-10 (stable internal architecture, no external dependencies to go stale)
