# @kata-sh/cli

Kata Skills runtime and backend contract bridge.

This package provides the durable operation layer for Kata project workflows. Skills and harnesses call into it for project, milestone, slice, task, artifact, progress, and completion operations instead of writing directly to backend systems.

The `0.16.x` line is the stable release for the Kata Skills runtime and backend contract bridge.

Install with:

```bash
npm install -g @kata-sh/cli
```

For monorepo development:

```bash
pnpm --dir apps/cli run build
pnpm --dir apps/cli run test
```

Commands:

- `kata setup --pi`
- `kata setup --backend github --repo owner/name --project-number 12`
- `kata setup --backend linear --linear-workspace <workspace> --linear-team <team> --linear-project <project>`
- `kata doctor`
- `kata call <operation> --input <request.json>`

Runtime shape:

- `apps/cli/skills-src` is the source of truth for generated Kata Agent Skills.
- `apps/cli/skills` is the generated skill bundle packaged with `@kata-sh/cli`.
- `kata setup` installs packaged skills into Pi, project-local/global agent skills, Claude skills, or Cursor skills depending on the selected target flags.
- Backend adapters include GitHub Projects v2 and Linear under `src/backends`.
- Linear auth resolves from `LINEAR_API_KEY`, `LINEAR_TOKEN`, or configured `linear.authEnv`.
- Standalone issue workflows use `kata-plan-issue` and `kata-execute-issue` with `issue.listOpen`, `issue.create`, `issue.get`, and `issue.updateStatus` operations.
- Roadmap planning includes slice maps, dependency graphs, and implementation waves.

Release channel:

- Stable releases publish to npm as `@kata-sh/cli@latest`.
- Prereleases publish under their prerelease dist-tag, such as `alpha`.
