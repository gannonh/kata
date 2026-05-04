# Setup and Health

If Kata CLI is not configured, run setup and health checks through `scripts/kata-call.mjs` from the installed skill.

When this skill is already installed, prefer the local wrapper:

- `node <path-to-skill-directory>/scripts/kata-call.mjs doctor`
- `node <path-to-skill-directory>/scripts/kata-call.mjs health.check`

## GitHub Projects V2 Setup

`setup` installs or refreshes Kata skills for the selected target: local `.agents/skills` for most coding agents, global `~/.agents/skills`, and optionally `.claude/skills` or `.cursor/skills`.

If a backend operation reports missing GitHub Projects v2 fields, stop and instruct the user to add these exact Project fields before retrying:

- `Kata Type` — Text field
- `Kata ID` — Text field
- `Kata Parent ID` — Text field
- `Kata Artifact Scope` — Text field
- `Kata Verification State` — Text field

In GitHub Project table view, add a text field from the rightmost field header: click `+`, choose `New field`, enter the exact name, choose `Text`, and save.

Do not retry the failed backend write until the Project fields are fixed.
