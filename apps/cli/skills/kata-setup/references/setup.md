# Setup and Health

When this installed skill is available, run setup and health checks through `scripts/kata-call.mjs`. Before skills are installed, use the published Kata CLI package or harness plugin installer.

When this skill is already installed, prefer the local wrapper:

- `node ./scripts/kata-call.mjs doctor`
- `node ./scripts/kata-call.mjs health.check`
