/**
 * Integration tests for Linear GraphQL Client.
 *
 * Exercises all entity CRUD operations against a real Linear workspace.
 * Gated by LINEAR_API_KEY env var — skips with clear message if not set.
 *
 * Usage:
 *   LINEAR_API_KEY=<key> node --import ./src/resources/extensions/linear/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test src/resources/extensions/linear/tests/integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { LinearClient } from "../linear-client.ts";

const API_KEY = process.env.LINEAR_API_KEY;

describe("Linear GraphQL Client — Integration", { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined }, () => {
  let client: LinearClient;
  let teamId: string;
  const testTag = `kata-int-${Date.now()}`;

  // Track created entity IDs for cleanup reference
  let projectId: string;
  let milestoneId: string;
  let parentIssueId: string;
  let childIssueId: string;
  let labelId: string;
  let doc1Id: string;
  let doc2Id: string;

  before(() => {
    client = new LinearClient(API_KEY!);
  });

  // =========================================================================
  // Auth & Viewer
  // =========================================================================

  describe("Auth & Viewer", () => {
    it("getViewer returns authenticated user", async () => {
      const viewer = await client.getViewer();
      assert.ok(viewer.id, "viewer has id");
      assert.ok(viewer.email, "viewer has email");
      assert.ok(viewer.name, "viewer has name");
    });
  });

  // =========================================================================
  // Teams
  // =========================================================================

  describe("Teams", () => {
    it("listTeams returns at least one team", async () => {
      const teams = await client.listTeams();
      assert.ok(teams.length > 0, "should have at least one team");
      teamId = teams[0].id;
      assert.ok(teams[0].key, "team has key");
      assert.ok(teams[0].name, "team has name");
    });

    it("getTeam by key returns correct team", async () => {
      const teams = await client.listTeams();
      const team = await client.getTeam(teams[0].key);
      assert.ok(team, "team found by key");
      assert.equal(team!.id, teams[0].id);
    });

    it("getTeam by id returns correct team", async () => {
      const team = await client.getTeam(teamId);
      assert.ok(team, "team found by id");
      assert.equal(team!.id, teamId);
    });
  });

  // =========================================================================
  // Projects
  // =========================================================================

  describe("Projects", () => {
    it("createProject creates a project", async () => {
      const project = await client.createProject({
        name: `Test Project ${testTag}`,
        teamIds: [teamId],
      });
      projectId = project.id;
      assert.ok(project.id, "project has id");
      assert.equal(project.name, `Test Project ${testTag}`);
      assert.ok(project.url, "project has url");
    });

    it("getProject returns the created project", async () => {
      const project = await client.getProject(projectId);
      assert.ok(project, "project found");
      assert.equal(project!.name, `Test Project ${testTag}`);
    });

    it("listProjects includes the created project", async () => {
      const projects = await client.listProjects();
      const found = projects.find((p) => p.id === projectId);
      assert.ok(found, "created project appears in list");
    });

    it("updateProject changes project name", async () => {
      const updated = await client.updateProject(projectId, {
        name: `Updated ${testTag}`,
      });
      assert.equal(updated.name, `Updated ${testTag}`);
    });
  });

  // =========================================================================
  // Milestones
  // =========================================================================

  describe("Milestones", () => {
    it("createMilestone under project", async () => {
      const ms = await client.createMilestone({
        name: `M001 ${testTag}`,
        projectId,
      });
      milestoneId = ms.id;
      assert.ok(ms.id, "milestone has id");
      assert.equal(ms.name, `M001 ${testTag}`);
    });

    it("getMilestone returns the created milestone", async () => {
      const ms = await client.getMilestone(milestoneId);
      assert.ok(ms, "milestone found");
      assert.equal(ms!.name, `M001 ${testTag}`);
    });

    it("listMilestones under project returns at least one", async () => {
      const milestones = await client.listMilestones(projectId);
      assert.ok(milestones.length > 0, "has milestones");
      const found = milestones.find((m) => m.id === milestoneId);
      assert.ok(found, "created milestone in list");
    });

    it("updateMilestone changes description", async () => {
      const updated = await client.updateMilestone(milestoneId, {
        description: "Updated description",
      });
      assert.equal(updated.description, "Updated description");
    });
  });

  // =========================================================================
  // Issues & Sub-Issues
  // =========================================================================

  describe("Issues & Sub-Issues", () => {
    it("createIssue creates a parent issue", async () => {
      const issue = await client.createIssue({
        title: `Slice ${testTag}`,
        teamId,
        projectId,
        projectMilestoneId: milestoneId,
      });
      parentIssueId = issue.id;
      assert.ok(issue.id, "issue has id");
      assert.ok(issue.identifier, "issue has identifier");
      assert.equal(issue.title, `Slice ${testTag}`);
      assert.ok(issue.state, "issue has state");
    });

    it("createIssue with parentId creates a sub-issue", async () => {
      const child = await client.createIssue({
        title: `Task ${testTag}`,
        teamId,
        parentId: parentIssueId,
      });
      childIssueId = child.id;
      assert.ok(child.id, "sub-issue has id");
      assert.ok(child.parent, "sub-issue has parent reference");
      assert.equal(child.parent!.id, parentIssueId);
    });

    it("getIssue returns parent with children", async () => {
      const parent = await client.getIssue(parentIssueId);
      assert.ok(parent, "parent found");
      assert.ok(parent!.children.nodes.length > 0, "parent has children");
      const child = parent!.children.nodes.find((c) => c.id === childIssueId);
      assert.ok(child, "specific child found in parent's children");
    });

    it("listIssues with filter returns expected issues", async () => {
      const issues = await client.listIssues({ projectId });
      const found = issues.find((i) => i.id === parentIssueId);
      assert.ok(found, "parent issue found in project issues");
    });

    it("updateIssue changes title", async () => {
      const updated = await client.updateIssue(parentIssueId, {
        title: `Updated Slice ${testTag}`,
      });
      assert.equal(updated.title, `Updated Slice ${testTag}`);
    });
  });

  // =========================================================================
  // Workflow States
  // =========================================================================

  describe("Workflow States", () => {
    it("listWorkflowStates returns states with type field", async () => {
      const states = await client.listWorkflowStates(teamId);
      assert.ok(states.length > 0, "has workflow states");
      // Verify each state has the expected fields
      for (const s of states) {
        assert.ok(s.id, "state has id");
        assert.ok(s.name, "state has name");
        assert.ok(
          ["backlog", "unstarted", "started", "completed", "canceled"].includes(s.type),
          `state type "${s.type}" is valid`,
        );
      }
      // Should have at least one completed-type state
      const completed = states.find((s) => s.type === "completed");
      assert.ok(completed, "has a completed state");
    });
  });

  // =========================================================================
  // Labels (with ensureLabel idempotency)
  // =========================================================================

  describe("Labels", () => {
    it("createLabel creates a workspace label", async () => {
      const label = await client.createLabel({
        name: `kata-test-${testTag}`,
        color: "#FF0000",
      });
      labelId = label.id;
      assert.ok(label.id, "label has id");
      assert.equal(label.name, `kata-test-${testTag}`);
    });

    it("listLabels includes created label", async () => {
      const labels = await client.listLabels();
      const found = labels.find((l) => l.id === labelId);
      assert.ok(found, "created label in list");
    });

    it("ensureLabel returns existing label (idempotent)", async () => {
      const label = await client.ensureLabel(`kata-test-${testTag}`);
      assert.equal(label.id, labelId, "same label ID returned");
    });

    it("ensureLabel creates new label if not found", async () => {
      const unique = `kata-ensure-${Date.now()}`;
      const label = await client.ensureLabel(unique, { color: "#00FF00" });
      assert.ok(label.id, "new label created");
      assert.equal(label.name, unique);
      // Cleanup: we can't delete labels via API easily, but they're workspace-level
    });
  });

  // =========================================================================
  // Documents (including issueId — the [Internal] field)
  // =========================================================================

  describe("Documents", () => {
    it("createDocument with projectId", async () => {
      const doc = await client.createDocument({
        title: `Doc ${testTag}`,
        content: "# Test Document\n\nHello world from integration test.",
        projectId,
      });
      doc1Id = doc.id;
      assert.ok(doc.id, "document has id");
      assert.equal(doc.title, `Doc ${testTag}`);
    });

    it("createDocument with issueId (retires [Internal] field risk)", async () => {
      const doc = await client.createDocument({
        title: `Issue Doc ${testTag}`,
        content: "# Task Document\n\nAttached to an issue.",
        issueId: parentIssueId,
      });
      doc2Id = doc.id;
      assert.ok(doc.id, "document with issueId has id");
      assert.equal(doc.title, `Issue Doc ${testTag}`);
    });

    it("getDocument returns full content", async () => {
      const doc = await client.getDocument(doc1Id);
      assert.ok(doc, "document found");
      assert.ok(doc!.content.includes("Hello world"), "content preserved");
    });

    it("listDocuments includes created documents", async () => {
      const docs = await client.listDocuments({ projectId });
      const found = docs.find((d) => d.id === doc1Id);
      assert.ok(found, "created document in list");
    });

    it("updateDocument changes content", async () => {
      const updated = await client.updateDocument(doc1Id, {
        content: "# Updated Content\n\nNew body.",
      });
      assert.ok(updated.content.includes("Updated Content"), "content updated");
    });
  });

  // =========================================================================
  // Error Handling
  // =========================================================================

  describe("Error Handling", () => {
    it("invalid API key throws auth error", async () => {
      const badClient = new LinearClient("invalid-key-12345");
      await assert.rejects(
        () => badClient.getViewer(),
        (err: Error) => {
          assert.ok(
            err.message.includes("Authentication") || err.name === "LinearHttpError",
            `Expected auth error, got: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("getProject with nonexistent id returns null", async () => {
      const result = await client.getProject("00000000-0000-0000-0000-000000000000");
      assert.equal(result, null);
    });

    it("getIssue with nonexistent id returns null", async () => {
      const result = await client.getIssue("00000000-0000-0000-0000-000000000000");
      assert.equal(result, null);
    });
  });

  // =========================================================================
  // Cleanup
  // =========================================================================

  after(() => {
    // Log created entities for manual cleanup if needed
    console.log(`\n  Test entities created (manual cleanup may be needed):`);
    console.log(`    Project: ${projectId}`);
    console.log(`    Milestone: ${milestoneId}`);
    console.log(`    Parent Issue: ${parentIssueId}`);
    console.log(`    Child Issue: ${childIssueId}`);
    console.log(`    Label: ${labelId}`);
    console.log(`    Documents: ${doc1Id}, ${doc2Id}`);
  });
});
