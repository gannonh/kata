# Example Spec: Slow API Response Investigation

## Problem Statement

The `/api/v2/reports` endpoint has p95 latency of 4.2s, up from 800ms two
weeks ago. No deployments correlate with the regression. The endpoint serves
the main dashboard and affects all users on page load.

## Constraints

- Production database cannot be modified without a maintenance window
- APM tooling (Datadog) is available with 30-day trace retention
- The team has read-only production database access
- Fix must not require API contract changes

## Investigation Scope

Three areas to examine:

1. **Database layer** — Query plans for the report aggregation queries. Check
   for missing indexes, table bloat, or lock contention introduced by recent
   data growth.
2. **Application layer** — N+1 query patterns, serialization overhead, or
   middleware regressions. Compare request traces from before and after the
   regression window.
3. **Infrastructure** — Connection pool saturation, memory pressure, or noisy
   neighbor effects on the shared database instance.

## Hypotheses to Test

- [ ] **H1: Table bloat** — The `report_entries` table has grown past the
  point where existing indexes cover the aggregation query efficiently.
  Check: run `EXPLAIN ANALYZE` on the aggregation query; compare row
  estimates vs actuals.
- [ ] **H2: N+1 regression** — A recent ORM update changed eager loading
  behavior, introducing per-row queries. Check: count SQL queries per
  request in Datadog traces before and after the regression date.
- [ ] **H3: Connection pool saturation** — Pool size hasn't scaled with
  traffic growth, causing queuing. Check: pool wait time metrics in Datadog;
  compare active connections vs pool max.
- [ ] **H4: Lock contention** — A background job introduced around the
  regression window holds long transactions on the same table. Check:
  `pg_stat_activity` for long-running transactions during peak hours.

## Success Criteria

- [ ] Root cause identified with supporting evidence (query plans, traces,
  or metrics)
- [ ] Proposed fix documented with expected latency improvement
- [ ] Fix validated in staging with before/after p95 measurements
- [ ] Rollback plan documented if the fix has side effects

## Out of Scope

- Rewriting the reports endpoint or changing the API contract
- Database migration or schema redesign
- General performance optimization unrelated to this regression
