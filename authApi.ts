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

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown>; token?: string } = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(`Нет соединения с сервером авторизации (${baseUrl}). Проверь backend URL и доступность сети.`);
  }

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
  async uploadAvatar(token: string, avatarUri: string) {
    const baseUrl = getApiBaseUrl();
    const formData = new FormData();
    const fileName = `avatar-${Date.now()}.jpg`;

    if (avatarUri.startsWith("blob:") || avatarUri.startsWith("data:") || avatarUri.startsWith("http")) {
      const blob = await fetch(avatarUri).then((response) => response.blob());
      formData.append("avatar", blob, fileName);
    } else {
      formData.append(
        "avatar",
        {
          uri: avatarUri,
          name: fileName,
          type: "image/jpeg",
        } as unknown as Blob
      );
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/profile/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
    } catch {
      throw new Error(`Нет соединения с сервером (${baseUrl}). Не удалось загрузить аватар.`);
    }

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

    return (await response.json()) as { avatarUri: string };
  },
};
