import {
  mkdirSync,
  promises as fs,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";

/**
 * Atomically writes content to a file by writing to a temp file first,
 * then renaming. Prevents partial/corrupt files on crash.
 */
export function atomicWriteSync(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${randomBytes(4).toString("hex")}`;
  writeFileSync(tmpPath, content, encoding);
  try {
    renameSync(tmpPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // orphan cleanup best-effort
    }
    throw error;
  }
}

/**
 * Async variant of atomicWriteSync. Atomically writes content to a file
 * by writing to a temp file first, then renaming.
 */
export async function atomicWriteAsync(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8",
): Promise<void> {
  await fs.mkdir(dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${randomBytes(4).toString("hex")}`;
  await fs.writeFile(tmpPath, content, encoding);
  try {
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => {
      // orphan cleanup best-effort
    });
    throw error;
  }
}
