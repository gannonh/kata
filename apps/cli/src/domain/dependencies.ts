const SLICE_DEPENDENCY_ID_PATTERN = /(^|[^A-Za-z0-9])S(\d+)(?=$|[^A-Za-z0-9])/gi;

export function normalizeSliceDependencyId(value: string): string | null {
  SLICE_DEPENDENCY_ID_PATTERN.lastIndex = 0;
  const match = SLICE_DEPENDENCY_ID_PATTERN.exec(value.trim());
  if (!match) return null;

  const numericId = Number(match[2]);
  if (!Number.isSafeInteger(numericId) || numericId < 0) return null;

  return `S${String(numericId).padStart(3, "0")}`;
}

export function parseSliceDependencyIds(value: unknown): string[] {
  const parsed = parseDependencyValue(value);
  const seen = new Set<string>();
  const dependencies: string[] = [];

  for (const dependency of parsed) {
    if (seen.has(dependency)) continue;
    seen.add(dependency);
    dependencies.push(dependency);
  }

  return dependencies;
}

export function formatSliceDependencyIdsForTextField(value: readonly string[]): string {
  return parseSliceDependencyIds(value).join("\n");
}

function parseDependencyValue(value: unknown): string[] {
  if (typeof value === "string") return parseDependencyString(value);
  if (Array.isArray(value)) return value.flatMap((item) => parseDependencyValue(item));
  return [];
}

function parseDependencyString(value: string): string[] {
  const dependencies: string[] = [];
  SLICE_DEPENDENCY_ID_PATTERN.lastIndex = 0;

  for (const match of value.matchAll(SLICE_DEPENDENCY_ID_PATTERN)) {
    const numericId = Number(match[2]);
    if (!Number.isSafeInteger(numericId) || numericId < 0) continue;
    dependencies.push(`S${String(numericId).padStart(3, "0")}`);
  }

  return dependencies;
}
