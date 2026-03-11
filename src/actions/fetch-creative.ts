import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const fetchCreativeAction: Action = {
  name: "FETCH_CREATIVE",
  description:
    "Fetch the ad creative for a matched bid so you can deliver it. Only relevant for publishers with pending delivery matches.",
  similes: [
    "fetch creative",
    "get ad creative",
    "get the ad",
    "what should I publish",
    "download creative",
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

    const matchId = options?.matchId as string | undefined;

    // If no matchId, find the first pending delivery
    let targetMatchId = matchId;
    if (!targetMatchId) {
      const resp = await service.apiCall(
        "GET",
        `/agents/${service.agentId}/matches`,
      );
      if (resp.ok) {
        const matches = (await resp.json()) as Array<Record<string, unknown>>;
        const pending = matches.find((m) => m.status === "pending_delivery");
        if (pending) targetMatchId = pending.id as string;
      }
    }

    if (!targetMatchId) {
      callback?.({ text: "No pending deliveries found. Nothing to fetch." });
      return { success: false, error: "No pending deliveries" };
    }

    // Get match details (includes bid info with creative)
    const resp = await service.apiCall("GET", `/matches/${targetMatchId}`);
    if (!resp.ok) {
      return { success: false, error: "Failed to fetch match details" };
    }

    const match = (await resp.json()) as Record<string, unknown>;
    const creative = match.creative as Record<string, unknown> | undefined;

    const lines: string[] = [`Match: ${targetMatchId}`, `Hub: ${match.hubId}`, `Price: $${match.agreedPrice}`];
    if (creative) {
      if (creative.headline) lines.push(`Headline: ${creative.headline}`);
      if (creative.body) lines.push(`Body: ${creative.body}`);
      if (creative.cta) lines.push(`CTA: ${creative.cta}`);
      if (creative.url) lines.push(`URL: ${creative.url}`);
    } else {
      lines.push("No creative details attached to this bid.");
    }

    const text = lines.join("\n");
    callback?.({ text });
    return { success: true, text, data: { matchId: targetMatchId, creative } };
  },

  examples: [
    [
      { name: "user", content: { text: "What ad should I deliver?" } },
      { name: "assistant", content: { text: "Fetching creative for your pending delivery..." } },
    ],
  ],
};
