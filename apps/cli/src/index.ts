export * from "./domain/types.js";
export * from "./domain/errors.js";
export * from "./domain/dependencies.js";
export { createKataDomainApi } from "./domain/service.js";
export { resolveBackend } from "./backends/resolve-backend.js";
export { detectHarness } from "./commands/setup.js";
export { renderDoctorReport } from "./commands/doctor.js";
export {
  isSupportedJsonOperation,
  runJsonCommand,
  SUPPORTED_JSON_OPERATIONS,
} from "./transports/json.js";
