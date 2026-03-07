# Codebase Concerns

**Analysis Date:** 2026-01-29

## Tech Debt

**Incomplete Feature: Right Sidebar Panels:**
- Issue: Two planned panels in right sidebar are stubbed as "Coming soon" without implementation
- Files: `apps/electron/src/renderer/components/app-shell/RightSidebar.tsx`
- Impact: Users cannot browse session files or view session history through the UI. These features are blocked at the component level
- Fix approach: Implement `SessionFilesPanel` and `SessionHistoryPanel` components following the existing metadata panel pattern in `apps/electron/src/renderer/components/right-sidebar/`

**Unsaved Git Bash Path Configuration:**
- Issue: Windows Git Bash path validation happens but path is not persisted to config
- Files: `apps/electron/src/main/ipc.ts` (line 820)
- Impact: On Windows, users must reconfigure Git Bash path on every app restart
- Fix approach: Uncomment and implement persistence to config storage after validation succeeds

**Large Monolithic Components:**
- Issue: Multiple React components exceed 1800+ lines with complex internal state management
- Files:
  - `apps/electron/src/renderer/components/app-shell/AppShell.tsx` (3119 lines)
  - `apps/electron/src/renderer/components/app-shell/input/FreeFormInput.tsx` (1857 lines)
  - `packages/ui/src/components/chat/TurnCard.tsx` (1783 lines)
- Impact: Difficult to maintain, test, and debug. Hard to reuse sub-features. High chance of hidden state bugs
- Fix approach: Extract stateful logic into custom hooks. Break into smaller presentational components. Consider state management refactor

**Session Management Complexity:**
- Issue: Complex error recovery logic in `craft-agent.ts` handles session expiration, SDK crashes, and diagnostics
- Files: `packages/shared/src/agent/craft-agent.ts` (3053 lines, ~60 debug log statements for session recovery)
- Impact: Session recovery paths are difficult to trace and test. Recovery logic is intertwined with error handling
- Fix approach: Extract recovery state machine into separate module. Add dedicated test suite for each recovery path

## Known Bugs

**Pre-encoded Base64 Auth Handling:**
- Symptoms: Old BasicAuthCredential format using pre-encoded base64 fails to parse correctly
- Files: `packages/shared/src/sources/__tests__/basic-auth.test.ts` (line 205)
- Trigger: When legacy config stores credentials as pre-encoded base64 instead of plaintext
- Workaround: Migration utility exists to convert old format, but not automatically applied on startup

**Intermediate Text Streaming Display:**
- Symptoms: During intermediate text streaming in tool execution, UI showed tool spinners instead of "Thinking..." status
- Files: `packages/ui/src/components/chat/__tests__/turn-phase.test.ts` (line 263)
- Trigger: When agent sends intermediate text tokens while waiting for tool results
- Workaround: Fixed in current version, but no regression test prevents reintroduction

## Security Considerations

**Credentials Encryption at Rest:**
- Risk: All API keys, OAuth tokens, and sensitive credentials stored in single encrypted file (`credentials.enc`)
- Files: `packages/shared/src/credentials/` (AES-256-GCM encryption)
- Current mitigation: Uses Node.js crypto with AES-256-GCM, encryption key derived from system keyring
- Recommendations:
  - Document key derivation method in SECURITY.md
  - Add automatic credential rotation on security updates
  - Consider per-credential key derivation instead of single master key
  - Test crash recovery doesn't leave unencrypted temp files

**File Path Access Control:**
- Risk: IPC handler validates file paths but only against home directory and /tmp
- Files: `apps/electron/src/main/ipc.ts` (lines 59-130)
- Current mitigation: Validates absolute paths, resolves symlinks, blocks sensitive patterns
- Recommendations:
  - Add allow-list of specific accessible directories (more restrictive than current approach)
  - Test Windows and macOS symlink resolution edge cases
  - Document exact sensitive patterns being blocked

**Cross-Platform Path Handling:**
- Risk: Session persistence uses cross-platform path conversion but symlinks could bypass restrictions
- Files: `packages/shared/src/sessions/persistence-queue.ts`, `packages/shared/src/utils/paths.ts`
- Current mitigation: Uses `realpath()` to resolve symlinks, normalizes path separators
- Recommendations:
  - Add Windows junction point detection
  - Test behavior with network mounts and cloud storage shortcuts
  - Add path validation tests for each platform

