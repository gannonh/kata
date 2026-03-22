I just shipped something I still can't fully wrap my head around.

Two days ago I had a Rust scaffold with passing tests and zero runtime behavior. Today I'm managing a fleet of autonomous coding agents from my phone. I drag a ticket to "Todo" in Linear, put my phone down, and come back to a merged PR — code written, tests passing, review comments addressed, PR landed. All without touching a keyboard.

The surreal part: the system built itself. I'd file a ticket — "add multi-turn sessions" or "build the TUI dashboard" — move it to Todo, and watch Symphony pick it up, implement it, open a PR, loop through automated code review until every comment was resolved, then wait for my approval. 24 tickets went through this cycle. The orchestrator that manages agents was being built by the agents it manages.

This is Kata Symphony v1.0.0 🎵

A headless orchestrator that turns your Linear backlog into merged PRs — autonomously. High-performance Rust implementation of the [OpenAI spec for multi-agent orchestration](https://github.com/openai/symphony).

Point it at a Linear project and a git repo. Symphony polls for tickets, spins up parallel agents, creates PRs, addresses review feedback, and merges. Full lifecycle, no human in the loop until you want one.

What makes this different from "AI writes code":

- **Truly autonomous lifecycle** — not just code generation. Ticket → branch → implementation → PR → automated review loop → human review → merge → done. The agent keeps going until the PR is clean.
- **Multi-turn sessions** — agents continue on the same thread across turns, preserving full conversation history. They remember what they tried.
- **Parallel execution** — 3 agents working different tickets simultaneously, each in isolated workspaces, with priority and dependency awareness.
- **Self-correcting review loop** — after opening a PR, the agent reads every review comment (human and bot), fixes the code or pushes back with reasoning, resolves threads, and only moves to human review when everything is clean.

→ 290 tests, 10,900 lines of Rust
→ TUI + HTTP dashboards with live session tracking
→ Works with any Linear project + any git repo
→ Two days from scaffold to self-hosting

https://github.com/gannonh/kata/tree/main/apps/symphony
