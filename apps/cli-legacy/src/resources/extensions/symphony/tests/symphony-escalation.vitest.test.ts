import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SymphonyClient } from "../client.js";
import type { EscalationEvent, SymphonyEventEnvelope } from "../types.js";
import {
  EscalationQueue,
  formatEscalationResponse,
  handleEscalation,
  parseEscalationQuestions,
} from "../escalation.js";
import { isEscalationEvent } from "../types.js";

const showInterviewRoundMock = vi.fn();

vi.mock("../../shared/interview-ui.js", () => ({
  showInterviewRound: (...args: unknown[]) => showInterviewRoundMock(...args),
}));

function makeClient(overrides: Partial<SymphonyClient> = {}): SymphonyClient {
  return {
    getConnectionConfig: () => ({
      url: "http://localhost:8080",
      origin: "preferences",
    }),
    getState: async () => ({
      poll_interval_ms: 30_000,
      max_concurrent_agents: 10,
      running: {},
      retry_queue: [],
      completed: [],
      codex_totals: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
      polling: { checking: false, next_poll_in_ms: 0, poll_interval_ms: 30_000 },
    }),
    getPendingEscalations: async () => [],
    respondToEscalation: async () => ({ ok: true, status: 200 }),
    steer: async () => ({ ok: true, status: 200 }),
    watchEvents: async function* () {
      return;
    },
    ...overrides,
  };
}

function makeCtx() {
  return {
    ui: {
      notify: vi.fn(),
    },
  } as unknown as Parameters<typeof handleEscalation>[2];
}

function makeEscalationEvent(overrides: Partial<EscalationEvent> = {}): EscalationEvent {
  return {
    request_id: "esc-123",
    issue_id: "issue-123",
    issue_identifier: "KAT-123",
    method: "ask_user_questions",
    payload: {
      questions: [
        {
          id: "approach",
          header: "Approach",
          question: "Pick an approach",
          options: [
            { label: "Option A", description: "A" },
            { label: "Option B", description: "B" },
          ],
        },
      ],
    },
    created_at: new Date().toISOString(),
    timeout_ms: 300_000,
    ...overrides,
  };
}

