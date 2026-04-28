# Workflow Reference

Source: `apps/cli/skills-src/workflows/health.md`

# Health Workflow

Use this workflow when setup, backend access, or harness integration may be unhealthy.

## Runtime Flow

1. Run `health.check`.
2. Explain invalid checks with concrete fix commands.
3. If Pi is the harness, verify the Pi skills directory and settings were installed by `kata setup --pi`.
4. Confirm CLI backend access is ready before workflow execution.

## Rules

1. Do not mutate project planning state.
2. Do not continue into planning or execution while required health checks are invalid.
3. Keep fixes concrete and local to the failing check.
