 Kata Symphony v1.0.0 🎵

 Headless orchestrator that turns your Linear backlog into merged PRs — autonomously. Highly performant, this is a Rust implementation of the [OpenAI spec for multi-agent orchestration](https://github.com/openai/symphony).

 Point it at a Linear project and a git repo. Symphony polls for tickets, spins up parallel
 agents, creates PRs, addresses review feedback, and merges. Full lifecycle, no human in the loop
 until you want one.

 The fun part: Symphony built itself. 24 of its own tickets — multi-turn sessions, real-time
 dashboards, workspace strategies, PR lifecycle — were implemented, reviewed, and merged by the
 system being built. Two days from scaffold to self-hosting.

 → 290 tests, 10,900 lines of Rust
 → Parallel agents with priority + dependency awareness
 → Multi-turn sessions preserving conversation history
 → TUI + HTTP dashboards with live session tracking
 → Works with any Linear project + any git repo

 <https://github.com/gannonh/kata/tree/main/apps/symphony>
