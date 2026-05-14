import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { resolveSymphonyBinary } from "./binary-resolver.ts";
import { formatError, SymphonyExtensionError } from "./errors.ts";
import { SymphonyHttpClient, type SymphonyStateResponse } from "./http-client.ts";
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

  async attach(baseUrl: string): Promise<SymphonyStateResponse> {
    const client = new SymphonyHttpClient(baseUrl);
    const state = await client.verify();
    this.client = client;
    this.state.attachedBaseUrl = client.baseUrl;
    this.state.lastKnownState = client.toHealthSummary(state);
    return state;
  }

  async refreshState(): Promise<SymphonyStateResponse> {
    if (!this.client) throw new SymphonyExtensionError("no_attachment", "No Symphony server is attached");
    const state = await this.client.getState();
    this.state.lastKnownState = this.client.toHealthSummary(state);
    return state;
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
