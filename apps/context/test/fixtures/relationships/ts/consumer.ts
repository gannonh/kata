import { AppService } from "./service";
import { greet } from "./utils";
import * as types from "./types";
import defaultInit from "./init";

/** Run the application. */
export function run(): void {
  const svc = new AppService("main");
  svc.start();
  const message = greet("World");
  console.log(message);
  const result = svc.process("test");
  console.log(result);
  svc.stop();
}

/** Create and configure a service. */
export function createService(name: string): types.IService {
  const svc = new AppService(name);
  return svc;
}
