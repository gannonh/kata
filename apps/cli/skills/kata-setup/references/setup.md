# Setup and Health

When this installed skill is available, run setup and health checks through `scripts/kata-call.mjs`. Before skills are installed, use the published Kata CLI package or harness plugin installer.

When this skill is already installed, prefer the local wrapper:

- `node <path-to-skill-directory>/scripts/kata-call.mjs doctor`
- `node <path-to-skill-directory>/scripts/kata-call.mjs health.check`

## GitHub Projects V2 Setup

`setup --pi` installs or refreshes local Pi skills. It does not create or repair GitHub Project fields.

If a backend operation reports missing GitHub Projects v2 fields, stop and instruct the user to add these exact Project fields before retrying:

- `Kata Type` — Text field
- `Kata ID` — Text field
- `Kata Parent ID` — Text field
- `Kata Artifact Scope` — Text field
- `Kata Verification State` — Text field
- `Kata Blocking` — Text field with comma-separated Kata IDs
- `Kata Blocked By` — Text field with comma-separated Kata IDs

The Project `Status` field must include these options:

- `Backlog`
- `Todo`
- `In Progress`
- `Agent Review`
- `Human Review`
- `Merging`
- `Done`

In GitHub Project table view, add a text field from the rightmost field header: click `+`, choose `New field`, enter the exact name, choose `Text`, and save.

Do not retry the failed backend write until the Project fields are fixed.
