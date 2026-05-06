import type { KataArtifactType, KataScopeType } from "../../domain/types.js";

export const MARKER_PREFIX = "<!-- kata:artifact ";
export const MARKER_SUFFIX = " -->";

export const SCOPE_TYPES = ["project", "milestone", "slice", "task", "issue"] satisfies KataScopeType[];

export const ARTIFACT_TYPES = [
  "project-brief",
  "requirements",
  "roadmap",
  "phase-context",
  "context",
  "decisions",
  "research",
  "plan",
  "slice",
  "summary",
  "verification",
  "uat",
  "retrospective",
] satisfies KataArtifactType[];
