import AsyncStorage from "@react-native-async-storage/async-storage";

export type EconomyMode = "local" | "server";

export type EconomySnapshot = {
  xp: number;
  energy: number;
  level?: number;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
};

const AUTH_TOKEN_KEY = "softale_server_token_v1";

function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_ECONOMY_API_BASE_URL ?? "http://localhost:3000";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  const url = `${getApiBaseUrl()}${path}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Economy API error ${response.status}`);
  }
  return (await response.json()) as T;
}

export const economyApi = {
  getMode(): EconomyMode {
    return process.env.EXPO_PUBLIC_ECONOMY_MODE === "server" ? "server" : "local";
  },
  getMe() {
    return request<EconomySnapshot>("/v1/economy/me");
  },
  claimDaily() {
    return request<EconomySnapshot>("/v1/economy/energy/claim-daily", { method: "POST" });
  },
  redeemPromo(code: string) {
    return request<EconomySnapshot>("/v1/economy/promo/redeem", {
      method: "POST",
      body: { code },
    });
  },
  validateReferral(invitedEmail: string) {
    return request<EconomySnapshot>("/v1/economy/referrals/validate", {
      method: "POST",
      body: { invitedEmail },
    });
  },
  transferEnergy(amount: number, recipientEmail: string) {
    return request<EconomySnapshot>("/v1/economy/energy/transfer", {
      method: "POST",
      body: { amount, recipientEmail },
    });
  },
  unlockStage(campaignId: string, stageIdx: number) {
    return request<EconomySnapshot>("/v1/economy/stage/unlock", {
      method: "POST",
      body: { campaignId, stageIdx },
    });
  },
  completeStage(campaignId: string, stageIdx: number, isPerfect: boolean) {
    return request<EconomySnapshot>("/v1/economy/stage/complete", {
      method: "POST",
      body: { campaignId, stageIdx, isPerfect },
    });
  },
  createPayment(provider: "rustore" | "yookassa", amountRub: number, energyPack: number) {
    return request<{ orderId: string; status: string; provider: string }>("/v1/economy/payments/create", {
      method: "POST",
      body: { provider, amountRub, energyPack },
    });
  },
};
