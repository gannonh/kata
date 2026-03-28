import type {
  ExtensionCommandContext,
  ExtensionContext,
  ExtensionUIContext,
} from "@mariozechner/pi-coding-agent";
import { loadEffectiveKataPreferences } from "../kata/preferences.js";
import type { SymphonyClient } from "./client.js";
import { ConsolePanel, type ConsolePanelOptions } from "./console-panel.js";
import {
  buildConsolePanelStateFromSnapshot,
  createEmptyConsolePanelState,
  resolveConsolePosition,
  type ConsolePanelState,
} from "./console-state.js";
import {
  isEscalationEvent,
  type SymphonyClientLifecycleEvent,
  type SymphonyEventEnvelope,
  type SymphonyEventKind,
  type SymphonyOrchestratorState,
} from "./types.js";
import {
  EscalationResponseRouter,
  type EscalationRouteResult,
} from "./console-escalation.js";
import { truncateText } from "./text-utils.js";

export type SymphonyConsoleContext = ExtensionContext | ExtensionCommandContext;

export interface ConsoleManager {
  isActive(): boolean;
  getState(): ConsolePanelState;
  setContext(ctx: SymphonyConsoleContext): void;
  open(ctx: SymphonyConsoleContext): Promise<void>;
  close(ctx?: SymphonyConsoleContext): void;
  toggle(ctx: SymphonyConsoleContext): Promise<"opened" | "closed">;
  refresh(ctx?: SymphonyConsoleContext): Promise<void>;
  handleInput(input: string, ctx?: SymphonyConsoleContext): Promise<boolean>;
  dispose(ctx?: SymphonyConsoleContext): void;
}

export interface ConsolePanelController {
  update(state: ConsolePanelState): void;
  setPosition(position: "below-output" | "above-status"): void;
  close(): void;
  isOpen(): boolean;
}

export interface ConsoleManagerOptions {
  now?: () => number;
  panelFactory?: (
    ui: ExtensionUIContext,
    options: ConsolePanelOptions,
  ) => ConsolePanelController;
  loadPreferences?: typeof loadEffectiveKataPreferences;
}

export interface ConsoleEventTransition {
  nextState: ConsolePanelState;
  refreshFromServer: boolean;
  signal?:
    | "console_escalation_displayed"
    | "console_escalation_cleared"
    | "console_snapshot_applied";
}

const CONSOLE_STREAM_KINDS: SymphonyEventKind[] = [
  "snapshot",
  "runtime",
  "worker",
  "heartbeat",
  "escalation_created",
  "escalation_responded",
  "escalation_timed_out",
  "escalation_cancelled",
];

export function createConsoleManager(
  client: SymphonyClient,
  options: ConsoleManagerOptions = {},
): ConsoleManager {
  return new SymphonyConsoleManager(client, options);
}

