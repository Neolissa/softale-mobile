const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const RUSTORE_WEBHOOK_SECRET = process.env.RUSTORE_WEBHOOK_SECRET || "dev-rustore-secret";
const YOOKASSA_WEBHOOK_SECRET = process.env.YOOKASSA_WEBHOOK_SECRET || "dev-yookassa-secret";
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || "neolissa@gmail.com";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "neolissaAdmin1001001";

const PERSISTENT_DATA_DIR = "/var/data";
const LEGACY_LOCAL_DATA_DIR = path.join(__dirname, "data");

function resolveDataDir() {
  const envDir = String(process.env.DATA_DIR || "").trim();
  if (envDir) {
    return envDir;
  }
  if (fs.existsSync(PERSISTENT_DATA_DIR)) {
    return PERSISTENT_DATA_DIR;
  }
  return LEGACY_LOCAL_DATA_DIR;
}

const DATA_DIR = resolveDataDir();
const DB_PATH = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const LEGACY_DB_PATH = path.join(LEGACY_LOCAL_DATA_DIR, "db.json");
const DB_BACKUP_KEEP = Number(process.env.DB_BACKUP_KEEP || 30);
const nowIso = () => new Date().toISOString();
const EMPATHY_PASS_QUESTIONS_COUNT = 10;
const EMPATHY_ANSWER_MIN = 0;
const EMPATHY_ANSWER_MAX = 4;
const EMPATHY_EVENT_ID = "pair-empathy-quest";

function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("db-") && name.endsWith(".json"))
    .sort();
}

function getLatestBackupPath() {
  const files = listBackupFiles();
  if (!files.length) {
    return null;
  }
  return path.join(BACKUP_DIR, files[files.length - 1]);
}

function restoreDbFromLatestBackup(reason = "unknown") {
  const latestBackup = getLatestBackupPath();
  if (!latestBackup) {
    return false;
  }
  try {
    fs.copyFileSync(latestBackup, DB_PATH);
    console.warn(`[softale-backend] db restored from backup (${reason}): ${latestBackup}`);
    return true;
  } catch (error) {
    console.error("[softale-backend] failed to restore db from backup", error);
    return false;
  }
}

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    if (DB_PATH !== LEGACY_DB_PATH && fs.existsSync(LEGACY_DB_PATH)) {
      try {
        fs.copyFileSync(LEGACY_DB_PATH, DB_PATH);
        console.warn(`[softale-backend] migrated db from legacy path: ${LEGACY_DB_PATH} -> ${DB_PATH}`);
        return;
      } catch (error) {
        console.error("[softale-backend] failed to migrate legacy db", error);
      }
    }
    const restored = restoreDbFromLatestBackup("db_missing");
    if (restored) {
      return;
    }
    const seed = {
      users: {},
      walletTransactions: [],
      paymentOrders: {},
      paymentEvents: [],
      analyticsEvents: [],
      empathyPairs: {},
      promoCodes: {
        "SOFTALE-START": { energy: 40, expiresAt: "2026-12-31T23:59:59.000Z", maxActivations: 1, activatedBy: [] },
        "RETURN-BOOST": { energy: 80, expiresAt: "2026-09-01T00:00:00.000Z", maxActivations: 1, activatedBy: [] }
      },
      idempotency: {},
      referrals: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2), "utf-8");
  }
}

function backupDbSnapshot(reason = "startup") {
  ensureDb();
  if (!fs.existsSync(DB_PATH)) return;

  const safeReason = String(reason).replace(/[^a-z0-9_-]/gi, "_").slice(0, 24) || "manual";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `db-${stamp}-${safeReason}.json`);
  fs.copyFileSync(DB_PATH, backupFile);

  const files = listBackupFiles();
  const keep = Number.isFinite(DB_BACKUP_KEEP) ? Math.max(5, DB_BACKUP_KEEP) : 30;
  if (files.length > keep) {
    const toDelete = files.slice(0, files.length - keep);
    toDelete.forEach((name) => {
      const filePath = path.join(BACKUP_DIR, name);
      try {
        fs.unlinkSync(filePath);
      } catch {
        // ignore cleanup errors to avoid blocking runtime
      }
    });
  }
}

