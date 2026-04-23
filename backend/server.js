const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const RUSTORE_WEBHOOK_SECRET = process.env.RUSTORE_WEBHOOK_SECRET || "dev-rustore-secret";
const YOOKASSA_WEBHOOK_SECRET = process.env.YOOKASSA_WEBHOOK_SECRET || "dev-yookassa-secret";

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const nowIso = () => new Date().toISOString();

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    const seed = {
      users: {},
      walletTransactions: [],
      paymentOrders: {},
      paymentEvents: [],
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

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
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
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, at: nowIso() });
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
  // eslint-disable-next-line no-console
  console.log(`[softale-backend] listening on ${PORT}`);
});
