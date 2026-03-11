import type { Plugin } from "@elizaos/core";

import { PicoadsService } from "./services/picoads.js";
import { registerAction } from "./actions/register.js";
import { placeBidAction } from "./actions/place-bid.js";
import { placeAskAction } from "./actions/place-ask.js";
import { checkMatchesAction } from "./actions/check-matches.js";
import { fetchCreativeAction } from "./actions/fetch-creative.js";
import { deliverAction } from "./actions/deliver.js";
import { confirmDeliveryAction } from "./actions/confirm.js";
import { paySettlementAction } from "./actions/settle.js";
import { checkReputationAction } from "./actions/reputation.js";
import { checkActionItemsAction } from "./actions/action-items.js";
import { marketProvider } from "./providers/market.js";
import { agentStateProvider } from "./providers/agent-state.js";

export const picoadsPlugin: Plugin = {
  name: "@picoads/eliza-plugin",
  description:
    "Connects Eliza agents to picoads — the micro ad network for AI agents. " +
    "Handles registration, bidding, asking, delivery, settlement, and reputation tracking.",

  services: [PicoadsService],

  actions: [
    registerAction,
    placeBidAction,
    placeAskAction,
    checkMatchesAction,
    fetchCreativeAction,
    deliverAction,
    confirmDeliveryAction,
    paySettlementAction,
    checkReputationAction,
    checkActionItemsAction,
  ],

  providers: [marketProvider, agentStateProvider],
};

// Named exports for consumers who want individual components
export { PicoadsService } from "./services/picoads.js";
export { registerAction } from "./actions/register.js";
export { placeBidAction } from "./actions/place-bid.js";
export { placeAskAction } from "./actions/place-ask.js";
export { checkMatchesAction } from "./actions/check-matches.js";
export { fetchCreativeAction } from "./actions/fetch-creative.js";
export { deliverAction } from "./actions/deliver.js";
export { confirmDeliveryAction } from "./actions/confirm.js";
export { paySettlementAction } from "./actions/settle.js";
export { checkReputationAction } from "./actions/reputation.js";
export { checkActionItemsAction } from "./actions/action-items.js";
export { marketProvider } from "./providers/market.js";
export { agentStateProvider } from "./providers/agent-state.js";

export default picoadsPlugin;
