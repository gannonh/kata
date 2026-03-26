/**
 * Tests for the parallel worker registry used by the dashboard overlay.
 *
 * Verifies worker lifecycle (register → update → cleanup), batch grouping,
 * and the hasActiveWorkers() status check.
 */

import { describe, it, beforeEach, expect } from 'vitest'
import {
  registerWorker,
  updateWorker,
  getActiveWorkers,
  getWorkerBatches,
  hasActiveWorkers,
  resetWorkerRegistry,
} from "../worker-registry.js";

describe("worker-registry", () => {
  beforeEach(() => {
    resetWorkerRegistry();
  });

  describe("registration", () => {
    it("registers a worker with correct fields", () => {
      const id = registerWorker("scout", "Explore codebase", 0, 3, "batch-1");
      expect(id.startsWith("worker-")).toBe(true);
      const workers = getActiveWorkers();
      expect(workers.length).toBe(1);
      expect(workers[0].agent).toBe("scout");
      expect(workers[0].task).toBe("Explore codebase");
      expect(workers[0].status).toBe("running");
      expect(workers[0].index).toBe(0);
      expect(workers[0].batchSize).toBe(3);
      expect(workers[0].batchId).toBe("batch-1");
    });
  });

  describe("multiple workers in a batch", () => {
    it("tracks all workers and groups them into one batch", () => {
      registerWorker("scout", "Task A", 0, 3, "batch-2");
      registerWorker("researcher", "Task B", 1, 3, "batch-2");
      registerWorker("worker", "Task C", 2, 3, "batch-2");

      const workers = getActiveWorkers();
      expect(workers.length).toBe(3);
      expect(hasActiveWorkers()).toBe(true);

      const batches = getWorkerBatches();
      expect(batches.size).toBe(1);
      const batch = batches.get("batch-2");
      expect(batch).toBeDefined();
      expect(batch!.length).toBe(3);
    });
  });

  describe("status updates", () => {
    it("marks individual workers as completed while others remain running", () => {
      const id1 = registerWorker("scout", "Task A", 0, 2, "batch-3");
      const id2 = registerWorker("worker", "Task B", 1, 2, "batch-3");

      updateWorker(id1, "completed");
      const workers = getActiveWorkers();
      const w1 = workers.find((w) => w.id === id1);
      expect(w1?.status).toBe("completed");

      const w2 = workers.find((w) => w.id === id2);
      expect(w2?.status).toBe("running");
      expect(hasActiveWorkers()).toBe(true);
    });
  });

  describe("failed worker", () => {
    it("marks a worker as failed", () => {
      const id = registerWorker("scout", "Task A", 0, 1, "batch-4");
      updateWorker(id, "failed");
      const workers = getActiveWorkers();
      expect(workers[0].status).toBe("failed");
    });
  });

  describe("multiple batches", () => {
    it("groups workers into separate batches", () => {
      registerWorker("scout", "Task A", 0, 2, "batch-5");
      registerWorker("worker", "Task B", 1, 2, "batch-5");
      registerWorker("researcher", "Task C", 0, 1, "batch-6");

      const batches = getWorkerBatches();
      expect(batches.size).toBe(2);
      expect(batches.get("batch-5")!.length).toBe(2);
      expect(batches.get("batch-6")!.length).toBe(1);
    });
  });

  describe("hasActiveWorkers — all completed", () => {
    it("returns false when all workers are completed", () => {
      const id1 = registerWorker("scout", "Task A", 0, 2, "batch-7");
      const id2 = registerWorker("worker", "Task B", 1, 2, "batch-7");
      updateWorker(id1, "completed");
      updateWorker(id2, "completed");
      expect(hasActiveWorkers()).toBe(false);
    });
  });

  describe("reset", () => {
    it("clears all workers", () => {
      registerWorker("scout", "Task", 0, 1, "batch-8");
      expect(getActiveWorkers().length > 0).toBe(true);
      resetWorkerRegistry();
      expect(getActiveWorkers().length).toBe(0);
      expect(hasActiveWorkers()).toBe(false);
    });
  });

  describe("update non-existent worker", () => {
    it("is a no-op and does not throw", () => {
      updateWorker("nonexistent-id", "completed");
      expect(getActiveWorkers().length).toBe(0);
    });
  });
});
