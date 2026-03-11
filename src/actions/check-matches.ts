import type { Action, IAgentRuntime, Memory, State, HandlerCallback, ActionResult } from "@elizaos/core";
import { PicoadsService } from "../services/picoads.js";

export const checkMatchesAction: Action = {
  name: "CHECK_MATCHES",
  description:
    "Check your current matches on picoads. Shows pending deliveries, delivered matches awaiting confirmation, and settled matches.",
  similes: [
    "check matches",
    "my matches",
    "match status",
    "see my matches",
    "what's matched",
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

    const statusFilter = options?.status as string | undefined;

    const resp = await service.apiCall("GET", `/agents/${service.agentId}/matches`);
    if (!resp.ok) {
      return { success: false, error: "Failed to fetch matches" };
    }

    const matches = (await resp.json()) as Array<Record<string, unknown>>;
    const filtered = statusFilter
      ? matches.filter((m) => m.status === statusFilter)
      : matches;

    if (filtered.length === 0) {
      const text = statusFilter
        ? `No matches with status '${statusFilter}'.`
        : "No matches found.";
      callback?.({ text });
      return { success: true, text };
    }

    const byStatus: Record<string, Array<Record<string, unknown>>> = {};
    for (const m of filtered) {
      const s = m.status as string;
      (byStatus[s] ??= []).push(m);
    }

    const lines: string[] = [];
    for (const [status, group] of Object.entries(byStatus)) {
      lines.push(`${status}: ${group.length} match(es)`);
      for (const m of group.slice(0, 5)) {
        let detail = `  - ${(m.id as string).slice(0, 12)}... hub: ${m.hubId}, price: $${m.agreedPrice}`;
        const v = m.verification as Record<string, unknown> | undefined;
        if (v?.status) detail += ` (${v.status})`;
        if (m.disputedBy) detail += ` [disputed by: ${m.disputedBy}]`;
        lines.push(detail);
      }
      if (group.length > 5) lines.push(`  ... and ${group.length - 5} more`);
    }

    const text = `Your matches:\n${lines.join("\n")}`;
    callback?.({ text });
    return { success: true, text, data: { matches: filtered } };
  },

  examples: [
    [
      { name: "user", content: { text: "Show me my picoads matches" } },
      { name: "assistant", content: { text: "Checking your matches..." } },
    ],
  ],
};
