/**
 * Integration tests for Linear-mode state derivation.
 *
 * Proves the full Kata→Linear state derivation path:
 *   ensureKataLabels → createKataMilestone → createKataSlice → createKataTask
 *   → listKataMilestones → deriveLinearState → kata_update_issue_state → re-derive
 *
 * Tests:
 *   1. listKataMilestones returns the created milestone
 *   2. deriveLinearState returns a correct KataState (activeMilestone, activeSlice,
 *      activeTask, phase="executing", progress.tasks.total=1, progress.tasks.done=0)
 *   3. kata_update_issue_state advances task to "done", returns state.type "completed"
 *   4. Re-derive state after advancement: phase="summarizing", progress.tasks.done=1
 *
 * Gated by LINEAR_API_KEY env var — skips with a clear message if not set.
 * All created entities are deleted in after() via Promise.allSettled.
 *
 * Usage:
 *   LINEAR_API_KEY=<key> node --import ./src/resources/extensions/kata/tests/resolve-ts.mjs \
 *     --experimental-strip-types --test \
 *     src/resources/extensions/linear/tests/linear-state.integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { LinearClient } from "../linear-client.ts";
import {
  ensureKataLabels,
  createKataMilestone,
  createKataSlice,
  createKataTask,
  listKataMilestones,
  getLinearStateForKataPhase,
} from "../linear-entities.ts";
import { deriveLinearState } from "../linear-state.ts";
import type { KataLabelSet, LinearIssue, LinearMilestone } from "../linear-types.ts";

const API_KEY = process.env.LINEAR_API_KEY;

describe(
  "Linear State Derivation — Integration",
  { skip: !API_KEY ? "LINEAR_API_KEY not set" : undefined },
  () => {
    let client: LinearClient;
    let teamId: string;
    let projectId: string;
    const testTag = `kata-s05-${Date.now()}`;

    // Track created entity IDs for cleanup
    let labelSet: KataLabelSet | undefined;
    let milestone: LinearMilestone | undefined;
    let sliceIssue: LinearIssue | undefined;
    let taskIssue: LinearIssue | undefined;

    before(async () => {
      client = new LinearClient(API_KEY!);

      // Resolve team and project — same pattern as entity-hierarchy integration test
      const teams = await client.listTeams();
      assert.ok(teams.length > 0, "workspace has at least one team");
      teamId = teams[0].id;

      const projects = await client.listProjects({ teamId });
      assert.ok(projects.length > 0, "team has at least one project");
      projectId = projects[0].id;

      // Provision labels
      labelSet = await ensureKataLabels(client, teamId);

      // Get workflow states once — reused for all creates
      const states = await client.listWorkflowStates(teamId);

      // Create milestone
      milestone = await createKataMilestone(
        client,
        { projectId },
        { kataId: "M001", title: testTag }
      );

      // Create slice in "executing" (started) state so deriveLinearState can find it active
      sliceIssue = await createKataSlice(
        client,
        { teamId, projectId, labelSet },
        {
          kataId: "S01",
          title: testTag,
          milestoneId: milestone.id,
          initialPhase: "executing",
          states,
        }
      );

      // Create task sub-issue in "executing" (started) state
      taskIssue = await createKataTask(
        client,
        { teamId, projectId, labelSet },
        {
          kataId: "T01",
          title: testTag,
          sliceIssueId: sliceIssue.id,
          initialPhase: "executing",
          states,
        }
      );
    });

    // =========================================================================
    // listKataMilestones
    // =========================================================================

    it("listKataMilestones returns the created milestone", async () => {
      assert.ok(milestone, "milestone required");

      const milestones = await listKataMilestones(client, projectId);
      const found = milestones.find((m) => m.id === milestone!.id);
      assert.ok(
        found,
        `listKataMilestones should contain milestone ${milestone.id}; got IDs: ${milestones.map((m) => m.id).join(", ")}`
      );
      assert.equal(found!.name, `[M001] ${testTag}`, "milestone name matches formatted title");
    });

    // =========================================================================
    // deriveLinearState — initial state (executing phase)
    // =========================================================================

    it("deriveLinearState returns correct KataState for executing phase", async () => {
      assert.ok(labelSet, "labelSet required");
      assert.ok(milestone, "milestone required");
      assert.ok(sliceIssue, "sliceIssue required");
      assert.ok(taskIssue, "taskIssue required");

      const state = await deriveLinearState(client, {
        projectId,
        teamId,
        sliceLabelId: labelSet.slice.id,
      });

      // Phase must be "executing" (slice started, task exists but not terminal)
      assert.equal(state.phase, "executing", `phase should be "executing", got "${state.phase}"`);

      // activeMilestone must match the created milestone's kataId
      assert.ok(state.activeMilestone, "activeMilestone should be set");
      assert.equal(
        state.activeMilestone.id,
        "M001",
        `activeMilestone.id should be "M001", got "${state.activeMilestone.id}"`
      );

      // activeSlice must match the created slice's kataId
      assert.ok(state.activeSlice, "activeSlice should be set");
      assert.equal(
        state.activeSlice.id,
        "S01",
        `activeSlice.id should be "S01", got "${state.activeSlice.id}"`
      );

      // activeTask must match the created task's kataId
      assert.ok(state.activeTask, "activeTask should be set");
      assert.equal(
        state.activeTask.id,
        "T01",
        `activeTask.id should be "T01", got "${state.activeTask.id}"`
      );

      // Progress: tasks total=1, done=0
      assert.ok(state.progress.tasks, "progress.tasks should be present");
      assert.equal(state.progress.tasks!.total, 1, "progress.tasks.total should be 1");
      assert.equal(state.progress.tasks!.done, 0, "progress.tasks.done should be 0");
    });

    // =========================================================================
    // kata_update_issue_state — advance task to "done"
    // =========================================================================

    it("kata_update_issue_state advances task to done and returns state.type completed", async () => {
      assert.ok(taskIssue, "taskIssue required");

      const states = await client.listWorkflowStates(teamId);
      const doneState = getLinearStateForKataPhase(states, "done");
      assert.ok(doneState, "team must have a 'completed' workflow state");

      const updated = await client.updateIssue(taskIssue.id, { stateId: doneState.id });

      assert.ok(updated.state, "updated issue has state");
      assert.equal(
        updated.state.type,
        "completed",
        `updated issue state.type should be "completed", got "${updated.state.type}"`
      );

      // Update local reference so cleanup knows the task was advanced
      taskIssue = updated;
    });

    // =========================================================================
    // deriveLinearState — re-derive after task advancement (summarizing phase)
    // =========================================================================

    it("deriveLinearState reflects task advancement: phase changed from executing", async () => {
      assert.ok(labelSet, "labelSet required");

      const state = await deriveLinearState(client, {
        projectId,
        teamId,
        sliceLabelId: labelSet.slice.id,
      });

      // Phase must have advanced from "executing" after the task was marked done.
      // Several outcomes are valid depending on Linear automation timing:
      //   "summarizing"          — slice stays started; all children terminal → summarizing
      //   "completing-milestone" — Linear auto-advanced slice to done; all slices now terminal
      //   "complete"             — Linear auto-advanced everything to done
      //   "pre-planning"         — Linear auto-completed milestone; next milestone has no slices
      const validPhases = ["summarizing", "completing-milestone", "complete", "pre-planning"];
      assert.ok(
        validPhases.includes(state.phase),
        `phase should be one of ${validPhases.join("/")} after task marked done, got "${state.phase}"`
      );
      assert.notEqual(state.phase, "executing", "phase must have advanced from executing");

      if (state.phase === "summarizing") {
        // In summarizing: activeMilestone and activeSlice still point to the same entities
        assert.ok(state.activeMilestone, "activeMilestone should still be set in summarizing");
        assert.equal(state.activeMilestone!.id, "M001", "activeMilestone.id unchanged");

        assert.ok(state.activeSlice, "activeSlice should still be set in summarizing");
        assert.equal(state.activeSlice!.id, "S01", "activeSlice.id unchanged");

        // No active task in summarizing phase (all terminal)
        assert.equal(state.activeTask, null, "activeTask should be null in summarizing phase");

        // Progress: tasks total=1, done=1
        assert.ok(state.progress.tasks, "progress.tasks should be present in summarizing");
        assert.equal(state.progress.tasks!.total, 1, "progress.tasks.total should be 1");
        assert.equal(state.progress.tasks!.done, 1, "progress.tasks.done should be 1 after advancement");
      } else {
        // "complete" — workspace auto-completed the slice and milestone
        // activeMilestone and activeSlice are null (all complete)
        assert.equal(state.activeMilestone, null, "activeMilestone null in complete phase");
        assert.equal(state.activeSlice, null, "activeSlice null in complete phase");
        assert.equal(state.activeTask, null, "activeTask null in complete phase");
      }
    });

    // =========================================================================
    // Cleanup
    // =========================================================================

    after(async () => {
      // Cleanup order: task → slice → milestone (reverse creation order)
      // Labels are NOT deleted — they are idempotent and shared across runs
      const results = await Promise.allSettled([
        taskIssue ? client.deleteIssue(taskIssue.id) : Promise.resolve(),
      ]);

      // Wait for task delete before slice delete (parent constraint)
      await Promise.allSettled([
        sliceIssue ? client.deleteIssue(sliceIssue.id) : Promise.resolve(),
      ]);

      await Promise.allSettled([
        milestone ? client.deleteMilestone(milestone.id) : Promise.resolve(),
      ]);

      // Log any unexpected cleanup failures (not "not found")
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const msg = (result.reason as Error).message ?? String(result.reason);
          if (!msg.toLowerCase().includes("not found") && !msg.includes("Entity not found")) {
            console.log(`  Cleanup failed for item ${i}: ${msg}`);
          }
        }
      });
    });
  }
);
