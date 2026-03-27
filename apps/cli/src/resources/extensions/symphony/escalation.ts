import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { showInterviewRound, type Question, type QuestionOption } from "../shared/interview-ui.js";
import type { SymphonyClient } from "./client.js";
import type { EscalationEvent, SymphonyEventEnvelope } from "./types.js";

function toQuestionOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): QuestionOption | null => {
      if (!entry || typeof entry !== "object") return null;
      const option = entry as Record<string, unknown>;
      const label = typeof option.label === "string" ? option.label.trim() : "";
      const description =
        typeof option.description === "string" ? option.description : "";
      if (!label) return null;
      return { label, description };
    })
    .filter((entry): entry is QuestionOption => entry !== null);
}

export function parseEscalationQuestions(payload: unknown): Question[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  const rawQuestions = Array.isArray(obj.questions) ? obj.questions : [];

  return rawQuestions
    .map((entry, index): Question | null => {
      if (!entry || typeof entry !== "object") return null;
      const question = entry as Record<string, unknown>;
      const id =
        typeof question.id === "string" && question.id.trim().length > 0
          ? question.id
          : `escalation_q_${index + 1}`;
      const header =
        typeof question.header === "string" && question.header.trim().length > 0
          ? question.header
          : `Question ${index + 1}`;
      const prompt =
        typeof question.question === "string"
          ? question.question
          : typeof question.prompt === "string"
            ? question.prompt
            : "Please provide operator guidance.";

      const options = toQuestionOptions(question.options);
      if (options.length === 0) {
        options.push({
          label: "Provide guidance",
          description: "Enter your decision in notes before submitting.",
        });
      }

      return {
        id,
        header,
        question: prompt,
        options,
        allowMultiple: question.allowMultiple === true,
      };
    })
    .filter((entry): entry is Question => entry !== null);
}

export function formatEscalationResponse(
  answers: Record<string, { selected: string | string[]; notes: string }>,
): Record<string, unknown> {
  const response = Object.entries(answers).map(([id, answer]) => ({
    id,
    selected: answer.selected,
    notes: answer.notes,
  }));

  return {
    cancelled: response.length === 0,
    response,
  };
}

export async function handleEscalation(
  event: EscalationEvent,
  client: SymphonyClient,
  ctx: ExtensionCommandContext,
  responderId?: string,
): Promise<void> {
  const questions = parseEscalationQuestions(event.payload);
  const effectiveQuestions =
    questions.length > 0
      ? questions
      : [
          {
            id: "escalation_response",
            header: "Escalation",
            question: "Worker requested input. Provide guidance.",
            options: [
              {
                label: "Provide guidance",
                description: "Enter your response in notes before submitting.",
              },
            ],
          },
        ];

  ctx.ui.notify(
    `⚠️ Worker [${event.issue_identifier}] needs input (${event.method})`,
    "warning",
  );

  const result = await showInterviewRound(
    effectiveQuestions,
    {
      progress: `${event.issue_identifier} • ${event.method}`,
      reviewHeadline: `Respond to ${event.issue_identifier}`,
      exitHeadline: "Dismiss escalation?",
      exitLabel: "dismiss escalation",
    },
    ctx,
  );

  const responsePayload = formatEscalationResponse(result.answers);
  const response = await client.respondToEscalation(
    event.request_id,
    responsePayload,
    responderId,
  );

  if (!response.ok) {
    if (response.status === 404) {
      ctx.ui.notify(
        "Escalation timed out before response was submitted.",
        "warning",
      );
      return;
    }

    if (response.status === 409) {
      ctx.ui.notify("Escalation already resolved by another responder.", "warning");
      return;
    }

    ctx.ui.notify(
      `Escalation response failed with HTTP ${response.status}.`,
      "error",
    );
    return;
  }

  ctx.ui.notify(
    `Escalation response sent for ${event.issue_identifier}.`,
    "success",
  );
}

export class EscalationQueue {
  private readonly client: SymphonyClient;
  private readonly ctx: ExtensionCommandContext;
  private readonly responderId?: string;
  private readonly queue: Array<SymphonyEventEnvelope & { payload: EscalationEvent }> = [];
  private processing = false;

  constructor(
    client: SymphonyClient,
    ctx: ExtensionCommandContext,
    responderId?: string,
  ) {
    this.client = client;
    this.ctx = ctx;
    this.responderId = responderId;
  }

  enqueue(event: SymphonyEventEnvelope & { payload: EscalationEvent }): void {
    this.queue.push(event);
    const pending = this.queue.length - 1;
    if (pending > 0) {
      this.ctx.ui.notify(`${pending} more escalations pending`, "warning");
    }
    void this.process();
  }

  removeByRequestId(requestId: string): boolean {
    const index = this.queue.findIndex(
      (entry) => entry.payload.request_id === requestId,
    );

    if (index < 0) {
      return false;
    }

    this.queue.splice(index, 1);
    return true;
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const current = this.queue.shift();
        if (!current) continue;

        try {
          await handleEscalation(
            current.payload,
            this.client,
            this.ctx,
            this.responderId,
          );
        } catch (error) {
          this.ctx.ui.notify(
            error instanceof Error
              ? `Escalation handling failed: ${error.message}`
              : "Escalation handling failed.",
            "error",
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }
}
