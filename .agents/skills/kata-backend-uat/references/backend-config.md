# Backend Config

## Shared

Run from the Kata workspace root when possible. The runner loads `.env` from the workspace and sets `KATA_CLI_ROOT` to `apps/cli` when it exists.

Useful options:

```bash
--workspace /path/to/repo
--cli-root /path/to/repo/apps/cli
--output-dir /tmp/kata-uat
--dry-run
```

## GitHub

The runner reads `.kata/preferences.md` when present. It needs:

- `workflow.mode: github`
- `github.repoOwner`
- `github.repoName`
- `github.stateMode: projects_v2`
- `github.githubProjectNumber`
- `GH_TOKEN` or `GITHUB_TOKEN`

Override values:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs test --backend github \
  --github-owner gannonh \
  --github-repo kata \
  --github-project-number 17
```

## Linear

The runner reads `.env` and accepts overrides. It needs:

- `LINEAR_API_KEY` or `LINEAR_TOKEN`
- Linear workspace key/name
- Linear team key
- Linear project ID or slug

Defaults for this repo are:

- workspace: `kata-sh`
- team: `KAT`
- project: `LINEAR_PROJECT_ID` from `.env`

Override values:

```bash
node <skill-directory>/scripts/kata-backend-uat.mjs test --backend linear \
  --linear-workspace kata-sh \
  --linear-team KAT \
  --linear-project "$LINEAR_PROJECT_ID"
```

When Linear has multiple active milestones, the runner pins the created milestone in temporary preferences before calling active-milestone operations.
