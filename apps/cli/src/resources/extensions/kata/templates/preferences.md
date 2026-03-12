---
version: 1
workflow:
  mode: file
linear: {}
always_use_skills: []
prefer_skills: []
avoid_skills: []
skill_rules: []
custom_instructions: []
models: {}
skill_discovery:
auto_supervisor: {}
---

# Kata Skill Preferences

See `~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md` for full field documentation and examples.

## Quick start

- Leave `workflow.mode: file` for the default file-backed Kata workflow.
- Set `workflow.mode: linear` and fill in the `linear` block to opt this project into Linear-backed workflow mode.
- Keep secrets like `LINEAR_API_KEY` in environment variables, not in this file.

## Linear example

```yaml
workflow:
  mode: linear
linear:
  teamKey: KAT
  projectId: 12345678-1234-1234-1234-1234567890ab
```
