# S05 Packaged Build Acceptance

Date: 2026-04-01  
Issue: KAT-2102  
Build: `apps/desktop/release/Kata Desktop-0.0.0-arm64.dmg`

## Checklist

| Criterion | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| DMG build | `bun run desktop:dist:mac` produces DMG under `apps/desktop/release/` | `Kata Desktop-0.0.0-arm64.dmg` produced successfully | PASS |
| Bundled CLI resource | Packaged app contains `Contents/Resources/kata` | Mounted app contains `Contents/Resources/kata`, `bun/bun`, and `kata-runtime/` | PASS |
| Fresh launch onboarding | First launch shows onboarding wizard | Packaged app launch shows `Onboarding · Step 1 of 4` | PASS |
| Onboarding provider step | Provider selection renders and navigation works | `Get started` advances to `Step 2 of 4 · Choose a provider` | PASS |
| Provider key validation | API key validates against provider | Blocked: no provider API key available in this unattended session | BLOCKED |
| Model selection | Model list populated + selectable after auth | Blocked by missing validated provider key (`No models available`) | BLOCKED |
| Chat streaming response | User message receives streamed agent response | Blocked by missing model/provider credentials | BLOCKED |
| Tool flow: file edit | Edit request renders diff and Ask-mode approval writes file | Blocked by missing model/provider credentials | BLOCKED |
| Tool flow: bash output | Bash tool output renders in chat with ANSI styling | Blocked by missing model/provider credentials | BLOCKED |
| Session persistence | Close/reopen shows prior session in sidebar | Blocked: no successful chat session could be created without model credentials | BLOCKED |
| Bundled binary without `kata` on PATH | App still launches bridge using bundled runtime | `which kata` returns empty; packaged app reaches running bridge state (`Ready`) | PASS |
| Missing bundled binary error path | Missing binary shows explicit install instruction | Removing `Contents/Resources/kata` triggers crash panel with `Kata CLI not found. Install via: npm install -g @kata-sh/cli` | PASS |
| Legacy branding token audit | No legacy-brand tokens present in desktop app | Repository grep audit returned zero matches | PASS |
| Legacy package namespace audit | No legacy package namespace references in desktop package | Package namespace grep audit returned zero matches | PASS |

## Commands and proofs

```bash
bun run desktop:dist:mac
find "apps/desktop/release" -name "Kata Desktop.app" -maxdepth 4
# mount dmg and inspect resources
hdiutil attach "apps/desktop/release/Kata Desktop-0.0.0-arm64.dmg" -mountpoint /tmp/kata-dmg-check -nobrowse
find "/tmp/kata-dmg-check/Kata Desktop.app/Contents/Resources" -maxdepth 2 -type f
hdiutil detach /tmp/kata-dmg-check

which kata
# naming/namespace grep audits executed per slice verification checklist
```

## Blockers

- Missing provider API key for Anthropic/OpenAI/Google prevented key validation, model selection, chat/tool-use verification, and session persistence verification in packaged runtime.
