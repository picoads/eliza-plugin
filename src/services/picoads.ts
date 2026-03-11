import crypto from "node:crypto";
import { Service, type IAgentRuntime, type Memory } from "@elizaos/core";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { getAddress } from "viem";

export class PicoadsService extends Service {
  static serviceType = "PICOADS";
  capabilityDescription =
    "Connects to the picoads micro ad network — handles EIP-191 auth, x402 payments, and marketplace interactions.";

  private apiUrl!: string;
  private account!: PrivateKeyAccount;
  private apiKey: string | null = null;
  private _agentId!: string;
  private termsAccepted = false;

  // Provider caches
  private marketCache: { data: string; expiresAt: number } | null = null;
  private stateCache: { data: string; expiresAt: number } | null = null;
  private CACHE_TTL_MS = 60_000;

  get agentId(): string {
    return this._agentId;
  }

  static async start(runtime: IAgentRuntime): Promise<PicoadsService> {
    const service = new PicoadsService(runtime);
    await service.initialize(runtime);
    return service;
  }

  async stop(): Promise<void> {
    this.marketCache = null;
    this.stateCache = null;
  }

  private async initialize(runtime: IAgentRuntime): Promise<void> {
    this.apiUrl =
      (runtime.getSetting("PICOADS_API_URL") as string) ??
      "https://picoads.xyz";
    const privateKey = runtime.getSetting("EVM_PRIVATE_KEY") as string;
    if (!privateKey)
      throw new Error("EVM_PRIVATE_KEY required in character settings");

    this.account = privateKeyToAccount(privateKey as `0x${string}`);
    this._agentId = getAddress(this.account.address);

    // Check Memory for existing registration
    const memories = await runtime.getMemories({
      tableName: "picoads_state",
    });
    const regMemory = memories?.find(
      (m: Memory) => {
        const meta = m.content?.metadata as Record<string, unknown> | undefined;
        return meta?.type === "registration";
      },
    );
    const regMeta = regMemory?.content?.metadata as Record<string, unknown> | undefined;
    if (regMeta?.apiKey) {
      this.apiKey = regMeta.apiKey as string;
      // Verify it still works
      try {
        const resp = await fetch(
          `${this.apiUrl}/agents/${this._agentId}/profile`,
        );
        if (!resp.ok) {
          this.apiKey = null;
        }
      } catch {
        this.apiKey = null;
      }
    }
  }

  // --- Registration state ---

  getRegistrationState(): {
    registered: boolean;
    apiKey: string | null;
  } {
    return { registered: this.apiKey !== null, apiKey: this.apiKey };
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  hasAcceptedTerms(): boolean {
    return this.termsAccepted;
  }

  markTermsAccepted(): void {
    this.termsAccepted = true;
  }

  // --- Provider caches ---

  getMarketCache(): string | null {
    if (this.marketCache && Date.now() < this.marketCache.expiresAt) {
      return this.marketCache.data;
    }
    this.marketCache = null;
    return null;
  }

  setMarketCache(data: string): void {
    this.marketCache = { data, expiresAt: Date.now() + this.CACHE_TTL_MS };
  }

  getStateCache(): string | null {
    if (this.stateCache && Date.now() < this.stateCache.expiresAt) {
      return this.stateCache.data;
    }
    this.stateCache = null;
    return null;
  }

  setStateCache(data: string): void {
    this.stateCache = { data, expiresAt: Date.now() + this.CACHE_TTL_MS };
  }

  invalidateStateCache(): void {
    this.stateCache = null;
  }

  // --- EIP-191 signing ---

  async signEip191(
    method: string,
    path: string,
  ): Promise<{ header: string; nonce: string; timestamp: string }> {
    const nonce = crypto.randomBytes(16).toString("hex");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = `picoads:${method}:${path}:${nonce}:${timestamp}`;

    const signature = await this.account.signMessage({ message });

    return {
      header: `EIP191 ${this._agentId}:${nonce}:${timestamp}:${signature}`,
      nonce,
      timestamp,
    };
  }

  // --- API calls ---

  async apiCall(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add EIP-191 auth for mutations
    if (method !== "GET") {
      const auth = await this.signEip191(method, path);
      headers["Authorization"] = auth.header;
    }

    let resp = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Retry on 429 with backoff
    if (resp.status === 429) {
      const retryAfter = Number(resp.headers.get("retry-after") ?? "5");
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      // Re-sign for mutations (nonce must be fresh)
      if (method !== "GET") {
        const auth = await this.signEip191(method, path);
        headers["Authorization"] = auth.header;
      }
      resp = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }

    return resp;
  }

  // --- x402 payment ---

  async payX402(
    endpoint: string,
    body?: unknown,
  ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
    // Step 1: POST to get 402 with payment details
    const probeResp = await this.apiCall("POST", endpoint, body);

    if (probeResp.status !== 402) {
      const data = await probeResp.json().catch(() => ({}));
      return {
        success: probeResp.ok,
        data: data as Record<string, unknown>,
        error: probeResp.ok ? undefined : (data as Record<string, unknown>).error as string,
      };
    }

    // Step 2: Decode payment requirements from PAYMENT-REQUIRED header
    const paymentRequiredHeader = probeResp.headers.get("payment-required");
    if (!paymentRequiredHeader) {
      return { success: false, error: "Got 402 but no PAYMENT-REQUIRED header" };
    }

    const paymentRequired = JSON.parse(
      Buffer.from(paymentRequiredHeader, "base64").toString(),
    );
    const requirements = paymentRequired.accepts[0];

    // Step 3: Sign EIP-3009 TransferWithAuthorization
    const validAfter = 0;
    const validBefore = Math.floor(Date.now() / 1000) + 3600;
    const nonce = `0x${crypto.randomBytes(32).toString("hex")}` as `0x${string}`;

    const domain = {
      name: (requirements.extra?.name as string) ?? "USD Coin",
      version: (requirements.extra?.version as string) ?? "2",
      chainId: 8453,
      verifyingContract: requirements.asset as `0x${string}`,
    };

    const types = {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };

    const typedMessage = {
      from: this.account.address,
      to: requirements.payTo as `0x${string}`,
      value: BigInt(requirements.amount),
      validAfter: BigInt(validAfter),
      validBefore: BigInt(validBefore),
      nonce,
    };

    const signature = await this.account.signTypedData({
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message: typedMessage,
    });

    // Step 4: Construct payment payload and encode as base64
    const paymentPayload = {
      x402Version: 2,
      resource: paymentRequired.resource,
      accepted: requirements,
      payload: {
        signature,
        authorization: {
          from: this.account.address,
          to: requirements.payTo,
          value: requirements.amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    };

    const paymentSignatureHeader = Buffer.from(
      JSON.stringify(paymentPayload),
    ).toString("base64");

    // Step 5: Resend with payment signature (fresh EIP-191 auth)
    const auth = await this.signEip191("POST", endpoint);
    const finalResp = await fetch(`${this.apiUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth.header,
        "PAYMENT-SIGNATURE": paymentSignatureHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const finalData = await finalResp.json().catch(() => ({}));
    return {
      success: finalResp.ok,
      data: finalData as Record<string, unknown>,
      error: finalResp.ok ? undefined : "Payment failed",
    };
  }
}
