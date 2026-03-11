import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const marketProvider: Provider = {
  name: "PICOADS_MARKET",
  description: "Current picoads marketplace state — active hubs, open bids/asks, pricing data",
  dynamic: true,

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { text: "" };

    const cached = service.getMarketCache();
    if (cached) return { text: cached };

    try {
      const hubsResp = await service.apiCall("GET", "/hubs?status=active");
      const hubs = hubsResp.ok
        ? ((await hubsResp.json()) as Array<Record<string, unknown>>)
        : [];

      if (hubs.length === 0) {
        const text = "picoads marketplace: no active hubs found.";
        service.setMarketCache(text);
        return { text };
      }

      const hubSummaries: string[] = [];

      // Limit to top 5 hubs to avoid excessive API calls
      for (const hub of hubs.slice(0, 5)) {
        const hubId = hub.id ?? hub.slug;

        const [statsResp, bidsResp] = await Promise.all([
          service.apiCall("GET", `/hubs/${hubId}/market-stats`),
          service.apiCall("GET", `/hubs/${hubId}/bids?limit=5`),
        ]);

        const stats = statsResp.ok
          ? ((await statsResp.json()) as Record<string, unknown>)
          : {};
        const bids = bidsResp.ok
          ? ((await bidsResp.json()) as Array<Record<string, unknown>>)
          : [];

        const bidSummary = bids
          .map(
            (b) =>
              `$${b.unitPrice}/${b.objective} (budget: $${b.remainingBudget})`,
          )
          .join(", ");

        hubSummaries.push(
          `${hub.name ?? hubId}: ${stats.openBids ?? 0} open bids, ${stats.openAsks ?? 0} open asks. ` +
            (bidSummary ? `Top bids: ${bidSummary}. ` : "") +
            `Fill rate: ${stats.askFillRate ?? "N/A"}.`,
        );
      }

      const text = `picoads marketplace:\n${hubSummaries.join("\n")}`;
      service.setMarketCache(text);
      return { text };
    } catch {
      return { text: "picoads marketplace: unable to fetch market data." };
    }
  },
};
