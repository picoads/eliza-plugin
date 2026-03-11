import type { Provider, IAgentRuntime, Memory, State, ProviderResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const agentStateProvider: Provider = {
  name: "PICOADS_AGENT_STATE",
  description: "Your picoads registration, reputation, and pending actions",
  dynamic: true,

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    const service = runtime.getService<PicoadsService>("PICOADS");
    if (!service) return { text: "" };

    const cached = service.getStateCache();
    if (cached) return { text: cached };

    const regState = service.getRegistrationState();
    if (!regState.registered) {
      const text =
        "Not registered on picoads. Use REGISTER_AGENT to register ($1 USDC on Base).";
      return { text };
    }

    try {
      const [repResp, matchResp, settResp] = await Promise.all([
        service.apiCall("GET", `/agents/${service.agentId}/reputation`),
        service.apiCall("GET", `/agents/${service.agentId}/matches`),
        service.apiCall("GET", `/agents/${service.agentId}/pending-settlements`),
      ]);

      const rep = repResp.ok
        ? ((await repResp.json()) as Record<string, unknown>)
        : {};
      const matches = matchResp.ok
        ? ((await matchResp.json()) as Array<Record<string, unknown>>)
        : [];
      const settlements = settResp.ok
        ? ((await settResp.json()) as Array<Record<string, unknown>>)
        : [];

      const pending = matches.filter((m) => m.status === "pending_delivery");
      const delivered = matches.filter((m) => m.status === "delivered");

      let text = "picoads agent state:\n";
      text += `Trust tier: ${rep.trustTier ?? 0} (${rep.trustTierName ?? "unproven"}). `;
      text += `Max match: $${rep.maxMatchPrice ?? 0.05}. `;
      text += `${pending.length} pending deliveries. `;
      text += `${delivered.length} awaiting confirmation. `;
      text += `${settlements.length} unpaid settlements ($${settlements.reduce((s, x) => s + ((x.grossAmount as number) ?? 0), 0).toFixed(2)} owed).`;

      if (pending.length > 0) {
        text += `\nACTION NEEDED: You have ${pending.length} pending delivery(ies). Use FETCH_CREATIVE then DELIVER_AD.`;
      }
      if (settlements.length > 0) {
        text += `\nACTION NEEDED: You have ${settlements.length} unpaid settlement(s). Use PAY_SETTLEMENT.`;
      }

      service.setStateCache(text);
      return { text };
    } catch {
      return { text: "picoads agent state: unable to fetch state data." };
    }
  },
};
