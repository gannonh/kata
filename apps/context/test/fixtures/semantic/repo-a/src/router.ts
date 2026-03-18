import { canAccessProject, parseAuthHeader } from "./auth";

export interface RequestLike {
  headers: Record<string, string | undefined>;
  params: Record<string, string | undefined>;
}

export function routeProjectRequest(request: RequestLike): "ok" | "forbidden" {
  const authHeader = request.headers.authorization;
  const projectId = request.params.projectId ?? "";

  const token = parseAuthHeader(authHeader);
  if (!canAccessProject(token, projectId)) {
    return "forbidden";
  }

  return "ok";
}
