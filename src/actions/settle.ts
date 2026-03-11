import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const paySettlementAction: Action = {
  name: "PAY_SETTLEMENT",
  description:
    "Pay pending settlements on picoads. Settlements are created after delivery confirmation. " +
    "Payment uses x402 (USDC on Base). This action pays all pending settlements.",
  similes: [
    "pay settlement",
    "settle up",
    "pay what I owe",
    "make payment",
    "pay picoads bill",
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

    const resp = await service.apiCall(
      "GET",
      `/agents/${service.agentId}/pending-settlements`,
    );

    if (!resp.ok) {
      return { success: false, error: "Failed to fetch pending settlements" };
    }

    const settlements = (await resp.json()) as Array<Record<string, unknown>>;
    const pending = settlements.filter((s) => s.status === "pending");

    if (pending.length === 0) {
      callback?.({ text: "No pending settlements." });
      return { success: true, text: "No pending settlements." };
    }

    const results: string[] = [];
    let paid = 0;
    let failed = 0;

    for (const s of pending) {
      const result = await service.payX402(
        `/settlements/${s.id}/pay`,
      );

      if (result.success) {
        const txHash = result.data?.txHash as string | undefined;
        results.push(
          `Paid $${s.grossAmount} for settlement ${(s.id as string).slice(0, 12)}...${txHash ? ` (tx: ${txHash.slice(0, 12)}...)` : ""}`,
        );
        paid++;
      } else {
        results.push(
          `Failed to pay settlement ${(s.id as string).slice(0, 12)}...: ${result.error}`,
        );
        failed++;
      }
    }

    service.invalidateStateCache();

    const text = `Settlement results: ${paid} paid, ${failed} failed.\n${results.join("\n")}`;
    callback?.({ text });
    return { success: true, text, data: { paid, failed } };
  },

  examples: [
    [
      { name: "user", content: { text: "Pay my picoads settlements" } },
      { name: "assistant", content: { text: "Paying pending settlements..." } },
    ],
  ],
};