function readDb() {
  ensureDb();
  let db;
  try {
    db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch (error) {
    console.error("[softale-backend] failed to parse db.json, trying restore from backup", error);
    const restored = restoreDbFromLatestBackup("db_parse_error");
    if (!restored) {
      throw error;
    }
    db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  }
  db.users ??= {};
  db.walletTransactions ??= [];
  db.paymentOrders ??= {};
  db.paymentEvents ??= [];
  db.promoCodes ??= {};
  db.idempotency ??= {};
  db.referrals ??= [];
  db.analyticsEvents ??= [];
  db.empathyPairs ??= {};
  const adminUpserted = ensureDefaultAdmin(db);
  if (adminUpserted) {
    writeDb(db);
  }
  return db;
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function signAuthToken(email, role) {
  return jwt.sign({ email, role }, JWT_SECRET, { expiresIn: "7d" });
}

function safeUser(user) {
  return {
    email: user.email,
    role: user.role,
    displayName: user.profile.displayName,
    profile: user.profile,
    wallet: user.wallet
  };
}

function ensureUserProfile() {
  return {
    displayName: "Герой леса",
    avatarUri: null,
    profileSetupDone: false,
    aboutMe: "Тренирую диалог и границы в сложных разговорах.",
    friendEmails: [],
    xp: 124,
    energy: 120,
    completedCount: 0,
    lastFeedback: "",
    selectedQuestId: "forest-bridge",
    selectedDifficulty: 5,
    selectedStory: "forest",
    activeTab: "map",
    conflictPrimaryStyle: "avoiding",
    conflictSecondaryStyles: ["accommodating"],
    diagnosticCompleted: false,
    selectedCourseId: "boundary-keeper",
    activeProgramMode: "story",
    unlockedEndings: [],
    unlockedAchievements: [],
    practiceStats: { answersCorrect: 0, answersIncorrect: 0, errorByType: {}, wrongTacticByType: {} },
    questRatingStats: {
      forest: { sum: 0, count: 0 },
      romance: { sum: 0, count: 0 },
      slytherin: { sum: 0, count: 0 },
      boss: { sum: 0, count: 0 },
      narcissist: { sum: 0, count: 0 }
    },
    soundEnabled: true,
    claimedDailyEnergyAt: null,
    welcomeEnergyGranted: true,
    grantedPerfectStageIds: [],
    redeemedPromoCodes: [],
    referralInvitesCompleted: 0,
    unlockedPaidStageKeys: [],
    energyTransfersSentToday: 0,
    energyTransfersSentWeek: 0,
    lastEnergyTransferAt: null,
    lastSeenAt: null
  };
}

function ensureWallet() {
  return {
    xp: 124,
    energy: 120,
    level: 1
  };
}

function ensureDefaultAdmin(db) {
  const email = normalizeEmail(DEFAULT_ADMIN_EMAIL);
  if (!email.includes("@")) return false;

  let changed = false;
  const existing = db.users[email];
  if (existing) {
    if (existing.role !== "ADMIN") {
      existing.role = "ADMIN";
      changed = true;
    }
    const expectedHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
    if (existing.passwordHash !== expectedHash) {
      existing.passwordHash = expectedHash;
      changed = true;
    }
    existing.profile ??= ensureUserProfile();
    existing.wallet ??= ensureWallet();
    if (!existing.profile.displayName || existing.profile.displayName === "Герой леса") {
      existing.profile.displayName = "Neolissa";
      existing.profile.profileSetupDone = true;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = nowIso();
    }
    return changed;
  }

  const profile = ensureUserProfile();
  profile.displayName = "Neolissa";
  profile.profileSetupDone = true;
  db.users[email] = {
    email,
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    role: "ADMIN",
    profile,
    wallet: ensureWallet(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  return true;
}

function getUserByToken(req, res, db) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return null;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.users[payload.email];
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return null;
    }
    return user;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }
}

function requireAdmin(req, res, db) {
  const user = getUserByToken(req, res, db);
  if (!user) return null;
  if (user.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return user;
}

function applyWalletDelta(db, user, deltaEnergy, deltaXp, reason, meta = {}) {
  user.wallet.energy = Math.max(0, user.wallet.energy + deltaEnergy);
  user.wallet.xp = Math.max(0, user.wallet.xp + deltaXp);
  user.profile.energy = user.wallet.energy;
  user.profile.xp = user.wallet.xp;
  db.walletTransactions.push({
    id: crypto.randomUUID(),
    at: nowIso(),
    email: user.email,
    deltaEnergy,
    deltaXp,
    reason,
    meta
  });
}

function normalizeAnswers(input) {
  if (!Array.isArray(input) || input.length !== EMPATHY_PASS_QUESTIONS_COUNT) {
    return null;
  }
  const normalized = input.map((value) => Number(value));
  const isValid = normalized.every(
    (value) => Number.isInteger(value) && value >= EMPATHY_ANSWER_MIN && value <= EMPATHY_ANSWER_MAX
  );
  return isValid ? normalized : null;
}

function percentMatch(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) {
    return 0;
  }
  const matches = a.reduce((acc, value, idx) => (value === b[idx] ? acc + 1 : acc), 0);
  return Math.round((matches / a.length) * 100);
}

function resolveEmpathyAchievement(overallEmpathyPercent) {
  if (overallEmpathyPercent >= 85) return "Эмпатический резонанс";
  if (overallEmpathyPercent >= 70) return "Точная настройка";
  if (overallEmpathyPercent >= 50) return "Слышим друг друга";
  if (overallEmpathyPercent >= 30) return "Разговор в сборке";
  return "Пока мимо волны";
}

function buildEmpathyPairView(pair, currentEmail) {
  const memberA = pair.members[0];
  const memberB = pair.members[1];
  const counterpartEmail = currentEmail === memberA ? memberB : memberA;
  const me = pair.passes[currentEmail] ?? {};
  const counterpart = pair.passes[counterpartEmail] ?? {};
  return {
    id: pair.id,
    eventId: pair.eventId,
    members: pair.members,
    counterpartEmail,
    createdBy: pair.createdBy,
    createdAt: pair.createdAt,
    updatedAt: pair.updatedAt,
    completedAt: pair.completedAt ?? null,
    report: pair.report ?? null,
    me: {
      selfActualDone: Array.isArray(me.self_actual),
      friendPredictionDone: Array.isArray(me.friend_predicted_by_me),
      selfActualAnswers: Array.isArray(me.self_actual) ? me.self_actual : null,
      friendPredictionAnswers: Array.isArray(me.friend_predicted_by_me) ? me.friend_predicted_by_me : null,
    },
    counterpart: {
      selfActualDone: Array.isArray(counterpart.self_actual),
      friendPredictionDone: Array.isArray(counterpart.friend_predicted_by_me),
    },
  };
}

function refreshEmpathyPairReport(pair) {
  const memberA = pair.members[0];
  const memberB = pair.members[1];
  const passesA = pair.passes[memberA] ?? {};
  const passesB = pair.passes[memberB] ?? {};
  if (
    !Array.isArray(passesA.self_actual) ||
    !Array.isArray(passesA.friend_predicted_by_me) ||
    !Array.isArray(passesB.self_actual) ||
    !Array.isArray(passesB.friend_predicted_by_me)
  ) {
    pair.report = null;
    pair.completedAt = null;
    return false;
  }

  const memberAEmpathyPercent = percentMatch(passesA.friend_predicted_by_me, passesB.self_actual);
  const memberBEmpathyPercent = percentMatch(passesB.friend_predicted_by_me, passesA.self_actual);
  const answersOverlapPercent = percentMatch(passesA.self_actual, passesB.self_actual);
  const overallEmpathyPercent = Math.round((memberAEmpathyPercent + memberBEmpathyPercent) / 2);
  const achievement = resolveEmpathyAchievement(overallEmpathyPercent);
  pair.report = {
    answersOverlapPercent,
    overallEmpathyPercent,
    achievement,
    perMember: {
      [memberA]: { empathyPercent: memberAEmpathyPercent },
      [memberB]: { empathyPercent: memberBEmpathyPercent },
    },
  };
  pair.completedAt = nowIso();
  return true;
}

function idempotentGuard(req, db) {
  const key = req.headers["x-idempotency-key"];
  if (!key) {
    return null;
  }
  const normalized = String(key);
  if (db.idempotency[normalized]) {
    return db.idempotency[normalized];
  }
  return { __pendingKey: normalized };
}

function storeIdempotent(db, token, responseData) {
  if (token && token.__pendingKey) {
    db.idempotency[token.__pendingKey] = responseData;
  }
}

const app = express();
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(UPLOADS_DIR, { maxAge: "7d" }));

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: nowIso(), dataDir: DATA_DIR, dbPath: DB_PATH });
});

