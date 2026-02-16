// sample.ts - Test fixture for scan-codebase.cjs TS extraction
// Known imports and exports for deterministic testing

import { Request, Response } from 'express';
import { UserModel } from './models/user';
import type { UserType } from './types';

export interface UserService {
  getUser(id: string): Promise<UserType>;
}

export type UserId = string;

export const DEFAULT_ROLE = 'viewer';

export enum Status {
  Active = 'active',
  Inactive = 'inactive',
}

export function validateUser(user: UserType): boolean {
  return !!user.id;
}

export default class UserController {
  constructor(private service: UserService) {}
}
