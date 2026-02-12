# Kata Workflow Routes

Visual documentation of every decision gate, route, and cross-skill handoff in Kata.

## Diagrams

| # | Diagram | What It Shows |
| --- | --- | --- |
| 1 | [Lifecycle Overview](FLOWS.md#1-lifecycle-overview) | Complete skill-to-skill state machine with all routes |
| 2 | [Track Progress (Router)](FLOWS.md#2-track-progress-router) | Central router: 6 named routes based on project state |
| 3 | [New Project](FLOWS.md#3-new-project) | Initialization gates: git, brownfield, config |
| 4 | [Add Milestone](FLOWS.md#4-add-milestone) | Brainstorm, research, requirements, roadmap pipeline |
| 5 | [Plan Phase](FLOWS.md#5-plan-phase) | Research decision tree, planner/checker revision loop |
| 6 | [Execute Phase](FLOWS.md#6-execute-phase) | Wave parallelization, verifier, gap closure branch |
| 7 | [Verify Work](FLOWS.md#7-verify-work) | UAT testing, diagnosis, fix planning loop |
| 8 | [Complete Milestone](FLOWS.md#8-complete-milestone) | Release branch, archive, GitHub closure |

## Reference Tables

| Table | What It Shows |
| --- | --- |
| [Route Index](FLOWS.md#route-index) | Every named route with entry condition and destination |
| [Config-Dependent Branches](FLOWS.md#config-dependent-branches) | How config.json settings activate/deactivate branches |
| [Loops](FLOWS.md#loops) | Every bounded iteration loop with max count and escape |

## Rendering

- **GitHub**: Renders Mermaid natively in markdown preview
- **VS Code**: Install "Markdown Preview Mermaid Support" extension
- **Interactive editing**: [mermaid.live](https://mermaid.live)
