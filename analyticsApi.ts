import AsyncStorage from "@react-native-async-storage/async-storage";

const AUTH_TOKEN_KEY = "softale_server_token_v1";

type AnalyticsEventPayload = {
  type: string;
  details?: string;
  tab?: string;
  courseId?: string;
  storyId?: string;
  difficulty?: number;
  stepIndex?: number;
};

export type AdminMetricsResponse = {
  generatedAt: string;
  totals: {
    users: number;
    registrations24h: number;
    sessions24h: number;
    logins24h: number;
    activeUsers24h: number;
    dau: number;
    wau: number;
    mau: number;
  };
  funnel24h: {
    questStarts: number;
    questCompletions: number;
    questCompletionRate: number;
    courseStarts: number;
    courseCompletions: number;
    courseCompletionRate: number;
  };
  quality24h: {
    dropOffs: number;
    stepFails: number;
    penalties: number;
    answerIncorrect: number;
    topErrorTypes: Array<{ errorType: string; count: number }>;
  };
  engagement24h: {
    tabViews: number;
    topTabs: Array<{ tab: string; views: number }>;
  };
  recentCriticalEvents: Array<{ at: string; email: string; type: string; details: string }>;
  perUser: Array<{
    email: string;
    role: string;
    lastSeenAt: string | null;
    wallet: { xp: number; energy: number };
    profile: {
      displayName: string;
      avatarUri: string | null;
      aboutMe: string;
      completedCount: number;
      conflictPrimaryStyle: string;
    };
    events24h: number;
    sessions24h: number;
    dropOff24h: number;
    questStarts24h: number;
    questCompletions24h: number;
    countersAll: {
      sessions: number;
      questStarts: number;
      questCompletions: number;
      courseStarts: number;
      courseCompletions: number;
      stageStarts: number;
      stageCompletions: number;
      stepFails: number;
      penalties: number;
      dropOffs: number;
      answerCorrect: number;
      answerIncorrect: number;
    };
    topErrorTypesAll: Array<{ errorType: string; count: number }>;
    topTacticsAll: Array<{ tactic: string; count: number }>;
    recentEvents: Array<{ id: string; at: string; type: string; details: string }>;
  }>;
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

export const analyticsApi = {
  trackEvent(payload: AnalyticsEventPayload) {
    return request<{ ok: boolean; id: string }>("/v1/analytics/event", {
      method: "POST",
      body: payload,
    });
  },
  getAdminMetrics() {
    return request<AdminMetricsResponse>("/v1/admin/metrics");
  },
};