**Shell Command Execution Permissions:**
- Risk: Permission mode system controls bash execution, but SDK subprocess runs with user privileges
- Files: `packages/shared/src/agent/permissions-config.ts`, `packages/shared/src/agent/craft-agent.ts`
- Current mitigation: Three-level permission modes (safe/ask/allow-all), tool execution hooks
- Recommendations:
  - Document which shell operations bypass permission checking (env vars, directory changes)
  - Add audit log for all executed bash commands
  - Consider sandboxing SDK subprocess for high-risk operations

## Performance Bottlenecks

**Large File Attachment Processing:**
- Problem: Image validation and file conversion happens synchronously on main thread
- Files: `apps/electron/src/main/ipc.ts` (file attachment handlers), `packages/shared/src/utils/file-handling.ts`
- Cause: MarkItDown conversion and image validation blocks UI during attachment upload
- Improvement path:
  - Move attachment processing to worker thread
  - Implement streaming for large file conversions
  - Add progress callback for multi-file uploads
  - Consider lazy conversion of attachments

**Session Persistence Debouncing:**
- Problem: 500ms debounce on session writes creates lag before persistence completes
- Files: `packages/shared/src/sessions/persistence-queue.ts` (line 22)
- Cause: Debounce coalesces rapid writes but delays all writes equally
- Improvement path:
  - Use adaptive debounce based on message size
  - Implement priority queue for critical updates (metadata, permissions)
  - Add flush-on-exit handler for clean shutdown
  - Consider WAL (write-ahead log) for faster acknowledgment

**ANSI Code Parsing:**
- Problem: Terminal output parsing with regex for every ANSI sequence
- Files: `packages/ui/src/components/terminal/ansi-parser.ts`
- Cause: Regex-based parsing is O(n) and repeated for every log line
- Improvement path:
  - Pre-compile regex patterns
  - Consider state machine parser for better performance
  - Memoize parsed sequences
  - Add performance test for large terminal outputs (>10MB)

**Source Server Building:**
- Problem: All credential loading and server building happens sequentially
- Files: `apps/electron/src/main/sessions.ts` (lines 84-130)
- Cause: Sequential Promise.all() without parallelization
- Improvement path:
  - Parallelize independent server builds
  - Cache compiled MCP servers
  - Lazy-load sources only when needed

## Fragile Areas

**Session Recovery State Machine:**
- Files: `packages/shared/src/agent/craft-agent.ts` (lines 1800-1950)
- Why fragile: Multiple conditional branches handle SDK errors, session expiration, and network issues. Order matters but isn't enforced
- Safe modification: Add enum for recovery states before modifying logic
- Test coverage: Only 3 agent tests exist, none cover recovery paths comprehensively
- Risks:
  - New error condition may not match existing detection logic
  - Recovery order (retry vs clear vs diagnostics) is hard-coded
  - Adding new error types requires changes in multiple places

**File Attachment Path Resolution:**
- Files: `apps/electron/src/main/ipc.ts` (file path validation)
- Why fragile: Windows and Unix path handling differs significantly (symlinks, junctions, case sensitivity)
- Safe modification: Add platform-specific tests before changing path normalization
- Test coverage: No test coverage for path validation on each platform
- Risks:
  - Symlink traversal could bypass security restrictions
  - Network path handling varies between Windows and macOS
  - UNC paths on Windows may be handled incorrectly

**Permission Mode Cycling:**
- Files: `apps/electron/src/renderer/components/app-shell/AppShell.tsx` (permission mode switching logic)
- Why fragile: SHIFT+TAB hotkey cycles modes but interaction with other keyboard handlers not tested
- Safe modification: Add E2E tests for mode cycling before changing keyboard handling
- Test coverage: Hotkey interaction not covered by unit tests
- Risks:
  - Mode change doesn't persist correctly if session changes simultaneously
  - Multiple rapid hotkey presses could cause state inconsistency

**MCP Server Connection Lifecycle:**
- Files: `packages/shared/src/mcp/client.ts`, `apps/electron/src/main/sessions.ts`
- Why fragile: Server lifecycle (startup, auth refresh, shutdown) has implicit ordering dependencies
- Safe modification: Document startup sequence and add state enum for server lifecycle
- Test coverage: No integration tests for full server lifecycle
- Risks:
  - Auth token refresh during tool execution could cause request failure
  - Server shutdown doesn't guarantee pending requests complete
  - Reconnection logic doesn't handle partial failures gracefully

## Scaling Limits

