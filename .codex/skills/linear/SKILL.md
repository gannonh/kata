---
name: linear
description: |
  Use Symphony's `linear_graphql` client tool for raw Linear GraphQL
  operations such as comment editing and upload flows.
---

# Linear GraphQL

Use this skill for raw Linear GraphQL work during Symphony app-server sessions.

## Primary tool

Use the `linear_graphql` client tool exposed by Symphony's app-server session.
It reuses Symphony's configured Linear auth for the session.

Tool input:

```json
{
  "query": "query or mutation document",
  "variables": {
    "optional": "graphql variables object"
  }
}
```

Tool behavior:

- Send one GraphQL operation per tool call.
- Treat a top-level `errors` array as a failed GraphQL operation even if the
  tool call itself completed.
- Keep queries/mutations narrowly scoped; ask only for the fields you need.

## Discovering unfamiliar operations

When you need an unfamiliar mutation, input type, or object field, use targeted
introspection through `linear_graphql`.

List mutation names:

```graphql
query ListMutations {
  __type(name: "Mutation") {
    fields {
      name
    }
  }
}
```

Inspect a specific input object:

```graphql
query CommentCreateInputShape {
  __type(name: "CommentCreateInput") {
    inputFields {
      name
      type {
        kind
        name
        ofType {
          kind
          name
        }
      }
    }
  }
}
```

## Common workflows

### Query an issue by key, identifier, or id

Use these progressively:

- Start with `issue(id: $identifier)` when you have a ticket key such as
  `MT-686` or `KAT-857`.
- If you must use `issues(filter: ...)`, split `TEAM-NUMBER` and filter with
  `team.key` + `number` (do not use `IssueFilter.identifier`; it does not
  exist).
- Once you have the internal issue id, prefer `issue(id: $id)` for narrower reads.

Lookup by issue key/identifier:

```graphql
query IssueByIdentifier($identifier: String!) {
  issue(id: $identifier) {
    id
    identifier
    title
    state {
      id
      name
      type
    }
    project {
      id
      name
    }
    branchName
    url
    description
    updatedAt
  }
}
```

Lookup by identifier with `issues(filter: ...)` (valid syntax):

```graphql
query IssueByTeamKeyAndNumber($teamKey: String!, $number: Float!) {
  issues(
    filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }
    first: 1
  ) {
    nodes {
      id
      identifier
      title
      state {
        id
        name
        type
      }
      project {
        id
        name
      }
      branchName
      url
      description
      updatedAt
    }
  }
}
```

Given `KAT-857`, use `teamKey = "KAT"` and `number = 857`.

Resolve a key to an internal id:

```graphql
query IssueByIdOrKey($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
  }
}
```

Read the issue once the internal id is known:

```graphql
query IssueDetails($id: String!) {
  issue(id: $id) {
    id
    identifier
    title
    url
    description
    state {
      id
      name
      type
    }
    project {
      id
      name
    }
    attachments {
      nodes {
        id
        title
        url
        sourceType
      }
    }
  }
}
```

### Query slice hierarchy and planning documents

Use these when an issue represents a parent slice with child tasks and attached
plan docs.

Get child issues of a slice:

```graphql
query SliceChildren($id: String!) {
  issue(id: $id) {
    children {
      nodes {
        id
        identifier
        title
        state {
          name
        }
      }
    }
  }
}
```

Get documents attached to an issue:

```graphql
query IssueDocuments($id: String!) {
  issue(id: $id) {
    documents {
      nodes {
        id
        title
        content
      }
    }
  }
}
```

Get project documents:

```graphql
query ProjectDocuments($id: String!) {
  project(id: $id) {
    documents {
      nodes {
        id
        title
        content
      }
    }
  }
}
```

Get milestone from issue:

```graphql
query IssueMilestone($id: String!) {
  issue(id: $id) {
    projectMilestone {
      id
      name
    }
  }
}
```

### Query team workflow states for an issue

Use this before changing issue state when you need the exact `stateId`:

```graphql
query IssueTeamStates($id: String!) {
  issue(id: $id) {
    id
    team {
      id
      key
      name
      states {
        nodes {
          id
          name
          type
        }
      }
    }
  }
}
```

### Move an issue to a named state (resolve `stateId` first)

Use a two-step flow:

1. Query `issue(id: ...) { team { states { nodes { id name type } } } }`.
2. Pick the state whose `name` exactly matches your target and pass that
   `stateId` to `issueUpdate`.

