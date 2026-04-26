import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "softale_server_token_v1";

export type EmpathyPassType = "self_actual" | "friend_predicted_by_me";

export type EmpathyPairView = {
  id: string;
  eventId: string;
  members: [string, string];
  counterpartEmail: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  report: {
    answersOverlapPercent: number;
    overallEmpathyPercent: number;
    achievement: string;
    perMember: Record<string, { empathyPercent: number }>;
  } | null;
  me: {
    selfActualDone: boolean;
    friendPredictionDone: boolean;
    selfActualAnswers: number[] | null;
    friendPredictionAnswers: number[] | null;
  };
  counterpart: {
    selfActualDone: boolean;
    friendPredictionDone: boolean;
  };
};

function getApiBaseUrl() {
  return (process.env.EXPO_PUBLIC_ECONOMY_API_BASE_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}): Promise<T> {
  const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    throw new Error("Missing auth token");
  }
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const empathyApi = {
  invite(friendEmail: string) {
    return request<{ pair: EmpathyPairView }>("/v1/empathy/pairs/invite", {
      method: "POST",
      body: { friendEmail },
    });
  },
  listPairs() {
    return request<{ pairs: EmpathyPairView[] }>("/v1/empathy/pairs");
  },
  submitPass(pairId: string, passType: EmpathyPassType, answers: number[]) {
    return request<{ pair: EmpathyPairView }>(`/v1/empathy/pairs/${pairId}/pass`, {
      method: "POST",
      body: { passType, answers },
    });
  },
};
