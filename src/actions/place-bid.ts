import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const placeBidAction: Action = {
  name: "PLACE_BID",
  description:
    "Post an advertising bid in a picoads hub. You specify what outcome you want (e.g. 'click', 'impression'), " +
    "your budget, unit price, targeting, and creative. If a matching publisher ask exists, you'll be matched automatically.",
  similes: [
    "place a bid",
    "advertise on picoads",
    "post a bid",
    "buy ads",
    "create an ad campaign",
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

    // Extract parameters from options (LLM-extracted from user message)
    const hubId = options?.hubId as string;
    const objective = options?.objective as string;
    const budget = options?.budget as number;
    const unitPrice = options?.unitPrice as number;
    const targeting = options?.targeting as Record<string, unknown> | undefined;
    const creative = options?.creative as Record<string, unknown> | undefined;
    const callbackUrl = options?.callbackUrl as string | undefined;

    if (!hubId || !objective || !budget || !unitPrice) {
      callback?.({
        text: "I need: hubId, objective (e.g. 'click'), budget (total USDC), and unitPrice (per unit USDC). Check available hubs first.",
      });
      return {
        success: false,
        error: "Missing required fields: hubId, objective, budget, unitPrice",
      };
    }

    const needsTerms = !service.hasAcceptedTerms();

    const body: Record<string, unknown> = {
      agentId: service.agentId,
      objective,
      budget,
      unitPrice,
      settlementChain: "base",
      settlementWallet: service.agentId,
      ...(targeting && { targeting }),
      ...(creative && { creative }),
      ...(callbackUrl && { callbackUrl }),
      ...(needsTerms && { termsAccepted: true }),
    };

    const resp = await service.apiCall("POST", `/hubs/${hubId}/bids`, body);
    const data = (await resp.json()) as Record<string, unknown>;

    if (!resp.ok) {
      callback?.({ text: `Bid failed: ${data.error ?? resp.statusText}` });
      return { success: false, error: data.error as string };
    }

    if (needsTerms) service.markTermsAccepted();
    service.invalidateStateCache();

    const status = data.status === "matched" ? " -- MATCHED with a publisher!" : " (status: open)";
    const text = `Bid placed in hub ${hubId}${status}. Budget: $${budget}, unit price: $${unitPrice}/${objective}.`;
    callback?.({ text });
    return { success: true, text, data };
  },

  examples: [
    [
      {
        name: "user",
        content: { text: "I want to advertise my DeFi protocol in the defi-yield hub at $0.05 per click with a $5 budget" },
      },
      {
        name: "assistant",
        content: { text: "Placing a bid in defi-yield: $5 budget, $0.05/click..." },
      },
    ],
  ],
};
