---
date: 2026-03-12
triggering_slice: M002/S01
verdict: modified
---

# Reassessment: M002/S01

## Changes Made

- Success-criterion coverage still holds:
  - User can configure a project to use Linear mode via preferences → S02
  - All Kata CRUD operations (milestones, slices, tasks, documents) work against Linear's API → S03, S04
  - `/kata auto` runs a complete milestone cycle in Linear mode — plan, execute, verify, summarize, advance → S06
  - `/kata status` shows live progress derived from Linear API queries → S05
  - File mode continues working unchanged for projects that don't opt into Linear mode → S02, S05, S06
- Kept slice ordering and ownership unchanged.
- Updated the remaining roadmap to reflect concrete S02 decisions already established by planning:
  - canonical config lives in `.kata/preferences.md`
  - legacy `.kata/PREFERENCES.md` stays as read-only fallback
  - downstream slices consume `getWorkflowMode()` / validated mode resolution from `linear-config.ts`
- Removed S01-retired risks from the active risk/proof sections and replaced them with the real remaining config-compatibility risk.

## Requirement Coverage Impact

- Requirement coverage remains sound; every success criterion still has a remaining owning slice.
- No requirement owner or status changed.
- R103 wording now matches the proven document-attachment surface (`project` / `issue`), and R105 notes were narrowed to the decided config path (`.kata/preferences.md` with legacy uppercase fallback).

## Decision References

- D004
- D017
- D018
