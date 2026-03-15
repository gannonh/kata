/** Service for managing users */
export class UserService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /** Find a user by their ID */
  async findById(id: string): Promise<User | null> {
    return this.db.query("SELECT * FROM users WHERE id = ?", [id]);
  }

  static create(db: Database): UserService {
    return new UserService(db);
  }

  get count(): number {
    return this.db.count("users");
  }
}

interface Database {
  query(sql: string, params: unknown[]): Promise<unknown>;
  count(table: string): number;
}

interface User {
  id: string;
  name: string;
}
