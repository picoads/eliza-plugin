import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const placeAskAction: Action = {
  name: "PLACE_ASK",
  description:
    "Post a publishing ask in a picoads hub. You specify your inventory (e.g. 'newsletter slot'), " +
    "floor price, audience details, and accepted formats. If a matching advertiser bid exists, you'll be matched automatically.",
  similes: [
    "place an ask",
    "offer distribution",
    "post an ask",
    "sell ad space",
    "offer inventory",
    "publish on picoads",
  ],

  validate: async (runtime: IAgentRuntime): Promise<boolean> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    return !!service?.getRegistrationState().registered;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    options?: Record<string, unknown>,
    callback?: HandlerCallback,
  ): Promise<ActionResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { success: false, error: "PicoadsService not available" };
    if (!service.getRegistrationState().registered) {
      return { success: false, error: "Not registered. Use REGISTER_AGENT first." };
    }

    const hubId = options?.hubId as string;
    const inventory = options?.inventory as string;
    const floorPrice = options?.floorPrice as number;
    const audience = options?.audience as Record<string, unknown> | undefined;
    const formats = options?.formats as string[] | undefined;
    const autoRenew = options?.autoRenew as boolean | undefined;
    const callbackUrl = options?.callbackUrl as string | undefined;

    if (!hubId || !inventory || !floorPrice) {
      callback?.({
        text: "I need: hubId, inventory (description of your ad space), and floorPrice (minimum USDC per unit).",
      });
      return {
        success: false,
        error: "Missing required fields: hubId, inventory, floorPrice",
      };
    }

    const needsTerms = !service.hasAcceptedTerms();

    const body: Record<string, unknown> = {
      agentId: service.agentId,
      inventory,
      floorPrice,
      settlementChain: "base",
      settlementWallet: service.agentId,
      formats: formats ?? ["text", "link"],
      ...(audience && { audience }),
      ...(autoRenew !== undefined && { autoRenew }),
      ...(callbackUrl && { callbackUrl }),
      ...(needsTerms && { termsAccepted: true }),
    };

    const resp = await service.apiCall("POST", `/hubs/${hubId}/asks`, body);
    const data = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      callback?.({ text: `Ask failed: ${data.error ?? resp.statusText}` });
      return { success: false, error: data.error as string };
    }

    if (needsTerms) service.markTermsAccepted();
    service.invalidateStateCache();

    const status = data.status === "matched" ? " -- MATCHED with an advertiser!" : " (status: open)";
    const text = `Ask placed in hub ${hubId}${status}. Inventory: ${inventory}, floor: $${floorPrice}.`;
    callback?.({ text });
    return { success: true, text, data };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "I want to sell a newsletter slot in the defi-yield hub at $0.03 floor" },
      },
      {
        name: "assistant",
        content: { text: "Placing an ask in defi-yield: newsletter slot at $0.03 floor..." },
      },
    ],
  ],
};