app.post("/v1/auth/register", (req, res) => {
  const db = readDb();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const displayName = String(req.body.displayName || "").trim();

  if (!email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password is too short" });
  }
  if (db.users[email]) {
    return res.status(409).json({ error: "User already exists" });
  }

  const profile = ensureUserProfile();
  if (displayName) {
    profile.displayName = displayName.slice(0, 60);
    profile.profileSetupDone = true;
  }
  const user = {
    email,
    passwordHash: hashPassword(password),
    role: "USER",
    profile,
    wallet: ensureWallet(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.users[email] = user;
  writeDb(db);

  const token = signAuthToken(email, user.role);
  return res.status(201).json({
    token,
    user: safeUser(user),
    economy: user.wallet
  });
});

app.post("/v1/auth/login", (req, res) => {
  const db = readDb();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const user = db.users[email];
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  if (user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Invalid password" });
  }
  user.updatedAt = nowIso();
  writeDb(db);
  const token = signAuthToken(email, user.role);
  return res.json({
    token,
    user: safeUser(user),
    economy: user.wallet
  });
});

app.get("/v1/auth/me", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  return res.json({
    user: safeUser(user),
    economy: user.wallet
  });
});

app.post("/v1/economy/profile/sync", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const incoming = req.body.profile;
  if (!incoming || typeof incoming !== "object") {
    return res.status(400).json({ error: "Invalid profile payload" });
  }
  const incomingXp = Number(incoming.xp);
  const incomingEnergy = Number(incoming.energy);
  if (Number.isFinite(incomingXp) && incomingXp >= 0) {
    user.wallet.xp = Math.round(incomingXp);
  }
  if (Number.isFinite(incomingEnergy) && incomingEnergy >= 0) {
    user.wallet.energy = Math.round(incomingEnergy);
  }

  user.profile = {
    ...user.profile,
    ...incoming,
    xp: user.wallet.xp,
    energy: user.wallet.energy
  };
  user.updatedAt = nowIso();
  writeDb(db);
  return res.json({ user: safeUser(user) });
});

