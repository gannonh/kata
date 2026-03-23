/**
 * MemoryStore — CRUD for durable memory entries stored as markdown files
 * with YAML frontmatter in .kata/memory/.
 *
 * Every mutation produces a git commit via the git audit module.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type {
  MemoryEntry,
  RememberOptions,
  MemoryFilter,
  ConsolidateOptions,
} from "./types.js";
import { MemoryError, MEMORY_ERROR_CODES } from "./types.js";
import { isGitRepo, memoryGitCommit } from "./git.js";

function serializeFrontmatter(entry: Omit<MemoryEntry, "content">): string {
  const lines: string[] = ["---"];
  lines.push(`id: ${entry.id}`);
  lines.push(`category: ${entry.category}`);
  lines.push("tags:");
  for (const t of entry.tags) {
    lines.push(`  - ${t}`);
  }
  lines.push(`createdAt: ${entry.createdAt}`);
  lines.push("sourceRefs:");
  for (const r of entry.sourceRefs) {
    lines.push(`  - ${r}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function parseFrontmatter(raw: string): {
  meta: Record<string, any>;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, content: raw };

  const yamlBlock = match[1];
  const content = match[2].trimEnd();
  const meta: Record<string, any> = {};

  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of yamlBlock.split("\n")) {
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentKey) {
      currentList!.push(listItem[1]);
      continue;
    }
    // Flush previous list
    if (currentKey && currentList) {
      meta[currentKey] = currentList;
      currentKey = null;
      currentList = null;
    }
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      if (value === "") {
        // Start of a list
        currentKey = key;
        currentList = [];
      } else {
        meta[key] = value;
      }
    }
  }
  // Flush final
  if (currentKey && currentList) {
    meta[currentKey] = currentList;
  }

  return { meta, content };
}

function toMemoryEntry(
  meta: Record<string, any>,
  content: string,
): MemoryEntry {
  return {
    id: meta.id || "",
    category: meta.category || "general",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    createdAt: meta.createdAt || "",
    sourceRefs: Array.isArray(meta.sourceRefs) ? meta.sourceRefs : [],
    content,
  };
}

export class MemoryStore {
  private rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  private getMemoryDir(): string {
    const dir = join(this.rootPath, ".kata", "memory");
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async remember(options: RememberOptions): Promise<MemoryEntry> {
    const memoryDir = this.getMemoryDir();
    const id = randomUUID().slice(0, 8);
    const createdAt = new Date().toISOString();

    const entry: MemoryEntry = {
      id,
      category: options.category,
      tags: options.tags,
      createdAt,
      sourceRefs: options.sourceRefs || [],
      content: options.content,
    };

    const frontmatter = serializeFrontmatter(entry);
    const fileContent = `${frontmatter}\n${options.content}\n`;
    const filePath = join(memoryDir, `${id}.md`);

    writeFileSync(filePath, fileContent, "utf-8");

    // Git commit is optional — if not a git repo or commit fails, operation still succeeds
    try {
      const snippet = options.content.slice(0, 60).replace(/\n/g, " ");
      memoryGitCommit("remember", snippet, this.rootPath);
    } catch {
      // Non-git or commit failure: memory still persisted on disk
    }

    return entry;
  }

  async get(id: string): Promise<MemoryEntry | null> {
    const filePath = join(this.getMemoryDir(), `${id}.md`);
    if (!existsSync(filePath)) return null;

    const raw = readFileSync(filePath, "utf-8");
    const { meta, content } = parseFrontmatter(raw);
    return toMemoryEntry(meta, content);
  }

  async list(filter?: MemoryFilter): Promise<MemoryEntry[]> {
    const memoryDir = this.getMemoryDir();
    const files = readdirSync(memoryDir).filter((f) => f.endsWith(".md"));
    const entries: MemoryEntry[] = [];

    for (const file of files) {
      const raw = readFileSync(join(memoryDir, file), "utf-8");
      const { meta, content } = parseFrontmatter(raw);
      const entry = toMemoryEntry(meta, content);

      if (filter?.category && entry.category !== filter.category) continue;
      if (filter?.tag && !entry.tags.includes(filter.tag)) continue;

      entries.push(entry);
    }

    return entries;
  }

  async forget(id: string): Promise<MemoryEntry> {
    const entry = await this.get(id);
    if (!entry) {
      throw new MemoryError(
        MEMORY_ERROR_CODES.MEMORY_FILE_NOT_FOUND,
        `Memory not found: ${id}`,
      );
    }

    const filePath = join(this.getMemoryDir(), `${id}.md`);
    unlinkSync(filePath);

    try {
      memoryGitCommit("forget", id, this.rootPath);
    } catch {
      // Non-git or commit failure: forget still succeeded on disk
    }
    return entry;
  }

  async consolidate(options: ConsolidateOptions): Promise<MemoryEntry> {
    const memoryDir = this.getMemoryDir();
    const count = options.memoryIds.length;

    // Delete old memories
    for (const mid of options.memoryIds) {
      const filePath = join(memoryDir, `${mid}.md`);
      if (existsSync(filePath)) unlinkSync(filePath);
    }

    // Create merged memory
    const id = randomUUID().slice(0, 8);
    const createdAt = new Date().toISOString();

    const entry: MemoryEntry = {
      id,
      category: options.category,
      tags: options.tags,
      createdAt,
      sourceRefs: [],
      content: options.mergedContent,
    };

    const frontmatter = serializeFrontmatter(entry);
    writeFileSync(
      join(memoryDir, `${id}.md`),
      `${frontmatter}\n${options.mergedContent}\n`,
      "utf-8",
    );

    try {
      memoryGitCommit(
        "consolidate",
        `merged ${count} memories`,
        this.rootPath,
      );
    } catch {
      // Non-git or commit failure: consolidation still succeeded on disk
    }

    return entry;
  }
}
