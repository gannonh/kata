# M008 / S04 Legacy Archive Handoff

This document records the repeatable archive path for the legacy desktop workspaces that were removed from the active monorepo during `KAT-2524`.

## Latest Verified Export

- **Active repo source SHA:** `60026b67292b783abb190cc78974bfddde58269f`
- **Active repo source short SHA:** `60026b67`
- **Archive repository path:** `/Volumes/EVO/symphony-workspaces/kata-desktop-legacy-archive`
- **Archive repository HEAD after export:** `28cf51b`
- **Archived app trees:** `apps/electron`, `apps/viewer`
- **Archive provenance file:** `provenance/M008-S04/export.json`
- **Archive export log:** `provenance/M008-S04/export.log`

## Repeatable Export Command

Run from the active monorepo root before deleting or re-exporting the legacy app trees:

```bash
bash scripts/archive-legacy-apps.sh --dest ../kata-desktop-legacy-archive
```

The script will:

1. Initialize the archive checkout as a git repository when it does not already exist.
2. Copy `apps/electron` and `apps/viewer` into the archive repo without renaming archive-only code.
3. Record the active repo path, branch, source SHA, archive destination, and export timestamp in `provenance/M008-S04/export.json`.
4. Create an archive commit with the imported app trees when there are changes.
5. Verify that the archive still contains the legacy app trees and their legacy package/dependency identity.

## Verification Command

Run this after the legacy app directories are removed from the active repo:

```bash
bash scripts/archive-legacy-apps.sh --verify-only --dest ../kata-desktop-legacy-archive
```

Successful verification proves:

- the archive repo exists and is readable,
- `apps/electron` and `apps/viewer` are present in the archive checkout,
- provenance was recorded,
- the archived code still preserves the legacy `@craft-agent/*` dependency surface where expected.

## Recovery Notes

To inspect or recover the removed legacy app trees later:

```bash
cd ../kata-desktop-legacy-archive
ls apps/electron apps/viewer
cat provenance/M008-S04/export.json
```

If a future archaeology pass needs the archived code in a separate working directory, copy it from the archive repo instead of reintroducing the directories into the active monorepo.
