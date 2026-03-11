import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const confirmDeliveryAction: Action = {
  name: "CONFIRM_DELIVERY",
  description:
    "Confirm or dispute a delivery as an advertiser. If the publisher delivered your ad correctly, confirm it to trigger settlement. " +
    "If not, dispute with a reason.",
  similes: [
    "confirm delivery",
    "approve delivery",
    "verify delivery",
    "dispute delivery",
    "reject delivery",
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

    const matchId = options?.matchId as string;
    const confirmed = options?.confirmed as boolean ?? true;
    const disputeReason = options?.disputeReason as string | undefined;

    if (!matchId) {
      // Try to find a delivered match
      const resp = await service.apiCall(
        "GET",
        `/agents/${service.agentId}/matches`,
      );
      if (resp.ok) {
        const matches = (await resp.json()) as Array<Record<string, unknown>>;
        const delivered = matches.find((m) => m.status === "delivered");
        if (delivered) {
          return handleConfirmation(service, delivered.id as string, confirmed, disputeReason, callback);
        }
      }
      callback?.({ text: "No delivered matches awaiting confirmation." });
      return { success: false, error: "No delivered matches found" };
    }

    return handleConfirmation(service, matchId, confirmed, disputeReason, callback);
  },

  examples: [
    [
      { name: "user", content: { text: "Confirm the delivery looks good" } },
      { name: "assistant", content: { text: "Confirming delivery..." } },
    ],
  ],
};

async function handleConfirmation(
  service: PicoadsService,
  matchId: string,
  confirmed: boolean,
  disputeReason: string | undefined,
  callback?: HandlerCallback,
): Promise<ActionResult> {
  if (!confirmed && disputeReason) {
    // Dispute
    const resp = await service.apiCall("POST", `/matches/${matchId}/dispute`, {
      agentId: service.agentId,
      reason: disputeReason,
    });
    const data = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      callback?.({ text: `Dispute failed: ${data.error}` });
      return { success: false, error: data.error as string };
    }

    service.invalidateStateCache();
    const text = `Delivery disputed for match ${matchId}. Reason: ${disputeReason}.`;
    callback?.({ text });
    return { success: true, text, data };
  }

  // Confirm
  const resp = await service.apiCall(
    "POST",
    `/matches/${matchId}/confirm-delivery`,
    {
      agentId: service.agentId,
      confirmed: true,
    },
  );
  const data = (await resp.json()) as Record<string, unknown>;

  if (!resp.ok) {
    callback?.({ text: `Confirmation failed: ${data.error}` });
    return { success: false, error: data.error as string };
  }

  service.invalidateStateCache();
  const text = `Delivery confirmed for match ${matchId}. Settlement will be created.`;
  callback?.({ text });
  return { success: true, text, data };
}
