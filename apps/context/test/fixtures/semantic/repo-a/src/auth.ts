export interface AuthToken {
  userId: string;
  scopes: string[];
}

export function parseAuthHeader(header: string | undefined): AuthToken | null {
  if (!header) return null;
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  // Placeholder parser used only by semantic fixture tests.
  return {
    userId: token.split(".")[0] ?? "unknown",
    scopes: ["read"],
  };
}

export function canAccessProject(token: AuthToken | null, projectId: string): boolean {
  if (!token) return false;
  if (!projectId) return false;
  return token.scopes.includes("read") || token.userId === projectId;
}
