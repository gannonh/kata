# CHECK Action Workflows Reference

This reference documents detailed workflows for each action option in the CHECK operation.

Actions are lightweight routing flows, not full sub-agent workflows. Each action completes quickly, allowing the user to continue reviewing todos or exit the skill.

## Action 1: Work On Now

**Purpose:** Display todo content so user can work on it immediately.

**Behavior:** Display content, exit skill, user takes over.

**Steps:**

1. Read full todo file content
2. Display formatted output:
   ```
   ## Working on: [Title]

   [Todo body content]

   ---
   **Area:** [area] | **Type:** [type]
   **Files involved:**
   - [file1]
   - [file2]

   When done, say "mark [title] complete" or "check todos" to continue.
   ```
3. Exit skill (user continues naturally)

**Important:** Does NOT move file to done/. User explicitly marks complete later via "mark complete" action or by saying "mark [title] complete".

## Action 2: Add to Current Phase

**Purpose:** Convert todo into a task in the current phase backlog.

**Behavior:** Add to ROADMAP backlog, move to done/.

**Prerequisites:** Current phase must exist in ROADMAP.md.

**Steps:**

1. Read ROADMAP.md and find current phase section
2. Locate "Backlog" or "Tasks" subsection in phase
3. Add todo title as a new item:
   ```markdown
   - [ ] [Todo title] (from todo: {filename})
   ```
4. Move todo file:
   ```bash
   mv .planning/todos/pending/{file} .planning/todos/done/{file}
   ```
5. Update STATE.md pending count
6. Display confirmation:
   ```
   Added "[Title]" to Phase [X] backlog.
   Todo moved to done/.

   Next: /kata-planning-phases to incorporate into plans
   ```

**Edge case:** If no current phase exists, suggest creating one first:
```
No current phase found in ROADMAP.md.
Options:
1. Create new phase for this todo
2. Put todo back (review later)
```

## Action 3: Create New Phase

**Purpose:** Create a new phase from the todo content.

**Behavior:** Route to kata-managing-project-roadmap add-phase operation.

**Steps:**

1. Extract suggested phase name from todo title
2. Extract suggested goal from todo body
3. Display preview:
   ```
   Creating phase from todo...

   Suggested:
   - **Name:** [derived from title]
   - **Goal:** [from body]

   Invoking kata-managing-project-roadmap to add phase...
   ```
4. Invoke: `/kata-managing-project-roadmap add-phase`
5. After phase created successfully, move todo to done/:
   ```bash
   mv .planning/todos/pending/{file} .planning/todos/done/{file}
   ```
6. Update STATE.md pending count

**Note:** The roadmap skill handles phase creation details. This action simply routes and tracks completion.

## Action 4: Brainstorm

**Purpose:** Discuss the todo to clarify scope, approach, or alternatives.

**Behavior:** Display content, continue conversation.

**Steps:**

1. Display todo content
2. Add conversational prompt:
   ```
   Let's discuss: [Title]

   [Todo body]

   What aspects would you like to explore?
   - Technical approach?
   - Scope clarification?
   - Dependencies?
   - Alternative solutions?
   ```
3. Skill completes, normal conversation continues

**Important:** Todo stays in pending/. It is not moved or modified. User returns to todo review via "check todos" when ready to take action.

## Action 5: Put Back

**Purpose:** Skip this todo and review it later.

**Behavior:** Skip to next todo (or exit if last).

**Steps:**

1. Do nothing to the todo file (remains in pending/)
2. If more todos remain: Show next todo with AskUserQuestion
3. If last todo: Exit with review summary

**This is the simplest action:** No file changes, just navigation.

## Action 6: Mark Complete

**Purpose:** Move to done/ for todos worked on outside Kata.

**Use case:** User worked on the todo through conversation, external editor, or other tools. The work is done but wasn't tracked through Kata execution.

**Steps:**

1. Move file:
   ```bash
   mv .planning/todos/pending/{file} .planning/todos/done/{file}
   ```
2. Update STATE.md pending count
3. Display: `"[Title]" marked complete.`
4. If more todos remain: Show next todo with AskUserQuestion
5. If last todo: Exit with review summary

---

## STATE.md Update Pattern

After any action that changes the pending count (Actions 2, 3, 6):

```bash
# Count pending todos
count=$(ls .planning/todos/pending/*.md 2>/dev/null | wc -l | tr -d ' ')

# Read STATE.md
# Find "Pending Todos" section
# Update count: "N pending todos:"
# Update todo list (if count <= 10, list paths)
```

**Update format in STATE.md:**

```markdown
### Pending Todos

{count} pending todos:
- `.planning/todos/pending/{file1}.md` - {title1}
- `.planning/todos/pending/{file2}.md` - {title2}
...
```

If count > 10, summarize instead of listing all:
```markdown
### Pending Todos

{count} pending todos in `.planning/todos/pending/`
```

---

## Action Summary Table

| Action               | Moves File? | Updates STATE? | Continues Review? |
| -------------------- | ----------- | -------------- | ----------------- |
| Work on now          | No          | No             | No (exits skill)  |
| Add to current phase | Yes → done/ | Yes            | Yes               |
| Create new phase     | Yes → done/ | Yes            | No (invokes roadmap) |
| Brainstorm           | No          | No             | No (exits skill)  |
| Put back             | No          | No             | Yes               |
| Mark complete        | Yes → done/ | Yes            | Yes               |