app.post("/v1/profile/avatar", uploadAvatar.single("avatar"), (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  if (!req.file) {
    return res.status(400).json({ error: "Avatar file is required" });
  }
  if (!req.file.mimetype.startsWith("image/")) {
    return res.status(400).json({ error: "Only image uploads are allowed" });
  }

  const extensionByMime = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  const ext = extensionByMime[req.file.mimetype] || ".jpg";
  const safeEmail = user.email.replace(/[^a-z0-9._-]/gi, "_");
  const fileName = `avatar-${safeEmail}-${Date.now()}${ext}`;
  const targetPath = path.join(UPLOADS_DIR, fileName);
  fs.writeFileSync(targetPath, req.file.buffer);

  // Clean previous local avatar file if possible.
  const previousAvatar = typeof user.profile?.avatarUri === "string" ? user.profile.avatarUri : "";
  if (previousAvatar.includes("/uploads/")) {
    const previousName = previousAvatar.split("/uploads/")[1];
    if (previousName) {
      const previousPath = path.join(UPLOADS_DIR, path.basename(previousName));
      if (previousPath !== targetPath && fs.existsSync(previousPath)) {
        try {
          fs.unlinkSync(previousPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  const host = req.get("host");
  const protocol = req.protocol || "https";
  const avatarUri = `${protocol}://${host}/uploads/${fileName}`;
  user.profile.avatarUri = avatarUri;
  user.updatedAt = nowIso();
  writeDb(db);
  return res.status(201).json({ avatarUri });
});

app.post("/v1/analytics/event", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const type = String(req.body.type || "").trim();
  if (!type) {
    return res.status(400).json({ error: "Event type is required" });
  }
  const event = {
    id: crypto.randomUUID(),
    at: nowIso(),
    email: user.email,
    role: user.role,
    type,
    tab: typeof req.body.tab === "string" ? req.body.tab : undefined,
    storyId: typeof req.body.storyId === "string" ? req.body.storyId : undefined,
    courseId: typeof req.body.courseId === "string" ? req.body.courseId : undefined,
    difficulty: Number.isFinite(Number(req.body.difficulty)) ? Number(req.body.difficulty) : undefined,
    stepIndex: Number.isFinite(Number(req.body.stepIndex)) ? Number(req.body.stepIndex) : undefined,
    details: typeof req.body.details === "string" ? req.body.details.slice(0, 500) : undefined
  };
  db.analyticsEvents.push(event);
  if (db.analyticsEvents.length > 10000) {
    db.analyticsEvents = db.analyticsEvents.slice(-10000);
  }
  user.updatedAt = nowIso();
  writeDb(db);
  return res.status(201).json({ ok: true, id: event.id });
});

app.post("/v1/empathy/pairs/invite", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;

  const friendEmail = normalizeEmail(req.body.friendEmail);
  if (!friendEmail || !friendEmail.includes("@")) {
    return res.status(400).json({ error: "Invalid friend email" });
  }
  if (friendEmail === user.email) {
    return res.status(409).json({ error: "Cannot invite yourself" });
  }
  if (!db.users[friendEmail]) {
    return res.status(404).json({ error: "Friend user not found" });
  }

  const existingPair = Object.values(db.empathyPairs).find(
    (pair) =>
      pair &&
      pair.eventId === EMPATHY_EVENT_ID &&
      Array.isArray(pair.members) &&
      pair.members.includes(user.email) &&
      pair.members.includes(friendEmail)
  );
  if (existingPair) {
    return res.status(200).json({ pair: buildEmpathyPairView(existingPair, user.email) });
  }

  const pairId = crypto.randomUUID();
  const nextPair = {
    id: pairId,
    eventId: EMPATHY_EVENT_ID,
    members: [user.email, friendEmail],
    createdBy: user.email,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
    report: null,
    passes: {
      [user.email]: {
        self_actual: null,
        friend_predicted_by_me: null,
      },
      [friendEmail]: {
        self_actual: null,
        friend_predicted_by_me: null,
      },
    },
  };
  db.empathyPairs[pairId] = nextPair;
  writeDb(db);
  return res.status(201).json({ pair: buildEmpathyPairView(nextPair, user.email) });
});

app.get("/v1/empathy/pairs", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;

  const pairs = Object.values(db.empathyPairs)
    .filter((pair) => pair && Array.isArray(pair.members) && pair.members.includes(user.email))
    .sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""))
    .map((pair) => buildEmpathyPairView(pair, user.email));

  return res.json({ pairs });
});

