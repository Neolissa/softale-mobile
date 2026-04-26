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
  const configured = (process.env.EXPO_PUBLIC_ECONOMY_API_BASE_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  const isHttp = configured.startsWith("http://");

  if (!__DEV__ && isLocalhost) {
    throw new Error("Release-билд настроен на localhost. Укажи публичный URL backend в EXPO_PUBLIC_ECONOMY_API_BASE_URL.");
  }
  if (!__DEV__ && isHttp) {
    throw new Error("Release-билд должен использовать HTTPS backend URL (EXPO_PUBLIC_ECONOMY_API_BASE_URL).");
  }

  return configured;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(`Нет соединения с backend (${baseUrl}). Проверь EXPO_PUBLIC_ECONOMY_API_BASE_URL и сеть.`);
  }
  if (!response.ok) {
    let message = `Economy API error ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
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
