import { IService, Config, Result } from "./types";
import { createConfig, log } from "./utils";
import { LogLevel } from "./types";

/** Base service with common functionality. */
export class BaseService {
  protected config: Config;

  constructor(name: string) {
    this.config = createConfig(name);
  }

  /** Get the service name. */
  getName(): string {
    return this.config.name;
  }
}

/** Application service that extends BaseService and implements IService. */
export class AppService extends BaseService implements IService {
  private running = false;

  constructor(name: string) {
    super(name);
  }

  start(): void {
    this.running = true;
    log(LogLevel.Info, `Starting ${this.getName()}`);
  }

  stop(): void {
    this.running = false;
    log(LogLevel.Info, `Stopping ${this.getName()}`);
  }

  /** Process a request and return a result. */
  process(input: string): Result<string> {
    if (!this.running) {
      return { ok: false, error: "Service not running" };
    }
    return { ok: true, data: `Processed: ${input}` };
  }
}
