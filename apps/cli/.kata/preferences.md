---
version: 1
always_use_skills: 
    - /Volumes/EVO/kata/kata-mono/.agents/skills/releasing-kata/SKILL.md
    - /Users/gannonhall/.agents/skills/pull-requests/SKILL.md
prefer_skills: []
avoid_skills: []
skill_rules: []
custom_instructions: []
models: 
    research: claude-sonnet-4-6
    planning: claude-opus-4-6
    execution: claude-opus-4-6
    completion: claude-sonnet-4-6
skill_discovery: auto
auto_supervisor: {}
workflow:                                                                                                                                                        
    mode: linear                                                                                                                                                   
linear:                                                                                                                                                          
    teamKey: KAT                                                                                                                                                   
    projectId: c7e76979-df58-407a-bf64-09bfccfef9c4   
---

# Kata Skill Preferences

See `~/.kata-cli/agent/extensions/kata/docs/preferences-reference.md` for full field documentation and examples.

<!-- codex models

models: 
    research: gpt-5.3-codex-spark
    planning: gpt-5.4
    execution: gpt-5.3-codex-spark
    completion: gpt-5.3-codex-spark

-->