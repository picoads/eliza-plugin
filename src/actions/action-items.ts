import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const checkActionItemsAction: Action = {
  name: "CHECK_ACTION_ITEMS",
  description:
    "Check what needs your attention on picoads. Shows pending deliveries, unconfirmed matches, " +
    "unpaid settlements, and other action items ranked by urgency.",
  similes: [
    "check action items",
    "what needs attention",
    "picoads todo",
    "what should I do next",
    "pending tasks",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    return !!service?.getRegistrationState().registered;
  },

  handler: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { success: false, error: "PicoadsService not available" };

    // Fetch matches and settlements in parallel
    const [matchesResp, settlementsResp] = await Promise.all([
      service.apiCall("GET", `/agents/${service.agentId}/matches`),
      service.apiCall("GET", `/agents/${service.agentId}/pending-settlements`),
    ]);

    const matches = matchesResp.ok
      ? ((await matchesResp.json()) as Array<Record<string, unknown>>)
      : [];
    const settlements = settlementsResp.ok
      ? ((await settlementsResp.json()) as Array<Record<string, unknown>>)
      : [];

    const pendingDelivery = matches.filter((m) => m.status === "pending_delivery");
    const delivered = matches.filter((m) => m.status === "delivered");
    const pendingSettlements = settlements.filter((s) => s.status === "pending");

    const items: string[] = [];

    if (pendingDelivery.length > 0) {
      items.push(
        `[URGENT] ${pendingDelivery.length} pending delivery(ies) — use FETCH_CREATIVE then DELIVER_AD`,
      );
    }
    if (delivered.length > 0) {
      items.push(
        `[ACTION] ${delivered.length} delivery(ies) awaiting your confirmation — use CONFIRM_DELIVERY`,
      );
    }
    if (pendingSettlements.length > 0) {
      const totalOwed = pendingSettlements.reduce(
        (sum, s) => sum + (s.grossAmount as number),
        0,
      );
      items.push(
        `[ACTION] ${pendingSettlements.length} unpaid settlement(s) totaling $${totalOwed.toFixed(2)} — use PAY_SETTLEMENT`,
      );
    }

    if (items.length === 0) {
      const text = "No action items. You're all caught up!";
      callback?.({ text });
      return { success: true, text };
    }

    const text = `Action items:\n${items.map((item, i) => `${i + 1}. ${item}`).join("\n")}`;
    callback?.({ text });
    return {
      success: true,
      text,
      data: {
        pendingDeliveries: pendingDelivery.length,
        awaitingConfirmation: delivered.length,
        unpaidSettlements: pendingSettlements.length,
      },
    };
  },

  examples: [
    [
      { name: "user", content: { text: "What needs my attention on picoads?" } },
      { name: "assistant", content: { text: "Checking your action items..." } },
    ],
  ],
};
