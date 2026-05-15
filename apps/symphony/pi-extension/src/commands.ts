import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { assertLoopbackAttachUrl } from "./attach-url-policy.ts";
import { openDashboard } from "./dashboard.ts";
import { formatError, SymphonyExtensionError } from "./errors.ts";
import { parseAttachArgs, parseDoctorArgs, parseInitArgs, parseStartArgs, parseSteerArgs } from "./command-args.ts";
import { withSymphonyLoader, withSymphonyProgress } from "./progress.ts";
import type { SymphonyRuntime } from "./runtime.ts";
import { resolveStartWorkflow } from "./workflow-resolver.ts";

export function registerSymphonyCommands(pi: ExtensionAPI, runtime: SymphonyRuntime): void {
  pi.registerCommand("symphony:help", {
    description: "Show Symphony extension commands and current status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(helpText(runtime), "info");
    },
  });

  pi.registerCommand("symphony:init", {
    description: "Run symphony init in the current Pi working directory",
    handler: async (args, ctx) => runCommandHandler(ctx, async () => withSymphonyLoader(ctx, { message: "Initializing Symphony...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async (signal) => {
      const parsed = parseInitArgs(args);
      const binary = await runtime.resolveBinary(ctx);
      const result = await pi.exec(binary, parsed.force ? ["init", "--force"] : ["init"], { cwd: ctx.cwd, signal });
      if (result.code !== 0) throw new SymphonyExtensionError("command_failed", "symphony init failed", { cwd: ctx.cwd, code: result.code, stderr: result.stderr });
      runtime.persist(pi);
      ctx.ui.notify(result.stdout.trim() || "symphony init completed", "info");
    })),
  });

  pi.registerCommand("symphony:doctor", {
    description: "Run symphony doctor in the current Pi working directory",
    handler: async (args, ctx) => runCommandHandler(ctx, async () => withSymphonyLoader(ctx, { message: "Running Symphony doctor...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async (signal) => {
      const parsed = parseDoctorArgs(args);
      const binary = await runtime.resolveBinary(ctx);
      const commandArgs = parsed.workflow ? ["doctor", parsed.workflow] : ["doctor"];
      const result = await pi.exec(binary, commandArgs, { cwd: ctx.cwd, signal });
      if (result.code !== 0) throw new SymphonyExtensionError("command_failed", "symphony doctor failed", { cwd: ctx.cwd, code: result.code, stderr: result.stderr });
      runtime.persist(pi);
      ctx.ui.notify(result.stdout.trim() || "symphony doctor completed", "info");
    })),
  });

  pi.registerCommand("symphony:start", {
    description: "Start Symphony headlessly, attach to the HTTP API, and open the dashboard",
    handler: async (args, ctx) => runCommandHandler(ctx, async () => withSymphonyLoader(ctx, { message: "Starting Symphony...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async (signal) => {
      let startedBaseUrl: string | undefined;
      try {
        const parsed = parseStartArgs(args);
        const workflow = await resolveStartWorkflow(ctx.cwd, parsed.workflow);
        const binary = await runtime.resolveBinary(ctx);
        const started = await runtime.processManager.start({ binary, cwd: ctx.cwd, workflow, signal });
        startedBaseUrl = started.baseUrl;
        await runtime.attach(started.baseUrl, signal);
        if (signal.aborted) {
          await cleanupAbortedStart(runtime, startedBaseUrl);
          return;
        }
        runtime.persist(pi);
        setSymphonyStatus(ctx, runtime);
        ctx.ui.notify(`Symphony started at ${started.baseUrl}`, "info");
        await openDashboard(ctx, runtime);
      } catch (error) {
        if (signal.aborted && startedBaseUrl) await cleanupAbortedStart(runtime, startedBaseUrl);
        throw error;
      }
    })),
  });

  pi.registerCommand("symphony:attach", {
    description: "Attach to an existing Symphony HTTP server",
    handler: async (args, ctx) => runCommandHandler(ctx, async () => withSymphonyProgress(ctx, { message: "Attaching to Symphony...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async () => {
      const parsed = parseAttachArgs(args);
      assertLoopbackAttachUrl(parsed.url);
      await runtime.attach(parsed.url);
      runtime.persist(pi);
      setSymphonyStatus(ctx, runtime);
      ctx.ui.notify(`Attached to Symphony at ${runtime.state.attachedBaseUrl}`, "info");
    })),
  });

  pi.registerCommand("symphony:dashboard", {
    description: "Open the Symphony health dashboard",
    handler: async (_args, ctx) => runCommandHandler(ctx, async () => {
      await openDashboard(ctx, runtime);
    }),
  });

  pi.registerCommand("symphony:status", {
    description: "Show Symphony attachment and process status",
    handler: async (_args, ctx) => runCommandHandler(ctx, async () => {
      if (runtime.client) await runtime.refreshState();
      runtime.persist(pi);
      ctx.ui.notify(runtime.statusText(), "info");
    }),
  });

  pi.registerCommand("symphony:refresh", {
    description: "Request an immediate Symphony poll refresh",
    handler: async (_args, ctx) => runCommandHandler(ctx, async () => withSymphonyProgress(ctx, { message: "Refreshing Symphony...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async () => {
      await runtime.requestRefresh();
      runtime.persist(pi);
      ctx.ui.notify(`Symphony refresh requested; ${runtimeCountsText(runtime)}`, "info");
    })),
  });

  pi.registerCommand("symphony:steer", {
    description: "Send an operator instruction to a running Symphony worker",
    handler: async (args, ctx) => runCommandHandler(ctx, async () => {
      const parsed = parseSteerArgs(args);
      const result = await runtime.steerWorker(parsed.issueIdentifier, parsed.instruction);
      runtime.persist(pi);
      ctx.ui.notify(`Steer delivered to ${result.issueIdentifier}: ${result.instructionPreview}`, "info");
    }),
  });

  pi.registerCommand("symphony:stop", {
    description: "Stop a Symphony process started by this extension",
    handler: async (_args, ctx) => runCommandHandler(ctx, async () => withSymphonyProgress(ctx, { message: "Stopping Symphony...", restoreStatus: (ctx) => setSymphonyStatus(ctx, runtime) }, async () => {
      const ownedBaseUrl = runtime.state.ownedProcess?.baseUrl;
      await runtime.processManager.stopOwned();
      runtime.clearAttachmentIfBaseUrl(ownedBaseUrl);
      runtime.persist(pi);
      setSymphonyStatus(ctx, runtime);
      ctx.ui.notify("Stopped owned Symphony process", "info");
    })),
  });
}