export function applyConsoleEventTransition(
  state: ConsolePanelState,
  event: SymphonyEventEnvelope,
  now: () => number = Date.now,
): ConsoleEventTransition {
  const nowMs = now();

  if (event.kind === "heartbeat") {
    return {
      nextState: {
        ...state,
        lastUpdateAt: nowMs,
      },
      refreshFromServer: false,
    };
  }

  if (event.kind === "snapshot" && looksLikeSnapshot(event.payload)) {
    return {
      nextState: {
        ...buildConsolePanelStateFromSnapshot(event.payload, {
          now,
          previous: state,
          connectionStatus: state.connectionStatus,
          connectionUrl: state.connectionUrl,
        }),
        error: undefined,
      },
      refreshFromServer: false,
      signal: "console_snapshot_applied",
    };
  }

  if (event.event === "escalation_created" && isEscalationEvent(event)) {
    const existing = state.escalations.find(
      (entry) => entry.requestId === event.payload.request_id,
    );

    if (existing) {
      return {
        nextState: {
          ...state,
          lastUpdateAt: nowMs,
        },
        refreshFromServer: false,
      };
    }

    const waitingSince = Date.parse(event.payload.created_at);
    const issueIdentifier = event.payload.issue_identifier;
    const matchingWorker = state.workers.find(
      (worker) => worker.identifier === issueIdentifier,
    );

    const questionPreview = summarizeEscalationPayload(event.payload.payload);

    return {
      nextState: {
        ...state,
        lastUpdateAt: nowMs,
        escalations: [
          ...state.escalations,
          {
            requestId: event.payload.request_id,
            issueId: event.payload.issue_id,
            issueIdentifier,
            issueTitle: matchingWorker?.issueTitle ?? issueIdentifier,
            questionPreview,
            waitingSince: Number.isFinite(waitingSince) ? waitingSince : nowMs,
            timeoutMs: event.payload.timeout_ms,
          },
        ],
      },
      refreshFromServer: true,
      signal: "console_escalation_displayed",
    };
  }

  if (
    event.event === "escalation_responded" ||
    event.event === "escalation_timed_out" ||
    event.event === "escalation_cancelled"
  ) {
    const requestId = extractRequestId(event.payload);
    if (!requestId) {
      return {
        nextState: {
          ...state,
          lastUpdateAt: nowMs,
        },
        refreshFromServer: true,
      };
    }

    return {
      nextState: {
        ...state,
        lastUpdateAt: nowMs,
        escalations: state.escalations.filter((entry) => entry.requestId !== requestId),
      },
      refreshFromServer: true,
      signal: "console_escalation_cleared",
    };
  }

  if (event.kind === "worker" || event.kind === "runtime") {
    return {
      nextState: {
        ...state,
        lastUpdateAt: nowMs,
      },
      refreshFromServer: true,
    };
  }

  return {
    nextState: {
      ...state,
      lastUpdateAt: nowMs,
    },
    refreshFromServer: false,
  };
}

class SymphonyConsoleManager implements ConsoleManager {
  private readonly now: () => number;
  private readonly panelFactory: (
    ui: ExtensionUIContext,
    options: ConsolePanelOptions,
  ) => ConsolePanelController;
  private readonly loadPreferences: typeof loadEffectiveKataPreferences;

  private active = false;
  private state = createEmptyConsolePanelState("");
  private context: SymphonyConsoleContext | null = null;
  private panel: ConsolePanelController | null = null;
  private streamAbortController: AbortController | null = null;
  private refreshAbortController: AbortController | null = null;
  private refreshPromise: Promise<void> | null = null;
  private connectedOnce = false;
  private readonly escalationRouter: EscalationResponseRouter;

  constructor(
    private readonly client: SymphonyClient,
    options: ConsoleManagerOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.panelFactory = options.panelFactory ?? ((ui, panelOptions) => new ConsolePanel(ui, panelOptions));
    this.loadPreferences = options.loadPreferences ?? loadEffectiveKataPreferences;
    this.escalationRouter = new EscalationResponseRouter(client);
  }

  isActive(): boolean {
    return this.active;
  }

  getState(): ConsolePanelState {
    return { ...this.state };
  }

  setContext(ctx: SymphonyConsoleContext): void {
    this.context = ctx;
  }

  async open(ctx: SymphonyConsoleContext): Promise<void> {
    this.context = ctx;
    if (this.active) {
      return;
    }

    const position = resolveConsolePosition(
      this.loadPreferences(process.cwd())?.preferences.symphony?.console_position,
    );

    const connectionUrl = this.resolveConnectionUrl();

    this.state = {
      ...createEmptyConsolePanelState(connectionUrl),
      connectionStatus: "reconnecting",
      message: "Waiting for Symphony event stream…",
    };

    this.ensurePanel(position);
    this.active = true;
    this.render();
    this.notify("console_panel_opened", "info");

    this.startStreamLoop();
    await this.refresh();
  }

  close(ctx?: SymphonyConsoleContext): void {
    if (ctx) {
      this.context = ctx;
    }

    if (!this.active && !this.panel?.isOpen()) {
      return;
    }

    this.active = false;
    this.connectedOnce = false;
    this.streamAbortController?.abort();
    this.streamAbortController = null;
    this.refreshAbortController?.abort();
    this.refreshAbortController = null;
    this.refreshPromise = null;

    this.panel?.close();
    this.panel = null;
    this.notify("console_panel_closed", "info");
  }

