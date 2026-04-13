# M008 / S04 Legacy Archive Handoff

This document records where the archived legacy desktop workspaces now live after removal from the active monorepo during `KAT-2524`.

## Archive Location

- **Private archive repository:** `https://github.com/gannonh/kata-desktop-legacy-archive`
- **Local archive checkout:** `/Volumes/EVO/symphony-workspaces/kata-desktop-legacy-archive`
- **Archived app trees:** `apps/electron`, `apps/viewer`
- **Archive provenance file:** `provenance/M008-S04/export.json`
- **Archive export log:** `provenance/M008-S04/export.log`

## Latest Verified Snapshot

- **Active repo source SHA:** `60026b67292b783abb190cc78974bfddde58269f`
- **Active repo source short SHA:** `60026b67`
- **Local archive HEAD after export:** `28cf51b`
- **Private archive remote:** `origin`

## Notes

- The active monorepo no longer tracks `apps/electron` or `apps/viewer`.
- Legacy package identities are preserved inside the private archive for archaeology only.
- New work must not restore those app trees to the active monorepo.

## Recovery

To inspect the archived code later:

```bash
cd /Volumes/EVO/symphony-workspaces/kata-desktop-legacy-archive
ls apps/electron apps/viewer
cat provenance/M008-S04/export.json
```

If the local checkout is unavailable, clone the private archive repository and inspect the same paths there instead of reintroducing those directories into the active monorepo.
