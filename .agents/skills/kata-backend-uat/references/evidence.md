# Evidence

Each test run writes:

- `evidence.json`: machine-readable proof.
- `evidence.md`: human-readable proof summary.
- `payloads/`: request payloads used for operations.

Evidence includes:

- backend identity
- workspace
- CLI root
- git commit
- timestamp
- health check result
- expected and observed operation coverage
- created milestone, slices, tasks, and issue
- proof checks for generated artifacts
- provider URLs for comments, documents, and issues
- retry counts
- cleanup status

## Pass Criteria

A backend test passes when:

- `health.check` succeeds.
- Every current CLI operation is observed.
- `project.getSnapshot` reports milestone readiness before completion.
- The created milestone is completed.
- Artifact proof checks pass.

## Artifact Proof Checks

GitHub:

- Fetch created artifact comments through GitHub REST.
- Verify comment URLs are present.
- Verify marker metadata is compact and does not contain `scopeType` or `scopeId`.

Linear:

- Fetch created documents and comments through Linear GraphQL.
- Verify project and milestone documents have exact titles and no inline marker.
- Verify issue comments use compact marker metadata.

## Failure Reporting

Report:

- failed operation
- provider error message
- retry count
- evidence path
- cleanup command

Do not summarize a failed run as success if cleanup completed.
