/**
 * Tests for the parallel worker registry used by the dashboard overlay.
 *
 * Verifies worker lifecycle (register → update → cleanup), batch grouping,
 * and the hasActiveWorkers() status check.
 */

import { describe, it, beforeEach } from "bun:test";
import assert from "node:assert/strict";
import {
  registerWorker,
  updateWorker,
  getActiveWorkers,
  getWorkerBatches,
  hasActiveWorkers,
  resetWorkerRegistry,
} from "../worker-registry.ts";

describe("worker-registry", () => {
  beforeEach(() => {
    resetWorkerRegistry();
  });

  describe("registration", () => {
    it("registers a worker with correct fields", () => {
      const id = registerWorker("scout", "Explore codebase", 0, 3, "batch-1");
      assert.ok(id.startsWith("worker-"), "worker ID has correct prefix");
      const workers = getActiveWorkers();
      assert.strictEqual(workers.length, 1);
      assert.strictEqual(workers[0].agent, "scout");
      assert.strictEqual(workers[0].task, "Explore codebase");
      assert.strictEqual(workers[0].status, "running");
      assert.strictEqual(workers[0].index, 0);
      assert.strictEqual(workers[0].batchSize, 3);
      assert.strictEqual(workers[0].batchId, "batch-1");
    });
  });

  describe("multiple workers in a batch", () => {
    it("tracks all workers and groups them into one batch", () => {
      registerWorker("scout", "Task A", 0, 3, "batch-2");
      registerWorker("researcher", "Task B", 1, 3, "batch-2");
      registerWorker("worker", "Task C", 2, 3, "batch-2");

      const workers = getActiveWorkers();
      assert.strictEqual(workers.length, 3);
      assert.ok(hasActiveWorkers());

      const batches = getWorkerBatches();
      assert.strictEqual(batches.size, 1);
      const batch = batches.get("batch-2");
      assert.ok(batch !== undefined);
      assert.strictEqual(batch!.length, 3);
    });
  });

  describe("status updates", () => {
    it("marks individual workers as completed while others remain running", () => {
      const id1 = registerWorker("scout", "Task A", 0, 2, "batch-3");
      const id2 = registerWorker("worker", "Task B", 1, 2, "batch-3");

      updateWorker(id1, "completed");
      const workers = getActiveWorkers();
      const w1 = workers.find((w) => w.id === id1);
      assert.strictEqual(w1?.status, "completed");

      const w2 = workers.find((w) => w.id === id2);
      assert.strictEqual(w2?.status, "running");
      assert.ok(hasActiveWorkers());
    });
  });

  describe("failed worker", () => {
    it("marks a worker as failed", () => {
      const id = registerWorker("scout", "Task A", 0, 1, "batch-4");
      updateWorker(id, "failed");
      const workers = getActiveWorkers();
      assert.strictEqual(workers[0].status, "failed");
    });
  });

  describe("multiple batches", () => {
    it("groups workers into separate batches", () => {
      registerWorker("scout", "Task A", 0, 2, "batch-5");
      registerWorker("worker", "Task B", 1, 2, "batch-5");
      registerWorker("researcher", "Task C", 0, 1, "batch-6");

      const batches = getWorkerBatches();
      assert.strictEqual(batches.size, 2);
      assert.strictEqual(batches.get("batch-5")!.length, 2);
      assert.strictEqual(batches.get("batch-6")!.length, 1);
    });
  });

  describe("hasActiveWorkers — all completed", () => {
    it("returns false when all workers are completed", () => {
      const id1 = registerWorker("scout", "Task A", 0, 2, "batch-7");
      const id2 = registerWorker("worker", "Task B", 1, 2, "batch-7");
      updateWorker(id1, "completed");
      updateWorker(id2, "completed");
      assert.ok(!hasActiveWorkers());
    });
  });

  describe("reset", () => {
    it("clears all workers", () => {
      registerWorker("scout", "Task", 0, 1, "batch-8");
      assert.ok(getActiveWorkers().length > 0);
      resetWorkerRegistry();
      assert.strictEqual(getActiveWorkers().length, 0);
      assert.ok(!hasActiveWorkers());
    });
  });

  describe("update non-existent worker", () => {
    it("is a no-op and does not throw", () => {
      updateWorker("nonexistent-id", "completed");
      assert.strictEqual(getActiveWorkers().length, 0);
    });
  });
});