```graphql
mutation MoveIssueToState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue {
      id
      identifier
      state {
        id
        name
      }
    }
  }
}
```

### Edit an existing comment

Use `commentUpdate` through `linear_graphql`:

```graphql
mutation UpdateComment($id: String!, $body: String!) {
  commentUpdate(id: $id, input: { body: $body }) {
    success
    comment {
      id
      body
    }
  }
}
```

### Create a comment

Use `commentCreate` through `linear_graphql`:

```graphql
mutation CreateComment($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) {
    success
    comment {
      id
      url
    }
  }
}
```

### Create an attachment/link on an issue

Use the GitHub-specific attachment mutation when linking a PR:

```graphql
mutation AttachGitHubPR($issueId: String!, $url: String!, $title: String) {
  attachmentLinkGitHubPR(
    issueId: $issueId
    url: $url
    title: $title
    linkKind: links
  ) {
    success
    attachment {
      id
      title
      url
    }
  }
}
```

If you only need a plain URL attachment and do not care about GitHub-specific
link metadata, use:

```graphql
mutation AttachURL($issueId: String!, $url: String!, $title: String) {
  attachmentLinkURL(issueId: $issueId, url: $url, title: $title) {
    success
    attachment {
      id
      title
      url
    }
  }
}
```

### Query issue attachments and relations

```graphql
query IssueAttachmentsAndRelations($id: String!) {
  issue(id: $id) {
    id
    identifier
    attachments(first: 20) {
      nodes {
        id
        title
        url
        sourceType
      }
    }
    relations(first: 20) {
      nodes {
        id
        type
        relatedIssue {
          id
          identifier
          title
          state {
            name
            type
          }
        }
      }
    }
    inverseRelations(first: 20) {
      nodes {
        id
        type
        issue {
          id
          identifier
          title
          state {
            name
            type
          }
        }
      }
    }
  }
}
```

### Common valid `IssueFilter` fields

Use these common fields inside `issues(filter: ...)`:

- `id`
- `number` (pair with `team.key` for identifier-style lookups)
- `team`
- `state`
- `project`
- `assignee`
- `title`
- `searchableContent`
- `createdAt`
- `updatedAt`
- `and` / `or`

`IssueFilter.identifier` is invalid.

### Introspection patterns used during schema discovery

Use these when the exact field or mutation shape is unclear:

```graphql
query QueryFields {
  __type(name: "Query") {
    fields {
      name
    }
  }
}
```

```graphql
query IssueFieldArgs {
  __type(name: "Query") {
    fields {
      name
      args {
        name
        type {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }
    }
  }
}
```

### Upload a video to a comment

Do this in three steps:

1. Call `linear_graphql` with `fileUpload` to get `uploadUrl`, `assetUrl`, and
   any required upload headers.
2. Upload the local file bytes to `uploadUrl` with `curl -X PUT` and the exact
   headers returned by `fileUpload`.
3. Call `linear_graphql` again with `commentCreate` (or `commentUpdate`) and
   include the resulting `assetUrl` in the comment body.

Useful mutations:

```graphql
mutation FileUpload(
  $filename: String!
  $contentType: String!
  $size: Int!
  $makePublic: Boolean
) {
  fileUpload(
    filename: $filename
    contentType: $contentType
    size: $size
    makePublic: $makePublic
  ) {
    success
    uploadFile {
      uploadUrl
      assetUrl
      headers {
        key
        value
      }
    }
  }
}
```

## Usage rules

- Use `linear_graphql` for comment edits, uploads, and ad-hoc Linear API
  queries.
- Prefer the narrowest issue lookup that matches what you already know:
  `issue(id: TEAM-NUMBER)` -> `issues(filter: { team.key + number })` ->
  internal id.
- Do not query `Issue.links`; use `Issue.attachments`, `Issue.relations`, and
  `Issue.inverseRelations` instead.
- Do not use `IssueFilter.identifier`; use `IssueFilter.number` with
  `IssueFilter.team.key` when you need identifier-style filtering.
- For state transitions, fetch team states first and use the exact `stateId`
  instead of hardcoding names inside mutations.
- Prefer `attachmentLinkGitHubPR` over a generic URL attachment when linking a
  GitHub PR to a Linear issue.
- Do not introduce new raw-token shell helpers for GraphQL access.
- If you need shell work for uploads, only use it for signed upload URLs
  returned by `fileUpload`; those URLs already carry the needed authorization.
