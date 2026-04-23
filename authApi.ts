export type ServerRole = "USER" | "ADMIN";

export type ServerWallet = {
  xp: number;
  energy: number;
  level?: number;
};

export type ServerUser = {
  email: string;
  role: ServerRole;
  displayName: string;
  profile: Record<string, unknown>;
  wallet: ServerWallet;
};

export type AuthResponse = {
  token: string;
  user: ServerUser;
  economy: ServerWallet;
};

const AUTH_TOKEN_KEY = "softale_server_token_v1";

function getApiBaseUrl() {
  return process.env.EXPO_PUBLIC_ECONOMY_API_BASE_URL ?? "http://localhost:3000";
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown>; token?: string } = {}): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
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

export const authApi = {
  getMode(): "local" | "server" {
    return process.env.EXPO_PUBLIC_AUTH_MODE === "server" ? "server" : "local";
  },
  storageKey: AUTH_TOKEN_KEY,
  register(email: string, password: string, displayName?: string) {
    return request<AuthResponse>("/v1/auth/register", {
      method: "POST",
      body: { email, password, displayName },
    });
  },
  login(email: string, password: string) {
    return request<AuthResponse>("/v1/auth/login", {
      method: "POST",
      body: { email, password },
    });
  },
  me(token: string) {
    return request<{ user: ServerUser; economy: ServerWallet }>("/v1/auth/me", {
      token,
    });
  },
  syncProfile(token: string, profile: Record<string, unknown>) {
    return request<{ user: ServerUser }>("/v1/economy/profile/sync", {
      method: "POST",
      token,
      body: { profile },
    });
  },
};
