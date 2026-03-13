/**
 * Integration tests for the Kata entity hierarchy.
 *
 * Proves the full Kata→Linear hierarchy:
 *   ensureKataLabels → createKataMilestone → createKataSlice → createKataTask
 *
 * Then verifies query functions:
 *   listKataSlices  — returns slice filtered by kata:slice label
 *   listKataTasks   — returns tasks by parent slice issue
 *
 * Also exercises parseKataEntityTitle round-trip on both created titles.
 *
 * Gated by LINEAR_API_KEY env var — skips with a clear message if not set.
 * All created entities are deleted in after() — the test leaves the workspace
 * clean even on partial failure (IDs tracked as created; delete what exists).
 *
 * Usage:
 *   LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/entity-hierarchy.integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { LinearClient } from "../linear-client.ts";
import {
  ensureKataLabels,
  createKataMilestone,
  createKataSlice,
  createKataTask,
  listKataSlices,
  listKataTasks,
  parseKataEntityTitle,
} from "../linear-entities.ts";
import type { KataLabelSet, LinearIssue, LinearMilestone } from "../linear-types.ts";

const API_KEY = process.env.LINEAR_API_KEY;

describe(
  "Kata Entity Hierarchy — Integration",
  { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined },
  () => {
    let client: LinearClient;
    let teamId: string;
    let projectId: string;
    const testTag = `kata-s03-${Date.now()}`;

    // Track created entity IDs for cleanup
    let labelSet: KataLabelSet | undefined;
    let milestone: LinearMilestone | undefined;
    let sliceIssue: LinearIssue | undefined;
    let taskIssue: LinearIssue | undefined;

    before(async () => {
      client = new LinearClient(API_KEY!);

      // Resolve team and project — same pattern as S01 integration test
      const teams = await client.listTeams();
      assert.ok(teams.length > 0, "workspace has at least one team");
      teamId = teams[0].id;

      const projects = await client.listProjects({ teamId });
      assert.ok(projects.length > 0, "team has at least one project");
      projectId = projects[0].id;
    });

    // =========================================================================
    // Label provisioning
    // =========================================================================

    it("ensureKataLabels provisions all three labels idempotently", async () => {
      labelSet = await ensureKataLabels(client, teamId);

      assert.ok(labelSet.milestone.id, "milestone label has id");
      assert.ok(labelSet.slice.id, "slice label has id");
      assert.ok(labelSet.task.id, "task label has id");

      assert.equal(labelSet.milestone.name, "kata:milestone");
      assert.equal(labelSet.slice.name, "kata:slice");
      assert.equal(labelSet.task.name, "kata:task");

      // Idempotency: calling again should return same IDs
      const labelSet2 = await ensureKataLabels(client, teamId);
      assert.equal(labelSet2.milestone.id, labelSet.milestone.id, "milestone label stable");
      assert.equal(labelSet2.slice.id, labelSet.slice.id, "slice label stable");
      assert.equal(labelSet2.task.id, labelSet.task.id, "task label stable");
    });

    // =========================================================================
    // Milestone creation
    // =========================================================================

    it("createKataMilestone creates a milestone with formatted name", async () => {
      assert.ok(labelSet, "labelSet must be provisioned first");

      milestone = await createKataMilestone(
        client,
        { projectId },
        { kataId: "M001", title: testTag }
      );

      assert.ok(milestone.id, "milestone has id");
      assert.equal(milestone.name, `[M001] ${testTag}`, "milestone name formatted correctly");

      // parseKataEntityTitle round-trip
      const parsed = parseKataEntityTitle(milestone.name);
      assert.ok(parsed, "milestone name is parseable");
      assert.equal(parsed!.kataId, "M001");
      assert.equal(parsed!.title, testTag);
    });

    // =========================================================================
    // Slice creation
    // =========================================================================

    it("createKataSlice creates a labeled slice issue in the project", async () => {
      assert.ok(labelSet, "labelSet required");
      assert.ok(milestone, "milestone required");

      const states = await client.listWorkflowStates(teamId);

      sliceIssue = await createKataSlice(
        client,
        { teamId, projectId, labelSet },
        {
          kataId: "S01",
          title: testTag,
          milestoneId: milestone.id,
          initialPhase: "planning",
          states,
        }
      );

      assert.ok(sliceIssue.id, "slice issue has id");
      assert.equal(sliceIssue.title, `[S01] ${testTag}`, "slice title formatted correctly");

      // Must have kata:slice label
      const sliceLabelNames = sliceIssue.labels.map((l) => l.name);
      assert.ok(
        sliceLabelNames.includes("kata:slice"),
        `slice labels should contain "kata:slice", got: ${sliceLabelNames.join(", ")}`
      );
    });

    // =========================================================================
    // Task creation
    // =========================================================================

    it("createKataTask creates a sub-issue with kata:task label", async () => {
      assert.ok(labelSet, "labelSet required");
      assert.ok(sliceIssue, "sliceIssue required");

      const states = await client.listWorkflowStates(teamId);

      taskIssue = await createKataTask(
        client,
        { teamId, projectId, labelSet },
        {
          kataId: "T01",
          title: testTag,
          sliceIssueId: sliceIssue.id,
          initialPhase: "planning",
          states,
        }
      );

      assert.ok(taskIssue.id, "task issue has id");
      assert.equal(taskIssue.title, `[T01] ${testTag}`, "task title formatted correctly");

      // Must have kata:task label
      const taskLabelNames = taskIssue.labels.map((l) => l.name);
      assert.ok(
        taskLabelNames.includes("kata:task"),
        `task labels should contain "kata:task", got: ${taskLabelNames.join(", ")}`
      );

      // Sub-issue hierarchy: task.parent.id === slice.id
      assert.ok(taskIssue.parent, "task issue has parent reference");
      assert.equal(
        taskIssue.parent!.id,
        sliceIssue.id,
        "task.parent.id === slice.id — sub-issue hierarchy confirmed"
      );
    });

    // =========================================================================
    // listKataSlices
    // =========================================================================

    it("listKataSlices returns the created slice issue", async () => {
      assert.ok(labelSet, "labelSet required");
      assert.ok(sliceIssue, "sliceIssue required");

      const slices = await listKataSlices(client, projectId, labelSet.slice.id);

      const found = slices.find((s) => s.id === sliceIssue!.id);
      assert.ok(
        found,
        `listKataSlices should contain slice ${sliceIssue.id}; got IDs: ${slices.map((s) => s.id).join(", ")}`
      );
    });

    // =========================================================================
    // listKataTasks
    // =========================================================================

    it("listKataTasks returns the created task sub-issue", async () => {
      assert.ok(sliceIssue, "sliceIssue required");
      assert.ok(taskIssue, "taskIssue required");

      const tasks = await listKataTasks(client, sliceIssue.id);

      const found = tasks.find((t) => t.id === taskIssue!.id);
      assert.ok(
        found,
        `listKataTasks should contain task ${taskIssue.id}; got IDs: ${tasks.map((t) => t.id).join(", ")}`
      );
    });

    // =========================================================================
    // parseKataEntityTitle round-trip
    // =========================================================================

    it("parseKataEntityTitle recovers kataId from slice and task titles", () => {
      assert.ok(sliceIssue, "sliceIssue required");
      assert.ok(taskIssue, "taskIssue required");

      const sliceParsed = parseKataEntityTitle(sliceIssue.title);
      assert.ok(sliceParsed, `slice title should be parseable: "${sliceIssue.title}"`);
      assert.equal(sliceParsed!.kataId, "S01", "slice kataId recovered");
      assert.equal(sliceParsed!.title, testTag, "slice title content recovered");

      const taskParsed = parseKataEntityTitle(taskIssue.title);
      assert.ok(taskParsed, `task title should be parseable: "${taskIssue.title}"`);
      assert.equal(taskParsed!.kataId, "T01", "task kataId recovered");
      assert.equal(taskParsed!.title, testTag, "task title content recovered");
    });

    // =========================================================================
    // Cleanup
    // =========================================================================

    after(async () => {
      // Cleanup order: task → slice → milestone
      // Labels are NOT deleted — they are idempotent and shared across runs
      const cleanupSteps: Array<[string, () => Promise<unknown>]> = [
        [
          "task issue",
          () => (taskIssue ? client.deleteIssue(taskIssue.id) : Promise.resolve()),
        ],
        [
          "slice issue",
          () => (sliceIssue ? client.deleteIssue(sliceIssue.id) : Promise.resolve()),
        ],
        [
          "milestone",
          () => (milestone ? client.deleteMilestone(milestone.id) : Promise.resolve()),
        ],
      ];

      for (const [name, fn] of cleanupSteps) {
        try {
          await fn();
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          // Silently skip "not found" errors — entity may not have been created
          if (!msg.toLowerCase().includes("not found") && !msg.includes("Entity not found")) {
            console.log(`  Cleanup failed for ${name}: ${msg}`);
          }
        }
      }
    });
  }
);