  async toggle(ctx: SymphonyConsoleContext): Promise<"opened" | "closed"> {
    if (this.active) {
      this.close(ctx);
      return "closed";
    }

    await this.open(ctx);
    return "opened";
  }

  async refresh(ctx?: SymphonyConsoleContext): Promise<void> {
    if (ctx) {
      this.context = ctx;
    }

    if (!this.active) {
      return;
    }

    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const controller = new AbortController();
    this.refreshAbortController = controller;

    const refreshPromise = this.performRefresh(controller.signal).finally(() => {
      if (this.refreshPromise === refreshPromise) {
        this.refreshPromise = null;
      }
      if (this.refreshAbortController === controller) {
        this.refreshAbortController = null;
      }
    });

    this.refreshPromise = refreshPromise;
    return refreshPromise;
  }

  async handleInput(
    input: string,
    ctx?: SymphonyConsoleContext,
  ): Promise<boolean> {
    if (ctx) {
      this.context = ctx;
    }

    if (!this.active) {
      return false;
    }

    const result = await this.escalationRouter.routeInput(
      input,
      this.state.escalations,
      this.state.connectionStatus === "connected",
    );

    if (!result.handled) {
      return false;
    }

    this.applyEscalationRouteResult(result);

    if (result.status === "sent" || result.status === "rejected") {
      await this.refresh();
    }

    return true;
  }

  dispose(ctx?: SymphonyConsoleContext): void {
    this.close(ctx);
  }

  private ensurePanel(position: "below-output" | "above-status"): void {
    const ctx = this.context;
    if (!ctx) {
      throw new Error("Cannot open Symphony console without an active context.");
    }

    if (!this.panel) {
      this.panel = this.panelFactory(ctx.ui, {
        position,
      });
      return;
    }

    this.panel.setPosition(position);
  }

  private render(): void {
    if (!this.panel) {
      return;
    }

    this.panel.update(this.state);
  }

  private resolveConnectionUrl(): string {
    try {
      return this.client.getConnectionConfig().url;
    } catch {
      return this.state.connectionUrl;
    }
  }

