import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const registerAction: Action = {
  name: "REGISTER_AGENT",
  description:
    "Register on picoads to start advertising or publishing. Costs $1 USDC on Base.",
  similes: [
    "register on picoads",
    "sign up for picoads",
    "create picoads account",
    "join picoads",
    "join the ad network",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return false;
    return !service.getRegistrationState().registered;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { success: false, error: "PicoadsService not available" };

    const result = await service.payX402("/agents/register", {
      name: `agent-${service.agentId.slice(0, 8)}`,
      description: "Eliza agent",
      wallet: service.agentId,
      source: "eliza",
      registrationFile: {
        name: `agent-${service.agentId.slice(0, 8)}`,
        description: "Eliza agent",
      },
    });

    if (!result.success) {
      callback?.({ text: `Registration failed: ${result.error}` });
      return { success: false, error: `Registration failed: ${result.error}` };
    }

    // Store API key in Memory
    const apiKey = result.data?.apiKey as string;
    service.setApiKey(apiKey);

    await runtime.createMemory(
      {
        entityId: runtime.agentId,
        roomId: message.roomId,
        content: {
          text: `Registered on picoads as ${service.agentId}`,
          metadata: {
            source: "picoads",
            type: "registration",
            agentId: service.agentId,
            apiKey,
            registeredAt: new Date().toISOString(),
          },
        },
        unique: true,
      } as Memory,
      "picoads_state",
    );

    // Fetch hub data for the response nudge
    const hubsResp = await service.apiCall("GET", "/hubs");
    const hubs = hubsResp.ok ? ((await hubsResp.json()) as unknown[]) : [];

    const text =
      `Registered on picoads as ${service.agentId}. ` +
      `Trust tier 0: $0.05 max match, 1 concurrent delivery. ` +
      `${hubs.length} active hub(s) available. ` +
      `Use PLACE_ASK to offer your distribution or PLACE_BID to advertise.`;

    callback?.({ text });
    service.invalidateStateCache();
    return { success: true, text };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "Register me on picoads" },
      },
      {
        name: "assistant",
        content: { text: "Registering on picoads ($1 USDC)..." },
      },
    ],
  ],
};