describe("symphony escalation helpers", () => {
  beforeEach(() => {
    showInterviewRoundMock.mockReset();
  });

  it("parses escalation event envelopes", () => {
    const envelope: SymphonyEventEnvelope = {
      version: "v1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent(),
      issue: "KAT-123",
    };

    expect(isEscalationEvent(envelope)).toBe(true);
  });

  it("maps extension payload questions into interview questions", () => {
    const questions = parseEscalationQuestions(makeEscalationEvent().payload);
    expect(questions).toHaveLength(1);
    expect(questions[0].id).toBe("approach");
    expect(questions[0].options).toHaveLength(2);
  });

  it("formats interview answers into response payload", () => {
    const payload = formatEscalationResponse({
      approach: {
        selected: "Option A",
        notes: "go with A",
      },
    });

    expect(payload).toMatchObject({
      cancelled: false,
      response: [
        {
          id: "approach",
          selected: "Option A",
          notes: "go with A",
        },
      ],
    });
  });

  it("posts escalation responses and handles timeout errors gracefully", async () => {
    showInterviewRoundMock.mockResolvedValue({
      endInterview: false,
      answers: {
        approach: {
          selected: "Option A",
          notes: "Go with A",
        },
      },
    });

    const respondToEscalation = vi
      .fn<SymphonyClient["respondToEscalation"]>()
      .mockResolvedValue({ ok: false, status: 404 });

    const client = makeClient({ respondToEscalation });
    const ctx = makeCtx();

    await handleEscalation(makeEscalationEvent(), client, ctx, "operator-1");

    expect(respondToEscalation).toHaveBeenCalledWith(
      "esc-123",
      expect.objectContaining({ cancelled: false }),
      "operator-1",
    );
    expect((ctx.ui.notify as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "Escalation timed out before response was submitted.",
      "warning",
    );
  });

  it("queues multiple escalations and processes sequentially", async () => {
    const processingOrder: string[] = [];
    let releaseFirstInterview: (() => void) | null = null;
    const firstInterviewDeferred = new Promise<void>((resolve) => {
      releaseFirstInterview = resolve;
    });

    let interviewCalls = 0;
    showInterviewRoundMock.mockImplementation(async () => {
      interviewCalls += 1;
      if (interviewCalls === 1) {
        await firstInterviewDeferred;
      }
      return {
        endInterview: false,
        answers: {
          response: {
            selected: "Provide guidance",
            notes: "done",
          },
        },
      };
    });

    const client = makeClient({
      respondToEscalation: async (requestId) => {
        processingOrder.push(requestId);
        return { ok: true, status: 200 };
      },
    });
    const ctx = makeCtx();
    const queue = new EscalationQueue(client, ctx, "operator-1");

    const envelopeA: SymphonyEventEnvelope & { payload: EscalationEvent } = {
      version: "v1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-a" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent };

    const envelopeB: SymphonyEventEnvelope & { payload: EscalationEvent } = {
      version: "v1",
      sequence: 2,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-b" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent };

    queue.enqueue(envelopeA);
    queue.enqueue(envelopeB);

    await vi.waitFor(() => {
      expect(showInterviewRoundMock).toHaveBeenCalledTimes(1);
    });
    expect(processingOrder).toEqual([]);

    releaseFirstInterview?.();

    await vi.waitFor(() => {
      expect(processingOrder).toEqual(["esc-a", "esc-b"]);
      expect(showInterviewRoundMock).toHaveBeenCalledTimes(2);
    });
  });

  it("continues draining queue when one escalation fails", async () => {
    let callCount = 0;
    showInterviewRoundMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new Error("simulated failure");
      }
      return {
        endInterview: false,
        answers: {
          response: {
            selected: "Provide guidance",
            notes: "recovered",
          },
        },
      };
    });

    const respondToEscalation = vi
      .fn<SymphonyClient["respondToEscalation"]>()
      .mockResolvedValue({ ok: true, status: 200 });

    const client = makeClient({ respondToEscalation });
    const ctx = makeCtx();
    const queue = new EscalationQueue(client, ctx, "operator-1");

    queue.enqueue({
      version: "v1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-fail" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent });

    queue.enqueue({
      version: "v1",
      sequence: 2,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-ok" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent });

    await vi.waitFor(() => {
      expect(respondToEscalation).toHaveBeenCalledWith(
        "esc-ok",
        expect.any(Object),
        "operator-1",
      );
    });

    expect((ctx.ui.notify as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "Escalation handling failed: simulated failure",
      "error",
    );
  });

  it("removes queued escalations by request id", async () => {
    let releaseFirstInterview: (() => void) | null = null;
    const firstInterviewDeferred = new Promise<void>((resolve) => {
      releaseFirstInterview = resolve;
    });

    let callCount = 0;
    showInterviewRoundMock.mockImplementation(async () => {
      callCount += 1;
      if (callCount === 1) {
        await firstInterviewDeferred;
      }
      return {
        endInterview: false,
        answers: {
          response: {
            selected: "Provide guidance",
            notes: "done",
          },
        },
      };
    });

    const respondToEscalation = vi
      .fn<SymphonyClient["respondToEscalation"]>()
      .mockResolvedValue({ ok: true, status: 200 });
    const client = makeClient({ respondToEscalation });
    const ctx = makeCtx();
    const queue = new EscalationQueue(client, ctx, "operator-1");

    const envelopeA = {
      version: "v1",
      sequence: 1,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-a" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent };

    const envelopeB = {
      version: "v1",
      sequence: 2,
      timestamp: new Date().toISOString(),
      kind: "escalation_created",
      severity: "info",
      event: "escalation_created",
      payload: makeEscalationEvent({ request_id: "esc-b" }),
    } as SymphonyEventEnvelope & { payload: EscalationEvent };

    queue.enqueue(envelopeA);
    queue.enqueue(envelopeB);

    await vi.waitFor(() => {
      expect(showInterviewRoundMock).toHaveBeenCalledTimes(1);
    });

    expect(queue.removeByRequestId("esc-b")).toBe(true);
    expect(queue.removeByRequestId("esc-b")).toBe(false);

    releaseFirstInterview?.();

    await vi.waitFor(() => {
      expect(respondToEscalation).toHaveBeenCalledTimes(1);
      expect(respondToEscalation).toHaveBeenCalledWith(
        "esc-a",
        expect.any(Object),
        "operator-1",
      );
    });
  });
});
