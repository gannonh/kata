---
# Optional scope estimate — helps the plan quality validator detect over-scoped tasks.
# Tasks with 10+ estimated steps or 12+ estimated files trigger a warning to consider splitting.
estimated_steps: {{estimatedSteps}}
estimated_files: {{estimatedFiles}}
---

# {{taskId}}: {{taskTitle}}

**Slice:** {{sliceId}} — {{sliceTitle}}
**Milestone:** {{milestoneId}}

## Description

{{description}}

## Steps

1. {{step}}
2. {{step}}
3. {{step}}

## Must-Haves

- [ ] {{mustHave}}
- [ ] {{mustHave}}

## Verification

- {{howToVerifyThisTaskIsActuallyDone}}
- {{commandToRun_OR_behaviorToCheck}}

## Observability Impact

<!-- If this task creates or changes a runtime boundary, async flow, API, UI state,
     background process, or error path, explain how it improves or depends on
     future agent observability. Use "None" when genuinely not applicable. -->

- Signals added/changed: {{structured logs, statuses, errors, metrics, or None}}
- How a future agent inspects this: {{command, endpoint, file, UI state, or None}}
- Failure state exposed: {{what becomes visible on failure, or None}}

## Inputs

- `{{filePath}}` — {{whatThisTaskNeedsFromPriorWork}}
- {{priorTaskSummaryInsight}}

## Expected Output

<!-- This task should produce a real increment toward making the slice goal/demo true. A full slice plan should not be able to mark every task complete while the claimed slice behavior still does not work at the stated proof level. -->

- `{{filePath}}` — {{whatThisTaskShouldProduceOrModify}}