**Session Storage on Single Filesystem:**
- Current capacity: ~10,000 sessions per workspace (estimated, untested)
- Limit: Session listing scans entire filesystem for each workspace
- Scaling path:
  - Implement session index file instead of directory scan
  - Add pagination to session list UI
  - Consider archive/cleanup for old sessions
  - Benchmark with 1000+ sessions

**Memory Usage with Large Sessions:**
- Current capacity: ~500MB session loaded in memory (rough estimate)
- Limit: Full session with all messages loaded into memory for display
- Scaling path:
  - Implement virtual scrolling in session view
  - Load messages in chunks (pagination)
  - Cache only recent messages in memory
  - Profile memory usage with 10,000+ message sessions

**Concurrent MCP Server Instances:**
- Current capacity: ~5-10 MCP servers before performance degrades
- Limit: Each workspace can spawn many server processes
- Scaling path:
  - Implement server connection pooling
  - Add resource limit configuration per workspace
  - Monitor subprocess count and throttle new connections
  - Document recommended limits per system spec

## Dependencies at Risk

**@anthropic-ai/claude-agent-sdk Version Pinning:**
- Risk: SDK is critical dependency but pinned to ^0.2.19, may have breaking changes
- Impact: New SDK version could break entire agent functionality
- Migration plan:
  - Maintain compatibility shim layer
  - Add test suite that validates SDK interface
  - Establish upgrade cadence (quarterly review)
  - Consider private fork for critical stability

**Electron Version Compatibility:**
- Risk: Electron 39.x is very recent, may have platform-specific bugs
- Files: `package.json` (electron: ^39.2.7)
- Impact: Auto-updates could introduce regressions. Limited community vetting
- Migration plan:
  - Pin to LTS versions once released
  - Maintain test suite for major Electron APIs
  - Subscribe to Electron security advisories

**Native Dependencies (electron-builder, Sentry):**
- Risk: Binary compilation dependencies required for builds
- Files: `package.json` (electron-builder, @sentry/electron)
- Impact: Build failures on new OS versions or architecture changes
- Recommendations:
  - Test builds on each platform before releases
  - Document minimum system requirements
  - Consider containerized build environment

## Missing Critical Features

**Session Backup/Export:**
- Problem: No user-facing way to backup sessions or export to portable format
- Blocks: Users can't move sessions between workspaces or machines
- Implementation: Export endpoint needed in IPC layer

**Activity Audit Log:**
- Problem: No record of which tools were executed, what permissions were granted
- Blocks: No way to investigate security incidents or permission abuse
- Implementation: Add audit log storage and UI viewer

**Permission Policy Templates:**
- Problem: Permission configurations must be set per-workspace from scratch
- Blocks: Organizations can't enforce security policies across users
- Implementation: Add permission template system with preset configurations

## Test Coverage Gaps

**Session Recovery Paths:**
- What's not tested: SDK error detection, session expiration recovery, diagnostic system
- Files: `packages/shared/src/agent/craft-agent.ts` (lines 1800+)
- Risk: New error type could cause infinite loops or data loss in recovery
- Priority: High

**Cross-Platform File Operations:**
- What's not tested: Path validation on Windows with symlinks/junctions, macOS with aliases, Linux with bind mounts
- Files: `apps/electron/src/main/ipc.ts` (file validation)
- Risk: Security restriction bypass on platforms with untested path types
- Priority: High

**Permission Mode Persistence:**
- What's not tested: Mode persists correctly across app restarts, mode change during async operations
- Files: `apps/electron/src/renderer/components/app-shell/AppShell.tsx`
- Risk: Mode resets unexpectedly, user gets unsafe defaults
- Priority: Medium

**MCP Server Lifecycle:**
- What's not tested: Full startup/auth/shutdown sequence, partial failure recovery, reconnection scenarios
- Files: `packages/shared/src/mcp/client.ts`, `apps/electron/src/main/sessions.ts`
- Risk: Server hangs, stale connections, orphaned processes
- Priority: High

**Large File Handling:**
- What's not tested: Attachment upload >100MB, image validation with malformed headers, streaming conversion
- Files: `packages/shared/src/utils/file-handling.ts`
- Risk: Out of memory, UI freeze, security bypass with crafted files
- Priority: Medium

**Config Migration:**
- What's not tested: Upgrading from old config formats, schema validation errors, partial migrations
- Files: `packages/shared/src/config/storage.ts`
- Risk: Config corruption on upgrade, feature flags not applied correctly
- Priority: Medium

---

*Concerns audit: 2026-01-29*
