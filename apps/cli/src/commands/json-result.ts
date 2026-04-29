export function jsonResultIndicatesFailure(result: string): boolean {
  try {
    const parsed = JSON.parse(result) as { ok?: unknown };
    return parsed.ok === false;
  } catch {
    return false;
  }
}
