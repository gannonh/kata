/**
 * A deeply nested TypeScript file.
 */

export enum Status {
  Active = "active",
  Inactive = "inactive",
}

export function getStatus(active: boolean): Status {
  return active ? Status.Active : Status.Inactive;
}