  private async performRefresh(signal?: AbortSignal): Promise<void> {
    try {
      const snapshot = await this.client.getState(signal);
      if (signal?.aborted || !this.active) {
        return;
      }

      this.state = {
        ...buildConsolePanelStateFromSnapshot(snapshot, {
          now: this.now,
          previous: this.state,
          connectionStatus: this.state.connectionStatus,
          connectionUrl: this.resolveConnectionUrl(),
        }),
        error: undefined,
      };
      this.render();
    } catch (error) {
      if (isAbortError(error, signal) || !this.active) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        error: `Symphony snapshot refresh failed: ${message}`,
      };
      this.render();
    }
  }

  private startStreamLoop(): void {
    this.streamAbortController?.abort();

    const controller = new AbortController();
    this.streamAbortController = controller;

    const run = async () => {
      try {
        for await (const event of this.client.watchEvents(
          { type: CONSOLE_STREAM_KINDS },
          {
            signal: controller.signal,
            reconnectAttempts: 10,
            reconnectDelayMs: 1_000,
            onLifecycle: (lifecycleEvent) => {
              this.handleLifecycleEvent(lifecycleEvent);
            },
          },
        )) {
          await this.consumeEvent(event);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        this.state = {
          ...this.state,
          connectionStatus: "disconnected",
          error: `Console stream disconnected: ${message}`,
        };
        this.render();
      }
    };

    void run();
  }

  private async consumeEvent(event: SymphonyEventEnvelope): Promise<void> {
    if (!this.active) {
      return;
    }

    const transition = applyConsoleEventTransition(this.state, event, this.now);
    this.state = transition.nextState;

    if (transition.signal === "console_escalation_displayed") {
      this.notify("console_escalation_displayed", "warning");
    }

    this.render();

    if (transition.refreshFromServer) {
      await this.refresh();
    }
  }

  private applyEscalationRouteResult(result: EscalationRouteResult): void {
    const nextEscalations =
      result.requestId && (result.status === "sent" || result.status === "rejected")
        ? this.state.escalations.filter((entry) => entry.requestId !== result.requestId)
        : this.state.escalations;

    this.state = {
      ...this.state,
      escalations: nextEscalations,
      message: result.message,
      lastUpdateAt: this.now(),
    };

    if (result.status === "sent") {
      this.notify("console_escalation_responded", "info");
    } else if (result.status === "queued") {
      this.notify(result.message, "warning");
    } else if (result.status === "rejected") {
      this.notify(result.message, "warning");
    } else {
      this.notify(result.message, "info");
    }

    this.render();
  }

  private async flushQueuedResponses(): Promise<void> {
    if (!this.active || this.escalationRouter.pendingQueueSize() === 0) {
      return;
    }

    try {
      const results = await this.escalationRouter.flushQueue(
        this.state.escalations,
        this.state.connectionStatus === "connected",
      );

      if (results.length === 0) {
        return;
      }

      for (const result of results) {
        this.applyEscalationRouteResult(result);
      }

      if (results.some((result) => result.status === "sent" || result.status === "rejected")) {
        await this.refresh();
      }
    } catch (error) {
      if (!this.active) {
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.state = {
        ...this.state,
        error: `Failed to flush queued responses: ${message}`,
        message: "Queued escalation responses stalled. They will retry on the next reconnect.",
        lastUpdateAt: this.now(),
      };
      this.notify(`Failed to flush queued responses: ${message}`, "warning");
      this.render();
    }
  }

  private handleLifecycleEvent(event: SymphonyClientLifecycleEvent): void {
    if (!this.active) {
      return;
    }

    const nowMs = this.now();

    if (event.type === "symphony_client_connected") {
      const shouldEmitReconnect = this.connectedOnce;
      this.state = {
        ...this.state,
        connectionStatus: "connected",
        connectionUrl: event.details.url,
        lastUpdateAt: nowMs,
        error: undefined,
      };
      this.connectedOnce = true;
      this.render();
      void this.flushQueuedResponses();

      if (shouldEmitReconnect) {
        this.notify("console_stream_reconnected", "info");
      }
      return;
    }

    if (event.type === "symphony_client_reconnecting") {
      this.state = {
        ...this.state,
        connectionStatus: "reconnecting",
        connectionUrl: event.details.url,
        lastUpdateAt: nowMs,
      };
      this.render();
      return;
    }

    if (event.type === "symphony_client_disconnected") {
      this.state = {
        ...this.state,
        connectionStatus: "disconnected",
        connectionUrl: event.details.url,
        lastUpdateAt: nowMs,
      };
      this.render();
    }
  }

  private notify(message: string, type: "info" | "warning" | "error" = "info"): void {
    this.context?.ui.notify(message, type);
  }
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }

  return (
    !!error &&
    typeof error === "object" &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

function extractRequestId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const requestId = (payload as Record<string, unknown>).request_id;
  if (typeof requestId !== "string" || requestId.length === 0) {
    return null;
  }

  return requestId;
}

function summarizeEscalationPayload(payload: unknown): string {
  if (typeof payload === "string") {
    return truncateText(payload, 160);
  }

  if (Array.isArray(payload)) {
    return truncateText(JSON.stringify(payload), 160);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const prompt =
      typeof record.question === "string"
        ? record.question
        : typeof record.prompt === "string"
          ? record.prompt
          : typeof record.preview === "string"
            ? record.preview
            : JSON.stringify(record);
    return truncateText(prompt, 160);
  }

  return "Operator response requested";
}

function looksLikeSnapshot(value: unknown): value is SymphonyOrchestratorState {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.poll_interval_ms === "number" &&
    typeof value.max_concurrent_agents === "number" &&
    isRecord(value.running) &&
    Array.isArray(value.retry_queue) &&
    Array.isArray(value.completed) &&
    isRecord(value.codex_totals) &&
    isRecord(value.polling)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

