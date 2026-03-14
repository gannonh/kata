# S06: Linear Cross-linking — UAT

## Prerequisites
- A project with `workflow.mode: linear` and valid Linear binding (team + project)
- `LINEAR_API_KEY` set in environment
- `pr.enabled: true` and `pr.linear_link: true` in `.kata/preferences.md`
- `gh` CLI installed and authenticated
- At least one Kata slice issue existing in Linear with `kata:slice` label

## Test 1: PR Status Shows Linear Link Active
1. Run `/kata pr status`
2. **Verify:** output includes `linear_link: active` line

## Test 2: PR Status Shows Linear Link Disabled
1. Set `pr.linear_link: false` in preferences
2. Run `/kata pr status`
3. **Verify:** output includes `linear_link: disabled` line

## Test 3: PR Status Shows Requires Linear Mode
1. Set `pr.linear_link: true` but `workflow.mode: file`
2. Run `/kata pr status`
3. **Verify:** output includes `linear_link: requires linear mode`

## Test 4: PR Body Includes Linear References
1. On a Kata slice branch with Linear mode active and `pr.linear_link: true`
2. Create a PR via `/kata pr create` or `kata_create_pr`
3. **Verify:** PR body includes `## Linear Issues` section with `Closes KAT-N`

## Test 5: Linear Issue Gets PR Comment
1. After creating a PR (Test 4)
2. Open the Linear issue for the active slice
3. **Verify:** issue has a comment with the PR URL

## Test 6: Merge Advances Linear Issue
1. Merge the PR via `/kata pr merge` or `kata_merge_pr`
2. Open the Linear issue for the active slice
3. **Verify:** issue state is now "Done" / completed

## Test 7: Cross-Linking Failure Doesn't Block PR
1. Set an invalid `LINEAR_API_KEY`
2. Create a PR via `kata_create_pr`
3. **Verify:** PR is still created successfully; return includes `linearComment: "failed"`
