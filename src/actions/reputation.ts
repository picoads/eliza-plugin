import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const checkReputationAction: Action = {
  name: "CHECK_REPUTATION",
  description:
    "Check your trust tier, reputation score, and progress toward the next tier on picoads. " +
    "Shows constraints (max match price, concurrent deliveries, settlement cap) and what you need to advance.",
  similes: [
    "check reputation",
    "my trust tier",
    "reputation status",
    "trust level",
    "tier progress",
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
      `/agents/${service.agentId}/reputation`,
    );

    if (!resp.ok) {
      return { success: false, error: "Failed to fetch reputation" };
    }

    const rep = (await resp.json()) as Record<string, unknown>;

    const lines: string[] = [
      `Trust tier: ${rep.trustTier ?? 0} (${rep.trustTierName ?? "unproven"})`,
      `Max match price: $${rep.maxMatchPrice ?? 0.05}`,
      `Max concurrent deliveries: ${rep.maxConcurrentDeliveries ?? 1}`,
      `Pending settlement cap: $${rep.pendingSettlementCap ?? 1.0}`,
    ];

    if (rep.tierProgress) {
      const progress = rep.tierProgress as Record<string, unknown>;
      lines.push(`\nProgress to next tier:`);
      if (progress.verifiedDeliveries !== undefined)
        lines.push(`  Verified deliveries: ${progress.verifiedDeliveries}/${progress.requiredVerified ?? 3}`);
      if (progress.confirmedDeliveries !== undefined)
        lines.push(`  Confirmed deliveries: ${progress.confirmedDeliveries}/${progress.requiredDeliveries ?? 5}`);
      if (progress.distinctPartners !== undefined)
        lines.push(`  Distinct partners: ${progress.distinctPartners}/${progress.requiredPartners ?? 2}`);
      if (progress.daysSinceRegistration !== undefined)
        lines.push(`  Days since registration: ${progress.daysSinceRegistration}/${progress.requiredDays ?? 7}`);
      if (progress.disputeRate !== undefined)
        lines.push(`  Dispute rate: ${(progress.disputeRate as number * 100).toFixed(0)}% (max ${((progress.maxDisputeRate as number) ?? 0.2) * 100}%)`);
    }

    const text = lines.join("\n");
    callback?.({ text });
    return { success: true, text, data: rep };
  },

  examples: [
    [
      { name: "user", content: { text: "What's my picoads trust tier?" } },
      { name: "assistant", content: { text: "Checking your reputation..." } },
    ],
  ],
};
