import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSymphonyBinary } from "./binary-resolver.ts";
import { formatError, SymphonyExtensionError } from "./errors.ts";
import { SymphonyHttpClient, type EscalationRespondResponse, type SteerResponse, type SymphonyEventEnvelope, type SymphonyStateResponse } from "./http-client.ts";
import { SymphonyProcessManager } from "./process-manager.ts";
import {
  createDefaultState,
  restoreStateFromEntries,
  snapshotStateForPersistence,
  STATE_ENTRY_TYPE,
  type ExtensionState,
} from "./state.ts";

export class SymphonyRuntime {
  state: ExtensionState = createDefaultState();
  processManager = new SymphonyProcessManager(this.state);
  client?: SymphonyHttpClient;
  lastState?: SymphonyStateResponse;
  recentEvents: SymphonyEventEnvelope[] = [];

  restore(ctx: ExtensionContext): void {
    this.state = restoreStateFromEntries(ctx.sessionManager.getEntries());
    this.processManager = new SymphonyProcessManager(this.state);
    this.client = this.state.attachedBaseUrl ? new SymphonyHttpClient(this.state.attachedBaseUrl) : undefined;
  }

  persist(pi: { appendEntry: (customType: string, data?: unknown) => void }): void {
    pi.appendEntry(STATE_ENTRY_TYPE, snapshotStateForPersistence(this.state));
  }

  async resolveBinary(ctx: ExtensionContext): Promise<string> {
    return resolveSymphonyBinary({
      cwd: ctx.cwd,
      state: this.state,
      promptForPath: ctx.hasUI
        ? async () => ctx.ui.input("Symphony binary", "Absolute path to symphony executable")
        : async () => undefined,
    });
  }

  async attach(baseUrl: string, signal?: AbortSignal): Promise<SymphonyStateResponse> {
    const client = new SymphonyHttpClient(baseUrl);
    const state = await client.verify(signal);
    this.client = client;
    this.lastState = state;
    this.recentEvents = [];
    this.state.attachedBaseUrl = client.baseUrl;
    this.state.lastKnownState = client.toHealthSummary(state);
    return state;
  }

  clearAttachment(): void {
    this.client = undefined;
    this.state.attachedBaseUrl = undefined;
    this.state.lastKnownState = undefined;
    this.lastState = undefined;
    this.recentEvents = [];
  }

  clearAttachmentIfBaseUrl(baseUrl: string | undefined): boolean {
    if (!baseUrl || this.state.attachedBaseUrl !== baseUrl) return false;
    this.clearAttachment();
    return true;
  }

  async refreshState(signal?: AbortSignal): Promise<SymphonyStateResponse> {
    if (!this.client) throw new SymphonyExtensionError("no_attachment", "No Symphony server is attached");
    const state = await this.client.getState(signal);
    this.lastState = state;
    this.state.lastKnownState = this.client.toHealthSummary(state);
    return state;
  }

  async requestRefresh(signal?: AbortSignal): Promise<SymphonyStateResponse> {
    if (!this.client) throw new SymphonyExtensionError("no_attachment", "No Symphony server is attached");
    await this.client.refresh(signal);
    return this.refreshState(signal);
  }

  async steerWorker(issueIdentifier: string, instruction: string, signal?: AbortSignal): Promise<SteerResponse> {
    if (!this.client) throw new SymphonyExtensionError("no_attachment", "No Symphony server is attached");
    const result = await this.client.steer(issueIdentifier, instruction, signal);
    try {
      await this.refreshState(signal);
    } catch (error) {
      console.warn("Symphony state refresh failed after steer", error);
    }
    return result;
  }

  async respondToEscalation(requestId: string, response: unknown, signal?: AbortSignal): Promise<EscalationRespondResponse> {
    if (!this.client) throw new SymphonyExtensionError("no_attachment", "No Symphony server is attached");
    const result = await this.client.respondEscalation(requestId, response, "pi-dashboard", signal);
    try {
      await this.refreshState(signal);
    } catch (error) {
      console.warn("Symphony state refresh failed after escalation response", error);
    }
    return result;
  }

  recordEvent(event: SymphonyEventEnvelope): void {
    if (event.kind !== "worker" && event.kind !== "runtime" && !event.kind.startsWith("escalation_")) return;
    this.recentEvents = [...this.recentEvents, event].slice(-20);
  }

  statusText(): string {
    const attached = this.state.attachedBaseUrl ? `attached: ${this.state.attachedBaseUrl}` : "attached: no";
    const owned = this.state.ownedProcess ? `owned pid: ${this.state.ownedProcess.pid}` : "owned pid: none";
    const last = this.state.lastKnownState
      ? `running ${this.state.lastKnownState.runningCount}, retry ${this.state.lastKnownState.retryCount}, blocked ${this.state.lastKnownState.blockedCount}, completed ${this.state.lastKnownState.completedCount}`
      : "state: unknown";
    return `Symphony status\n${attached}\n${owned}\n${last}`;
  }

  errorText(error: unknown): string {
    return formatError(error);
  }
}
