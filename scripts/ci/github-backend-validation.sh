#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

run_segment() {
  local segment="$1"
  shift

  echo "::group::${segment}"
  if "$@"; then
    echo "✅ ${segment} passed"
    echo "::endgroup::"
    return 0
  else
    local exit_code=$?
    echo "::error title=GitHub backend validation failed::${segment} failed (exit ${exit_code})."
    echo "::error::Review the grouped output above to see the exact backend contract that regressed."
    echo "::endgroup::"
    return "$exit_code"
  fi
}

echo "Running deterministic GitHub backend validation lane"
echo "Negative-path signal checks included in this lane:"
echo "- CLI: missing token + timeout diagnostics (github-backend.integration.test.ts)"
echo "- Desktop: structured GitHub HTTP/GraphQL error mapping (github-workflow-client.test.ts)"
echo "- Symphony: unknown Project v2 status actionable error (github_execution_contract_tests.rs)"

run_segment \
  "CLI GitHub backend contract suites (Vitest)" \
  pnpm --dir apps/cli exec vitest run \
  src/resources/extensions/kata/tests/github-planning-contract.vitest.test.ts \
  src/resources/extensions/kata/tests/github-config.integration.vitest.test.ts \
  src/resources/extensions/kata/tests/github-planning.integration.vitest.test.ts \
  src/resources/extensions/kata/tests/github-backend.artifacts.vitest.test.ts \
  src/resources/extensions/kata/tests/github-artifacts.vitest.test.ts \
  src/resources/extensions/kata/tests/github-dependency-materialization.vitest.test.ts \
  src/resources/extensions/kata/tests/github-backend-plan-prompt.vitest.test.ts

run_segment \
  "CLI GitHub backend integration harness (bun test)" \
  pnpm --dir apps/cli exec bun test \
  src/resources/extensions/kata/tests/github-config.test.ts \
  src/resources/extensions/kata/tests/github-state.test.ts \
  src/resources/extensions/kata/tests/github-backend.integration.test.ts

run_segment \
  "Desktop GitHub workflow backend contracts (Vitest)" \
  pnpm --dir apps/desktop exec vitest run \
  src/main/__tests__/github-workflow-client.test.ts \
  src/main/__tests__/workflow-board-service.test.ts

run_segment \
  "Symphony GitHub backend execution contracts (cargo test)" \
  pnpm --dir apps/symphony exec cargo test \
  --test github_adapter_tests \
  --test github_execution_contract_tests

echo "GitHub backend validation lane completed successfully."