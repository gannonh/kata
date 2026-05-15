import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ToolExecutionMode } from "@earendil-works/pi-coding-agent";
import { assertLoopbackAttachUrl } from "./attach-url-policy.ts";
import { setSymphonyStatus } from "./commands.ts";
import { formatError, SymphonyExtensionError } from "./errors.ts";
import type { SymphonyRuntime } from "./runtime.ts";

const SYMPHONY_TOOL_EXECUTION_MODE = "sequential" as ToolExecutionMode;

export function registerSymphonyTools(pi: ExtensionAPI, runtime: SymphonyRuntime): void {
  pi.registerTool(defineTool({
    name: "symphony_help",
    label: "Symphony Help",
    description: "Show Symphony Pi extension commands and tool capabilities.",
    parameters: Type.Object({}),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute() {
      return toolOk("Symphony tools: symphony_init, symphony_doctor, symphony_start, symphony_attach, symphony_status, symphony_stop, symphony_help", {
        attachedBaseUrl: runtime.state.attachedBaseUrl,
        ownedProcess: runtime.state.ownedProcess,
      });
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_init",
    label: "Symphony Init",
    description: "Run symphony init in Pi's current working directory.",
    parameters: Type.Object({ force: Type.Optional(Type.Boolean()) }),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, params, signal, _update, ctx) {
      try {
        const binary = await runtime.resolveBinary(ctx);
        const result = await pi.exec(binary, params.force ? ["init", "--force"] : ["init"], { cwd: ctx.cwd, signal });
        if (result.code !== 0) throw new SymphonyExtensionError("command_failed", "symphony init failed", { cwd: ctx.cwd, code: result.code, stderr: result.stderr });
        runtime.persist(pi);
        return toolOk(result.stdout.trim() || "symphony init completed", { code: result.code, cwd: ctx.cwd });
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_doctor",
    label: "Symphony Doctor",
    description: "Run symphony doctor with an optional workflow path.",
    parameters: Type.Object({ workflow: Type.Optional(Type.String()) }),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, params, signal, _update, ctx) {
      try {
        const binary = await runtime.resolveBinary(ctx);
        const args = params.workflow ? ["doctor", params.workflow] : ["doctor"];
        const result = await pi.exec(binary, args, { cwd: ctx.cwd, signal });
        if (result.code !== 0) throw new SymphonyExtensionError("command_failed", "symphony doctor failed", { cwd: ctx.cwd, code: result.code, stderr: result.stderr });
        runtime.persist(pi);
        return toolOk(result.stdout.trim() || "symphony doctor completed", { code: result.code, cwd: ctx.cwd });
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_start",
    label: "Symphony Start",
    description: "Start Symphony headlessly from Pi's current working directory and attach to its HTTP API.",
    parameters: Type.Object({ workflow: Type.Optional(Type.String()) }),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, params, signal, _update, ctx) {
      let startedBaseUrl: string | undefined;
      try {
        const binary = await runtime.resolveBinary(ctx);
        const started = await runtime.processManager.start({ binary, cwd: ctx.cwd, workflow: params.workflow, signal });
        startedBaseUrl = started.baseUrl;
        await runtime.attach(started.baseUrl, signal);
        runtime.persist(pi);
        setSymphonyStatus(ctx, runtime);
        return toolOk(`Symphony started at ${started.baseUrl}`, { ...started, state: runtime.state.lastKnownState });
      } catch (error) {
        if (signal?.aborted && startedBaseUrl) await cleanupAbortedStart(runtime, startedBaseUrl);
        throw new Error(formatError(error));
      }
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_attach",
    label: "Symphony Attach",
    description: "Attach to an existing Symphony HTTP server after verifying GET /api/v1/state.",
    parameters: Type.Object({ url: Type.String() }),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, params, signal, _update, ctx) {
      try {
        assertLoopbackAttachUrl(params.url);
        await runtime.attach(params.url, signal);
        runtime.persist(pi);
        setSymphonyStatus(ctx, runtime);
        return toolOk(`Attached to Symphony at ${runtime.state.attachedBaseUrl}`, { state: runtime.state.lastKnownState });
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_status",
    label: "Symphony Status",
    description: "Return current Symphony attachment, process, and health summary.",
    parameters: Type.Object({}),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, _params, signal) {
      try {
        if (runtime.client) await runtime.refreshState(signal);
        runtime.persist(pi);
        return toolOk(runtime.statusText(), { state: runtime.state });
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  }));

  pi.registerTool(defineTool({
    name: "symphony_stop",
    label: "Symphony Stop",
    description: "Stop only a Symphony process started by this Pi extension.",
    parameters: Type.Object({}),
    executionMode: SYMPHONY_TOOL_EXECUTION_MODE,
    async execute(_id, _params, _signal, _update, ctx) {
      try {
        const ownedBaseUrl = runtime.state.ownedProcess?.baseUrl;
        await runtime.processManager.stopOwned();
        runtime.clearAttachmentIfBaseUrl(ownedBaseUrl);
        runtime.persist(pi);
        setSymphonyStatus(ctx, runtime);
        return toolOk("Stopped owned Symphony process", { ownedProcess: runtime.state.ownedProcess });
      } catch (error) {
        throw new Error(formatError(error));
      }
    },
  }));
}

async function cleanupAbortedStart(runtime: SymphonyRuntime, baseUrl: string): Promise<void> {
  try {
    await runtime.processManager.stopOwned();
  } catch (error) {
    if (!(error instanceof SymphonyExtensionError && error.kind === "not_owned")) throw error;
  }
  runtime.clearAttachmentIfBaseUrl(baseUrl);
}

function toolOk(text: string, details: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}
