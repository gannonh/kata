#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_DIR="${1:-apps/desktop-legacy/docs/uat/M009/evidence}"
PLAYWRIGHT_OUTPUT_DIR="$EVIDENCE_DIR/playwright-results"
mkdir -p "$EVIDENCE_DIR" "$PLAYWRIGHT_OUTPUT_DIR"

run_step() {
  local step_id="$1"
  local title="$2"
  local logfile="$3"
  shift 3

  echo ""
  echo "[$step_id] $title"
  {
    echo "== $step_id: $title =="
    date -u +"UTC %Y-%m-%dT%H:%M:%SZ"
    echo ""
    "$@"
  } 2>&1 | tee "$logfile"
}

run_step \
  "01" \
  "Deterministic CI GitHub backend validation lane" \
  "$EVIDENCE_DIR/01-ci-github-backend-validation.log" \
  bash scripts/ci/github-backend-validation.sh

run_step \
  "02" \
  "CLI failure-path diagnostic: missing token error is actionable" \
  "$EVIDENCE_DIR/02-cli-missing-token-diagnostic.log" \
  pnpm --dir apps/cli exec bun test \
  src/resources/extensions/kata/tests/github-backend.integration.test.ts \
  --test-name-pattern "token is missing"

run_step \
  "03" \
  "Symphony failure-path diagnostic: unknown projects-v2 status" \
  "$EVIDENCE_DIR/03-symphony-unknown-status-diagnostic.log" \
  pnpm --dir apps/symphony exec cargo test \
  --test github_execution_contract_tests \
  test_projects_v2_unknown_status_reports_actionable_error \
  -- --exact

runtime_token="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [[ -n "$runtime_token" ]]; then
  run_step \
    "04" \
    "CLI real-environment runtime smoke against GitHub API" \
    "$EVIDENCE_DIR/04-cli-runtime-smoke.log" \
    env KATA_GITHUB_SMOKE=1 GITHUB_TOKEN="$runtime_token" \
    pnpm --dir apps/cli exec bun test \
    src/resources/extensions/kata/tests/github-backend.integration.test.ts \
    --test-name-pattern "runtime smoke"
else
  {
    echo "== 04: CLI real-environment runtime smoke against GitHub API =="
    date -u +"UTC %Y-%m-%dT%H:%M:%SZ"
    echo ""
    echo "SKIPPED: neither GITHUB_TOKEN nor GH_TOKEN is set in this shell."
  } | tee "$EVIDENCE_DIR/04-cli-runtime-smoke.log"
fi

run_step \
  "05" \
  "Desktop GitHub board parity e2e screenshot proof" \
  "$EVIDENCE_DIR/05-desktop-github-e2e.log" \
  bash -c "pnpm --dir apps/desktop-legacy run build:main && pnpm --dir apps/desktop-legacy run build:preload && pnpm --dir apps/desktop-legacy run build:renderer && KATA_M009_EVIDENCE=1 pnpm --dir apps/desktop-legacy exec playwright test e2e/tests/m009-github-cross-suite-proof.e2e.ts --output \"$PLAYWRIGHT_OUTPUT_DIR\""

{
  echo ""
  echo "Acceptance bundle complete."
  echo "Evidence directory: $EVIDENCE_DIR"
  echo "Playwright screenshot artifacts: $PLAYWRIGHT_OUTPUT_DIR"
} | tee "$EVIDENCE_DIR/00-summary.txt"