app.post("/v1/empathy/pairs/:pairId/pass", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;

  const pairId = String(req.params.pairId || "");
  const pair = db.empathyPairs[pairId];
  if (!pair || !Array.isArray(pair.members)) {
    return res.status(404).json({ error: "Empathy pair not found" });
  }
  if (!pair.members.includes(user.email)) {
    return res.status(403).json({ error: "You are not a member of this pair" });
  }

  const passType = String(req.body.passType || "");
  if (passType !== "self_actual" && passType !== "friend_predicted_by_me") {
    return res.status(400).json({ error: "Invalid pass type" });
  }
  const answers = normalizeAnswers(req.body.answers);
  if (!answers) {
    return res.status(400).json({
      error: `Answers must be an array of ${EMPATHY_PASS_QUESTIONS_COUNT} integers (${EMPATHY_ANSWER_MIN}-${EMPATHY_ANSWER_MAX})`,
    });
  }

  pair.passes[user.email] ??= { self_actual: null, friend_predicted_by_me: null };
  pair.passes[user.email][passType] = answers;
  pair.updatedAt = nowIso();
  refreshEmpathyPairReport(pair);
  writeDb(db);
  return res.json({ pair: buildEmpathyPairView(pair, user.email) });
});

app.get("/v1/admin/metrics", (req, res) => {
  const db = readDb();
  const admin = requireAdmin(req, res, db);
  if (!admin) return;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const from24h = now - dayMs;
  const from7d = now - 7 * dayMs;
  const from30d = now - 30 * dayMs;

  const events = Array.isArray(db.analyticsEvents) ? db.analyticsEvents : [];
  const users = Object.values(db.users || {});

  const events24h = events.filter((event) => Date.parse(event.at) >= from24h);
  const events7d = events.filter((event) => Date.parse(event.at) >= from7d);
  const events30d = events.filter((event) => Date.parse(event.at) >= from30d);

  const uniqueByWindow = (items) => Array.from(new Set(items.map((event) => event.email))).length;
  const byType24h = (type) => events24h.filter((event) => event.type === type).length;

  const questStarts24h = byType24h("quest_start");
  const questCompletions24h = byType24h("quest_complete");
  const courseStarts24h = byType24h("course_start");
  const courseCompletions24h = byType24h("course_complete");

  const dropOff24h = byType24h("drop_off");
  const stepFail24h = byType24h("step_fail");
  const penalties24h = byType24h("penalty_applied");
  const answerIncorrect24h = byType24h("answer_incorrect");

  const tabViews24h = events24h.filter((event) => event.type === "tab_view");
  const topTabs = Object.entries(
    tabViews24h.reduce((acc, event) => {
      const key = event.tab || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tab, views]) => ({ tab, views }));

  const topErrorTypes = Object.entries(
    events24h.reduce((acc, event) => {
      if (event.type !== "answer_incorrect" || typeof event.details !== "string") return acc;
      const match = event.details.match(/type:([^;]+)/);
      const key = match?.[1]?.trim();
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([errorType, count]) => ({ errorType, count }));

  const registrations24h = users.filter((user) => Date.parse(user.createdAt || "") >= from24h).length;

  const perUser = users
    .map((user) => {
      const userEvents24h = events24h.filter((event) => event.email === user.email);
      return {
        email: user.email,
        role: user.role,
        lastSeenAt: user.updatedAt || user.createdAt || null,
        wallet: {
          xp: user.wallet?.xp ?? 0,
          energy: user.wallet?.energy ?? 0
        },
        events24h: userEvents24h.length,
        sessions24h: userEvents24h.filter((event) => event.type === "session_start").length,
        dropOff24h: userEvents24h.filter((event) => event.type === "drop_off").length,
        questStarts24h: userEvents24h.filter((event) => event.type === "quest_start").length,
        questCompletions24h: userEvents24h.filter((event) => event.type === "quest_complete").length
      };
    })
    .sort((a, b) => Date.parse(b.lastSeenAt || "") - Date.parse(a.lastSeenAt || ""))
    .slice(0, 200);

  const recentCriticalEvents = events
    .filter((event) => ["drop_off", "step_fail", "penalty_applied", "answer_incorrect"].includes(event.type))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 40)
    .map((event) => ({
      at: event.at,
      email: event.email,
      type: event.type,
      details: event.details || ""
    }));

  return res.json({
    generatedAt: nowIso(),
    totals: {
      users: users.length,
      registrations24h,
      sessions24h: byType24h("session_start"),
      logins24h: byType24h("auth_login"),
      activeUsers24h: uniqueByWindow(events24h),
      dau: uniqueByWindow(events24h),
      wau: uniqueByWindow(events7d),
      mau: uniqueByWindow(events30d)
    },
    funnel24h: {
      questStarts: questStarts24h,
      questCompletions: questCompletions24h,
      questCompletionRate: questStarts24h ? Math.round((questCompletions24h / questStarts24h) * 100) : 0,
      courseStarts: courseStarts24h,
      courseCompletions: courseCompletions24h,
      courseCompletionRate: courseStarts24h ? Math.round((courseCompletions24h / courseStarts24h) * 100) : 0
    },
    quality24h: {
      dropOffs: dropOff24h,
      stepFails: stepFail24h,
      penalties: penalties24h,
      answerIncorrect: answerIncorrect24h,
      topErrorTypes
    },
    engagement24h: {
      tabViews: tabViews24h.length,
      topTabs
    },
    recentCriticalEvents,
    perUser
  });
});

app.get("/v1/economy/me", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  return res.json(user.wallet);
});

