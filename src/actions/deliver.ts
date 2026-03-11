import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const deliverAction: Action = {
  name: "DELIVER_AD",
  description:
    "Report delivery of an ad for a matched ask. Provide proof of delivery (e.g. where it was published, screenshot URL). " +
    "Self-reported proof is accepted but won't count toward tier advancement. Use url-verified (include a URL) for verified deliveries that build trust.",
  similes: [
    "deliver ad",
    "report delivery",
    "I delivered the ad",
    "submit proof",
    "mark as delivered",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    return !!service?.getRegistrationState().registered;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { success: false, error: "PicoadsService not available" };

    let matchId = options?.matchId as string | undefined;
    const proofType = (options?.proofType as string) ?? "self-reported";
    const evidence = options?.evidence as Record<string, unknown> | string | undefined;

    // Auto-find pending delivery if no matchId
    if (!matchId) {
      const resp = await service.apiCall(
        "GET",
        `/agents/${service.agentId}/matches`,
      );
      if (resp.ok) {
        const matches = (await resp.json()) as Array<Record<string, unknown>>;
        const pending = matches.find((m) => m.status === "pending_delivery");
        if (pending) matchId = pending.id as string;
      }
    }

    if (!matchId) {
      callback?.({ text: "No pending deliveries found." });
      return { success: false, error: "No pending deliveries" };
    }

    const proof: Record<string, unknown> = {
      type: proofType,
      evidence: typeof evidence === "string"
        ? { description: evidence, deliveredAt: new Date().toISOString() }
        : evidence ?? { description: "Ad delivered via Eliza agent", deliveredAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    };

    const resp = await service.apiCall("POST", `/matches/${matchId}/delivery`, {
      reportedBy: service.agentId,
      proof,
    });

    const data = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      const error = data.error as string;
      callback?.({ text: `Delivery report failed: ${error}` });
      return { success: false, error };
    }

    service.invalidateStateCache();

    const verification = data.verification as Record<string, unknown> | undefined;
    const vStatus = verification?.status as string | undefined;
    let text: string;
    if (vStatus === "failed") {
      const reason = verification?.failureReason ?? "unknown";
      text = `Delivery proof failed verification (${reason}). Match disputed. No settlement created.`;
    } else if (vStatus === "verified") {
      text = `Delivery verified (${verification?.method}). Awaiting human review. Settlement created.`;
    } else {
      text = `Delivery recorded (unverified). Awaiting human review. Settlement created.`;
    }
    text += ` Match: ${matchId}.`;

    callback?.({ text });
    return { success: !!(vStatus !== "failed"), text, data };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "I published the ad in my newsletter, report delivery" },
      },
      {
        name: "assistant",
        content: { text: "Reporting delivery with self-reported proof..." },
      },
    ],
  ],
};
