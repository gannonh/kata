# S01: Linear GraphQL Client Extension — UAT

**Slice:** S01
**Demo:** Agent can authenticate with Linear API key and perform CRUD on all entity types against a real Linear workspace via extension tools.

## Prerequisites

- `LINEAR_API_KEY` set in environment (personal API key from linear.app/settings/api)
- At least one team in the Linear workspace

## Test Script

### 1. Verify tools appear in session
- Start a Kata session with `LINEAR_API_KEY` set
- Check that `linear_*` tools are available (e.g., via tool list or `/tools`)
- **Expected:** 22 `linear_*` tools visible

### 2. List teams
- Call `linear_list_teams`
- **Expected:** Returns your workspace's teams with id, key, name

### 3. Create a project
- Call `linear_create_project` with a test name and your team ID
- **Expected:** Returns project with id, name, url
- **Verify in Linear UI:** Project appears in sidebar

### 4. Create a milestone
- Call `linear_create_milestone` with the project ID
- **Expected:** Returns milestone with id, name
- **Verify in Linear UI:** Milestone appears under project

### 5. Create parent issue + sub-issue
- Call `linear_create_issue` with a title and team ID
- Call `linear_create_issue` with a title, team ID, and `parentId` = first issue's ID
- **Expected:** Second issue appears as sub-issue of first
- **Verify in Linear UI:** Issue hierarchy visible

### 6. Create and verify label
- Call `linear_ensure_label` with name "kata-uat-test"
- Call `linear_ensure_label` again with same name
- **Expected:** Same label ID returned both times

### 7. Create document with issue attachment
- Call `linear_create_document` with title, content (markdown), and `issueId`
- **Expected:** Document created and visible
- **Verify in Linear UI:** Document appears attached to the issue

### 8. Verify error handling
- Start a session with an invalid `LINEAR_API_KEY`
- Call any tool
- **Expected:** Clear error message mentioning "auth_error" and "secure_env_collect"

### 9. Verify silent load without key
- Start a session without `LINEAR_API_KEY`
- **Expected:** Session starts normally, no linear tools listed, no errors

## Cleanup

Delete test projects, issues, and labels created during UAT from Linear UI.