app.post("/v1/economy/energy/claim-daily", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const idempotent = idempotentGuard(req, db);
  if (idempotent && !idempotent.__pendingKey) {
    return res.json(idempotent);
  }
  const now = Date.now();
  const last = user.profile.claimedDailyEnergyAt ? Date.parse(user.profile.claimedDailyEnergyAt) : 0;
  if (last && now - last < 24 * 60 * 60 * 1000) {
    return res.status(409).json({ error: "Daily reward already claimed" });
  }
  applyWalletDelta(db, user, 30, 0, "daily_claim");
  user.profile.claimedDailyEnergyAt = nowIso();
  user.updatedAt = nowIso();
  const payload = { ...user.wallet };
  storeIdempotent(db, idempotent, payload);
  writeDb(db);
  return res.json(payload);
});

app.post("/v1/economy/promo/redeem", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const code = String(req.body.code || "").trim().toUpperCase();
  const promo = db.promoCodes[code];
  if (!promo) {
    return res.status(404).json({ error: "Promo not found" });
  }
  if (Date.parse(promo.expiresAt) < Date.now()) {
    return res.status(409).json({ error: "Promo expired" });
  }
  if (promo.activatedBy.includes(user.email)) {
    return res.status(409).json({ error: "Promo already redeemed" });
  }
  if (promo.activatedBy.length >= promo.maxActivations) {
    return res.status(409).json({ error: "Promo limit exceeded" });
  }
  promo.activatedBy.push(user.email);
  applyWalletDelta(db, user, promo.energy, 0, "promo_redeem", { code });
  writeDb(db);
  return res.json(user.wallet);
});

