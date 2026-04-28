# M001: Rebrand

**Vision:** Rename the entire project from get-shit-done/gsd/TÂCHES to kata-orchestrator/kata. Remove the statusline feature. Produce a clean npm package under the new identity, ready for M002 distribution work.

## Success Criteria

- `package.json` name is `kata-orchestrator`, bin entry is `kata`
- Zero occurrences of `gsd` or `get-shit-done` in shipped files (CHANGELOG excluded)
- `gsd-statusline.js` and all references to it are gone
- `npm test` passes
- `npm pack` produces a tarball with the new identity

## Key Risks / Unknowns

- Breadth of rename — gsd/get-shit-done appears in ~30+ files; need thorough grep before task planning

## Proof Strategy

- Rename breadth → retire in S01 by grepping the packed tarball for old names

## Verification Classes

- Contract verification: grep for `gsd`/`get-shit-done` in output, npm test pass
- Integration verification: `npm pack` + tarball inspection
- Operational verification: none
- UAT / human verification: none

## Milestone Definition of Done

- All slices complete
- `npm test` green
- `npm pack` tarball contains no gsd/get-shit-done references (excluding CHANGELOG)
- `kata` bin executable and functional

## Requirement Coverage

- Covers: R001, R002
- Partially covers: none

---

## Slices

- [x] **S01: Rename and strip** `risk:low` `depends:[]`
  > After this: the project is fully renamed to kata-orchestrator with kata bin; statusline removed; npm test passes; pack is clean.

## Boundary Map

### S01 → (output)
Produces:
  package.json → name: kata-orchestrator, bin: kata
  bin/install.js → renamed/updated kata entrypoint
  agents/ → all gsd-* agent files renamed to kata-*
  hooks/ → statusline removed; remaining hooks renamed kata-*
  get-shit-done/ → directory renamed to kata/ (or equivalent)
  tests/ → updated to reference new names
  README.md → updated branding

Consumes: nothing (leaf)
