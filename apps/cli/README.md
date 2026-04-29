# @kata-sh/cli

Kata Skills runtime and backend contract bridge.

This package provides the durable operation layer for Kata project workflows. Skills and harnesses call into it for project, milestone, slice, task, artifact, progress, and completion operations instead of writing directly to backend systems.

The `0.16.0-alpha.*` line is the M001 validation release for the new skill-platform architecture. It is intended for Pi-first integration while Symphony and Desktop move onto the same runtime contract.

Install the alpha with:

```bash
npm install -g @kata-sh/cli@alpha
```

For monorepo development:

```bash
pnpm --dir apps/cli run build
pnpm --dir apps/cli run test
```

Commands:

- `kata setup --pi`
- `kata doctor`
- `kata call <operation> --input <request.json>`

Runtime shape:

- `apps/cli/skills-src` is the source of truth for generated Kata Agent Skills.
- `apps/cli/skills` is the generated skill bundle packaged with `@kata-sh/cli`.
- `kata setup --pi` installs the packaged skills into Pi.
- Backend adapters, currently including GitHub Projects v2, live under `src/backends`.

Release channel:

- Alpha releases publish to npm as `@kata-sh/cli@alpha`.
- Stable releases will use `@kata-sh/cli@latest` after Symphony and Desktop complete their integration hardening.
