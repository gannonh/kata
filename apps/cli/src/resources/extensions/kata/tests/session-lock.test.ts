import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  acquireSessionLock,
  isSessionLockHeld,
  readSessionLockData,
  releaseSessionLock,
  updateSessionLock,
} from "../session-lock.ts";

function makeBaseDir(): string {
  return mkdtempSync(join(tmpdir(), "kata-session-lock-"));
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initRepoWithWorktree(): { mainRepo: string; worktree: string } {
  const mainRepo = mkdtempSync(join(tmpdir(), "kata-session-lock-repo-"));
  const worktree = `${mainRepo}-wt`;
  git(mainRepo, ["init", "-b", "main"]);
  git(mainRepo, ["config", "user.name", "Pi Test"]);
  git(mainRepo, ["config", "user.email", "pi@example.com"]);
  writeFileSync(join(mainRepo, "README.md"), "hello\n", "utf-8");
  git(mainRepo, ["add", "README.md"]);
  git(mainRepo, ["commit", "-m", "init"]);
  git(mainRepo, ["worktree", "add", worktree]);
  return { mainRepo, worktree };
}

function lockFile(basePath: string): string {
  return join(basePath, ".kata-cli", "auto.lock");
}

function lockDir(basePath: string): string {
  return `${join(basePath, ".kata-cli")}.lock`;
}

function seedLockMetadata(basePath: string, pid: number): void {
  mkdirSync(join(basePath, ".kata-cli"), { recursive: true });
  writeFileSync(
    lockFile(basePath),
    JSON.stringify(
      {
        pid,
        startedAt: new Date().toISOString(),
        unitType: "execute-task",
        unitId: "M001/S01/T01",
        unitStartedAt: new Date().toISOString(),
        completedUnits: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
}

describe("session-lock", () => {
  it("acquire succeeds and release clears lock state", () => {
    const basePath = makeBaseDir();
    try {
      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, true);
      assert.equal(isSessionLockHeld(basePath), true);

      const data = readSessionLockData(basePath);
      assert.ok(data);
      assert.equal(data.pid, process.pid);

      releaseSessionLock(basePath);
      assert.equal(isSessionLockHeld(basePath), false);
      assert.equal(readSessionLockData(basePath), null);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("concurrent acquire reports existing live pid", () => {
    const basePath = makeBaseDir();
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000);"],
      { stdio: "ignore" },
    );

    try {
      assert.ok(child.pid);
      seedLockMetadata(basePath, child.pid!);
      mkdirSync(lockDir(basePath), { recursive: true });

      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, false);
      if (!result.acquired) {
        assert.equal(result.existingPid, child.pid);
        assert.match(result.reason, /Another auto-mode session/i);
      }
    } finally {
      child.kill("SIGTERM");
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("release then re-acquire succeeds", () => {
    const basePath = makeBaseDir();
    try {
      const first = acquireSessionLock(basePath);
      assert.equal(first.acquired, true);
      releaseSessionLock(basePath);

      const second = acquireSessionLock(basePath);
      assert.equal(second.acquired, true);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("readSessionLockData includes updated metadata", () => {
    const basePath = makeBaseDir();
    try {
      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, true);

      updateSessionLock(
        basePath,
        "execute-task",
        "M001/S01/T02",
        3,
        "/tmp/session.jsonl",
      );

      const data = readSessionLockData(basePath);
      assert.ok(data);
      assert.equal(data.pid, process.pid);
      assert.equal(data.unitType, "execute-task");
      assert.equal(data.unitId, "M001/S01/T02");
      assert.equal(data.completedUnits, 3);
      assert.equal(data.sessionFile, "/tmp/session.jsonl");
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("updateSessionLock preserves session startedAt timestamp", () => {
    const basePath = makeBaseDir();
    try {
      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, true);

      const before = readSessionLockData(basePath);
      assert.ok(before);

      updateSessionLock(basePath, "execute-task", "M001/S01/T03", 2);

      const after = readSessionLockData(basePath);
      assert.ok(after);
      assert.equal(after.startedAt, before.startedAt);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("updateSessionLock does not write metadata when no lock is held", () => {
    const basePath = makeBaseDir();
    try {
      updateSessionLock(basePath, "execute-task", "M001/S01/T03", 2);
      assert.equal(readSessionLockData(basePath), null);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("normalizes worktree paths to a shared repo lock location", () => {
    const { mainRepo, worktree } = initRepoWithWorktree();
    try {
      const acquired = acquireSessionLock(worktree);
      assert.equal(acquired.acquired, true);

      assert.equal(existsSync(lockFile(mainRepo)), true);
      assert.equal(existsSync(lockFile(worktree)), false);
    } finally {
      releaseSessionLock(worktree);
      rmSync(worktree, { recursive: true, force: true });
      rmSync(mainRepo, { recursive: true, force: true });
    }
  });

  it("stale lock from dead pid is cleaned up on acquire", () => {
    const basePath = makeBaseDir();
    try {
      const stalePid = 999_999;
      seedLockMetadata(basePath, stalePid);
      mkdirSync(lockDir(basePath), { recursive: true });
      assert.equal(existsSync(lockFile(basePath)), true);

      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, true);

      const data = readSessionLockData(basePath);
      assert.ok(data);
      assert.equal(data.pid, process.pid);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("does not steal a lock when metadata is missing", () => {
    const basePath = makeBaseDir();
    try {
      mkdirSync(lockDir(basePath), { recursive: true });
      const result = acquireSessionLock(basePath);
      assert.equal(result.acquired, false);
    } finally {
      releaseSessionLock(basePath);
      rmSync(basePath, { recursive: true, force: true });
    }
  });

  it("releaseSessionLock only releases the lock owner path", () => {
    const ownerPath = makeBaseDir();
    const otherPath = makeBaseDir();
    try {
      const acquired = acquireSessionLock(ownerPath);
      assert.equal(acquired.acquired, true);
      assert.equal(isSessionLockHeld(ownerPath), true);

      seedLockMetadata(otherPath, process.pid + 1);
      mkdirSync(lockDir(otherPath), { recursive: true });

      releaseSessionLock(otherPath);

      assert.equal(isSessionLockHeld(ownerPath), true);
      assert.equal(existsSync(lockFile(ownerPath)), true);
      assert.equal(existsSync(lockFile(otherPath)), true);
      assert.equal(existsSync(lockDir(otherPath)), true);
    } finally {
      releaseSessionLock(ownerPath);
      rmSync(ownerPath, { recursive: true, force: true });
      rmSync(otherPath, { recursive: true, force: true });
    }
  });
});
