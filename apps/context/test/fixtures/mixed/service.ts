/**
 * A sample service class.
 */

export class UserService {
  /** Create a new user */
  async createUser(name: string): Promise<void> {
    console.log(`Creating user: ${name}`);
  }

  /** Get a user by ID */
  getUser(id: number): string {
    return `user-${id}`;
  }
}

export type UserId = string | number;