app.post("/v1/economy/referrals/validate", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const invitedEmail = normalizeEmail(req.body.invitedEmail);
  if (!invitedEmail || !db.users[invitedEmail]) {
    return res.status(404).json({ error: "Invited user not found" });
  }
  const referralKey = `${user.email}:${invitedEmail}`;
  if (db.referrals.includes(referralKey)) {
    return res.status(409).json({ error: "Referral already validated" });
  }
  db.referrals.push(referralKey);
  applyWalletDelta(db, user, 60, 0, "referral_validated", { invitedEmail });
  writeDb(db);
  return res.json(user.wallet);
});

app.post("/v1/economy/energy/transfer", (req, res) => {
  const db = readDb();
  const sender = getUserByToken(req, res, db);
  if (!sender) return;
  const recipientEmail = normalizeEmail(req.body.recipientEmail);
  const amount = Number(req.body.amount);
  const recipient = db.users[recipientEmail];
  if (!recipient) {
    return res.status(404).json({ error: "Recipient not found" });
  }
  if (!Number.isFinite(amount) || amount < 1) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  if (sender.wallet.energy < amount) {
    return res.status(409).json({ error: "Insufficient energy" });
  }
  applyWalletDelta(db, sender, -amount, 0, "energy_transfer_sent", { recipientEmail });
  applyWalletDelta(db, recipient, amount, 0, "energy_transfer_received", { senderEmail: sender.email });
  writeDb(db);
  return res.json(sender.wallet);
});