export function setSymphonyStatus(ctx: Pick<ExtensionContext, "ui">, runtime: SymphonyRuntime): void {
  ctx.ui.setStatus("symphony", runtime.state.attachedBaseUrl ? `symphony ${runtime.state.attachedBaseUrl}` : "symphony detached");
}

async function runCommandHandler(ctx: ExtensionCommandContext, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    ctx.ui.notify(formatError(error), "error");
  }
}

async function cleanupAbortedStart(runtime: SymphonyRuntime, baseUrl: string): Promise<void> {
  try {
    await runtime.processManager.stopOwned();
  } catch (error) {
    if (!(error instanceof SymphonyExtensionError && error.kind === "not_owned")) throw error;
  }
  runtime.clearAttachmentIfBaseUrl(baseUrl);
}

function runtimeCountsText(runtime: SymphonyRuntime): string {
  const state = runtime.state.lastKnownState;
  if (!state) return "state unavailable";
  return `running ${state.runningCount}, retry ${state.retryCount}, blocked ${state.blockedCount}, completed ${state.completedCount}`;
}

function helpText(runtime: SymphonyRuntime): string {
  return [
    "Symphony Pi extension",
    runtime.statusText(),
    "",
    "Commands:",
    "/symphony:init [--force]",
    "/symphony:doctor [workflow]",
    "/symphony:start [workflow]",
    "/symphony:attach <url>",
    "/symphony:dashboard",
    "/symphony:status",
    "/symphony:refresh",
    "/symphony:steer <ISSUE> <instruction>",
    "/symphony:stop",
  ].join("\n");
}
