import fs from "node:fs/promises";
import path from "node:path";

const BACKUP_ROOT = path.resolve("backups/db-snapshots");
const HISTORY_DIR = path.join(BACKUP_ROOT, "history");
const LATEST_DIR = path.join(BACKUP_ROOT, "latest");
const KEEP_FILES = Number.parseInt(process.env.DB_BACKUP_HISTORY_KEEP ?? "60", 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.DB_BACKUP_TIMEOUT_MS ?? "15000", 10);

function requiredEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`DB_GUARD_ERROR: Missing required env: ${name}`);
  }
  return value;
}

async function requestJson(url, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`DB_GUARD_ERROR: Request timeout after ${REQUEST_TIMEOUT_MS}ms for ${url}`);
    }
    throw new Error(`DB_GUARD_ERROR: Network error for ${url}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DB_GUARD_ERROR: HTTP ${response.status} for ${url}: ${text.slice(0, 500)}`);
  }
  return response.json();
}

function safeTimestamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

async function ensureDirs() {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
  await fs.mkdir(LATEST_DIR, { recursive: true });
}

async function cleanupHistory() {
  const entries = await fs.readdir(HISTORY_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("db-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  const keep = Number.isFinite(KEEP_FILES) ? Math.max(10, KEEP_FILES) : 60;
  if (files.length <= keep) return;
  const toDelete = files.slice(0, files.length - keep);
  await Promise.all(toDelete.map((name) => fs.unlink(path.join(HISTORY_DIR, name))));
}

async function assertBackendReachable(baseUrl) {
  const health = await requestJson(`${baseUrl}/health`, { method: "GET" });
  if (!health || health.ok !== true) {
    throw new Error("DB_GUARD_ERROR: Backend /health is not healthy.");
  }
  const dataDir = String(health.dataDir ?? "").trim();
  const strictMode = Boolean(health.strictPersistenceMode);
  if (!dataDir) {
    throw new Error("DB_GUARD_ERROR: /health does not expose dataDir.");
  }

  const sourceLabel = dataDir.startsWith("/tmp/")
    ? `temporary (${dataDir})`
    : `persistent (${dataDir})`;
  console.log(`[db-guard] backend reachable, source db dir: ${sourceLabel}`);
  console.log(`[db-guard] strictPersistenceMode=${strictMode}`);
}

async function run() {
  const baseUrl = requiredEnv("BACKEND_BASE_URL").replace(/\/+$/, "");
  const adminEmail = requiredEnv("BACKEND_ADMIN_EMAIL");
  const adminPassword = requiredEnv("BACKEND_ADMIN_PASSWORD");

  await assertBackendReachable(baseUrl);

  const authPayload = await requestJson(`${baseUrl}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });
  const token = String(authPayload?.token ?? "");
  if (!token) {
    throw new Error("DB_GUARD_ERROR: Failed to obtain auth token from backend login.");
  }

  const exported = await requestJson(`${baseUrl}/v1/admin/db/export`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const db = exported?.db;
  if (!db || typeof db !== "object") {
    throw new Error("DB_GUARD_ERROR: Invalid export payload: missing db object.");
  }

  await ensureDirs();
  const stamp = safeTimestamp();
  const historyFile = path.join(HISTORY_DIR, `db-${stamp}.json`);
  const latestFile = path.join(LATEST_DIR, "db.json");
  const metaFile = path.join(LATEST_DIR, "meta.json");

  await fs.writeFile(historyFile, JSON.stringify(db, null, 2), "utf8");
  await fs.writeFile(latestFile, JSON.stringify(db, null, 2), "utf8");
  await fs.writeFile(
    metaFile,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        backend: baseUrl,
        exportedAt: exported?.exportedAt ?? null,
        exportedBy: exported?.exportedBy ?? null,
      },
      null,
      2
    ),
    "utf8"
  );
  await cleanupHistory();

  console.log(`[db-guard] backup saved: ${historyFile}`);
  console.log("[db-guard] backup saved to latest/db.json and latest/meta.json");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message.startsWith("DB_GUARD_ERROR:") ? message : `DB_GUARD_ERROR: ${message}`);
  console.error("DB_GUARD_ERROR: Commit/push must be stopped until DB backup succeeds.");
  process.exitCode = 1;
});