app.post("/v1/economy/stage/unlock", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const campaignId = String(req.body.campaignId || "");
  const stageIdx = Number(req.body.stageIdx);
  if (!campaignId || !Number.isFinite(stageIdx)) {
    return res.status(400).json({ error: "Invalid stage payload" });
  }
  const stageCost = 20 + Math.max(0, stageIdx - 2) * 5;
  if (user.wallet.energy < stageCost) {
    return res.status(409).json({ error: "Insufficient energy" });
  }
  applyWalletDelta(db, user, -stageCost, 0, "stage_unlock", { campaignId, stageIdx, stageCost });
  writeDb(db);
  return res.json(user.wallet);
});

app.post("/v1/economy/stage/complete", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const campaignId = String(req.body.campaignId || "");
  const stageIdx = Number(req.body.stageIdx);
  const isPerfect = Boolean(req.body.isPerfect);
  if (!campaignId || !Number.isFinite(stageIdx)) {
    return res.status(400).json({ error: "Invalid stage payload" });
  }
  const xpGain = isPerfect ? 45 : 30;
  const energyGain = isPerfect ? 25 : 10;
  applyWalletDelta(db, user, energyGain, xpGain, "stage_complete", { campaignId, stageIdx, isPerfect });
  writeDb(db);
  return res.json(user.wallet);
});

app.post("/v1/economy/payments/create", (req, res) => {
  const db = readDb();
  const user = getUserByToken(req, res, db);
  if (!user) return;
  const provider = String(req.body.provider || "rustore");
  const amountRub = Number(req.body.amountRub || 0);
  const energyPack = Number(req.body.energyPack || 0);
  if (!Number.isFinite(amountRub) || amountRub <= 0 || !Number.isFinite(energyPack) || energyPack <= 0) {
    return res.status(400).json({ error: "Invalid payment payload" });
  }
  const orderId = crypto.randomUUID();
  db.paymentOrders[orderId] = {
    id: orderId,
    email: user.email,
    provider,
    amountRub,
    energyPack,
    status: "created",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  writeDb(db);
  return res.json({
    orderId,
    provider,
    amountRub,
    energyPack,
    status: "created"
  });
});

function verifyWebhookSignature(req, secret) {
  const signature = req.headers["x-signature"];
  if (!signature) return false;
  const bodyStr = JSON.stringify(req.body || {});
  const expected = crypto.createHmac("sha256", secret).update(bodyStr).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(String(signature)), Buffer.from(expected));
}

function handlePaymentWebhook(req, res, provider, secret) {
  const db = readDb();
  if (!verifyWebhookSignature(req, secret)) {
    return res.status(401).json({ error: "Invalid webhook signature" });
  }
  const orderId = String(req.body.orderId || "");
  const status = String(req.body.status || "");
  const eventId = String(req.body.eventId || crypto.randomUUID());
  const order = db.paymentOrders[orderId];
  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }
  const duplicate = db.paymentEvents.find((it) => it.eventId === eventId);
  if (duplicate) {
    return res.json({ ok: true, duplicate: true });
  }
  db.paymentEvents.push({
    eventId,
    provider,
    orderId,
    status,
    at: nowIso()
  });
  order.status = status;
  order.updatedAt = nowIso();

  if (status === "paid") {
    const user = db.users[order.email];
    if (user) {
      applyWalletDelta(db, user, order.energyPack, 0, "payment_success", {
        provider,
        orderId,
        amountRub: order.amountRub
      });
    }
  }

  writeDb(db);
  return res.json({ ok: true });
}

app.post("/v1/economy/payments/webhook/rustore", (req, res) => {
  handlePaymentWebhook(req, res, "rustore", RUSTORE_WEBHOOK_SECRET);
});

app.post("/v1/economy/payments/webhook/yookassa", (req, res) => {
  handlePaymentWebhook(req, res, "yookassa", YOOKASSA_WEBHOOK_SECRET);
});

app.listen(PORT, () => {
  ensureDb();
  backupDbSnapshot("startup");
  // eslint-disable-next-line no-console
  console.log(`[softale-backend] listening on ${PORT}, backups in ${BACKUP_DIR}`);
});
