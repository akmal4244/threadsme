import { createServer } from "node:http";
import { access, appendFile, copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.env.THREADSME_WORKSPACE_ROOT || here;
const runtimeRoot = process.env.THREADSME_RUNTIME_DIR || path.join(workspaceRoot, "work", "runtime");
const defaultKeyFile = path.join(workspaceRoot, "work", "private", "deepseek.key");
const keyFile = process.env.DEEPSEEK_API_KEY_FILE || defaultKeyFile;
const defaultShopeeCookieFile = path.join(workspaceRoot, "work", "private", "shopee-cookie.txt");
const shopeeCookieFile = process.env.SHOPEE_COOKIE_FILE || defaultShopeeCookieFile;
const legacyStoryRunsFile = path.join(here, "story-runs.json");
const legacyScheduleFile = path.join(here, "threads_flexi_marble_schedule.json");
const legacyStatusFile = path.join(here, "status.json");
const legacyPublishLogFile = path.join(here, "publish-log.json");
const scheduleFile = process.env.THREADSME_SCHEDULE_FILE || path.join(runtimeRoot, "threads-schedule.json");
const storyRunsFile = process.env.THREADSME_STORY_RUNS_FILE || path.join(runtimeRoot, "story-runs.json");
const statusFile = process.env.THREADSME_STATUS_FILE || path.join(runtimeRoot, "status.json");
const publishLogFile = process.env.THREADSME_PUBLISH_LOG_FILE || path.join(runtimeRoot, "publish-log.json");
const productIntelCacheFile = process.env.THREADSME_PRODUCT_INTEL_CACHE_FILE || path.join(runtimeRoot, "product-intel-cache.json");
const backupRoot = process.env.THREADSME_BACKUP_DIR || path.join(workspaceRoot, "work", "backups");
const logRoot = process.env.THREADSME_LOG_DIR || path.join(runtimeRoot, "logs");
const threadsConfigFile = path.join(workspaceRoot, "work", "private", "threads-config.json");
const threadsTokenFile = path.join(workspaceRoot, "work", "private", "threads-access-token.txt");
const extensionBridgeFile = path.join(workspaceRoot, "work", "private", "extension-bridge.json");
const adminAuthFile = path.join(workspaceRoot, "work", "private", "admin-auth.json");
const adminSessionFile = path.join(workspaceRoot, "work", "private", "admin-sessions.json");
const port = Number(process.env.THREADSME_AI_PORT || process.argv[2] || 8788);
const host = "127.0.0.1";
const deepseekUrl = "https://api.deepseek.com/chat/completions";
const threadsGraphUrl = "https://graph.threads.net/v1.0";
const threadsScheduleLimit = 25;
const threadsApiDailyPublishLimit = 250;
const maxPostingPerDay = 25;
const threadPostMaxChars = 300;
const threadPostTargetMinChars = 250;
const threadPostTargetMaxChars = 295;
const publisherPreflightEnabled = process.env.THREADSME_PUBLISH_PREFLIGHT !== "false";
const publisherPreflightAiEnabled = process.env.THREADSME_PUBLISH_PREFLIGHT_AI !== "false";
const publisherPreflightMinScore = Math.max(70, Math.min(Number(process.env.THREADSME_PUBLISH_PREFLIGHT_MIN_SCORE || 82), 95));
const autoProductResolveLimit = Math.max(1, Math.min(Number(process.env.THREADSME_AUTO_RESOLVE_LIMIT || 8), 25));
const autoProductMinimumConfidence = Math.max(40, Math.min(Number(process.env.THREADSME_AUTO_RESOLVE_CONFIDENCE || 62), 95));
const autoQualityRegenerateLimit = Math.max(0, Math.min(Number(process.env.THREADSME_AUTO_REGENERATE_LIMIT || 25), 25));
const authRequired = process.env.THREADSME_AUTH_REQUIRED === "true";
const productIntelCacheTtlMs = Math.max(1, Number(process.env.THREADSME_PRODUCT_INTEL_CACHE_DAYS || 14)) * 24 * 60 * 60 * 1000;
const productIntelCacheMaxEntries = Math.max(50, Math.min(Number(process.env.THREADSME_PRODUCT_INTEL_CACHE_MAX || 250), 1000));
const logMaxBytes = Math.max(64 * 1024, Math.min(Number(process.env.THREADSME_LOG_MAX_BYTES || 1_048_576), 20 * 1024 * 1024));
const logBackups = Math.max(1, Math.min(Number(process.env.THREADSME_LOG_BACKUPS || 5), 20));
const allowedOrigins = new Set(
  String(
    process.env.THREADSME_ALLOWED_ORIGINS ||
      "http://localhost,http://localhost:80,http://127.0.0.1,http://127.0.0.1:80,http://localhost:8791,http://127.0.0.1:8791",
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const adminSessionTtlMs = Math.max(15, Number(process.env.THREADSME_SESSION_HOURS || 24)) * 60 * 60 * 1000;
const postingTimePresets = {
  1: ["10:00"],
  3: ["09:30", "12:30", "20:30"],
  5: ["08:45", "10:30", "12:15", "17:45", "20:30"],
  7: ["08:15", "09:45", "11:15", "13:00", "15:15", "17:45", "20:30"],
  20: [
    "07:30",
    "08:10",
    "08:50",
    "09:30",
    "10:10",
    "10:50",
    "11:30",
    "12:10",
    "12:50",
    "13:30",
    "14:20",
    "15:10",
    "16:00",
    "16:50",
    "17:40",
    "18:30",
    "19:20",
    "20:10",
    "21:15",
    "22:30",
  ],
  25: [
    "07:00",
    "07:40",
    "08:20",
    "09:00",
    "09:40",
    "10:20",
    "11:00",
    "11:40",
    "12:20",
    "13:00",
    "13:40",
    "14:20",
    "15:00",
    "15:40",
    "16:20",
    "17:00",
    "17:40",
    "18:20",
    "19:00",
    "19:40",
    "20:20",
    "21:00",
    "21:40",
    "22:20",
    "23:00",
  ],
};

async function getApiKey() {
  const fromEnv = process.env.DEEPSEEK_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return (await readFile(keyFile, "utf8")).trim();
}

async function getShopeeCookie() {
  const fromEnv = process.env.SHOPEE_COOKIE;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    return (await readFile(shopeeCookieFile, "utf8")).trim();
  } catch {
    return "";
  }
}

function malaysiaNow() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date())
    .replace(",", "");
}

function defaultThreadsConfig() {
  return {
    enabled: false,
    dryRun: true,
    threadsUserId: "",
    tokenFile: threadsTokenFile,
    replyMode: "chain",
    publishDelaySeconds: 30,
    maxDuePerSync: 1,
  };
}

async function readThreadsConfig() {
  const saved = await readJsonFile(threadsConfigFile, {});
  const config = { ...defaultThreadsConfig(), ...(saved || {}) };
  config.enabled = Boolean(config.enabled);
  config.dryRun = config.dryRun !== false;
  config.threadsUserId = String(config.threadsUserId || "").trim();
  config.tokenFile = String(config.tokenFile || threadsTokenFile);
  config.replyMode = config.replyMode === "root" ? "root" : "chain";
  config.publishDelaySeconds = Math.max(0, Math.min(Number(config.publishDelaySeconds || 30), 60));
  config.maxDuePerSync = Math.max(1, Math.min(Number(config.maxDuePerSync || 1), maxPostingPerDay));
  return config;
}

async function writeThreadsConfig(config) {
  const safeConfig = {
    ...defaultThreadsConfig(),
    ...config,
    tokenFile: threadsTokenFile,
  };
  await writeJsonFile(threadsConfigFile, safeConfig);
  return safeConfig;
}

async function getThreadsAccessToken(config) {
  const fromEnv = process.env.THREADS_ACCESS_TOKEN;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const file = config?.tokenFile || threadsTokenFile;
  return (await readFile(file, "utf8")).replace(/^\uFEFF/, "").trim();
}

async function hasThreadsToken(config) {
  try {
    return Boolean(await getThreadsAccessToken(config));
  } catch {
    return false;
  }
}

function sanitizeThreadsConfig(config, hasToken) {
  return {
    enabled: Boolean(config.enabled),
    dryRun: config.dryRun !== false,
    threadsUserId: config.threadsUserId || "",
    hasToken: Boolean(hasToken),
    replyMode: config.replyMode || "chain",
    publishDelaySeconds: config.publishDelaySeconds,
    maxDuePerSync: config.maxDuePerSync,
    liveReady: Boolean(config.enabled && config.dryRun === false && config.threadsUserId && hasToken),
  };
}

function defaultExtensionBridgeConfig() {
  return {
    enabled: true,
    autopilot: false,
    targetScheduledCount: threadsScheduleLimit,
    token: randomBytes(24).toString("hex"),
    bridgeUrl: `http://${host}:${port}`,
    lastSyncAt: "",
    lastAccount: "",
    threadsConnected: false,
    lastNativeScheduledCount: 0,
    nativeScheduledNumbers: [],
    lastError: "",
    lastProofs: [],
  };
}

async function readExtensionBridgeConfig() {
  const saved = await readJsonFile(extensionBridgeFile, {});
  const config = { ...defaultExtensionBridgeConfig(), ...(saved || {}) };
  let changed = !saved || typeof saved !== "object" || !saved.token;
  if (!/^[a-f0-9]{32,}$/i.test(String(config.token || ""))) {
    config.token = randomBytes(24).toString("hex");
    changed = true;
  }
  config.enabled = config.enabled !== false;
  config.autopilot = Boolean(config.autopilot);
  config.targetScheduledCount = Math.max(1, Math.min(Number(config.targetScheduledCount || threadsScheduleLimit), threadsScheduleLimit));
  config.bridgeUrl = `http://${host}:${port}`;
  config.lastNativeScheduledCount = Math.max(0, Number(config.lastNativeScheduledCount || 0));
  config.threadsConnected = Boolean(config.threadsConnected);
  config.nativeScheduledNumbers = uniqueSortedNumbers(config.nativeScheduledNumbers);
  config.lastProofs = Array.isArray(config.lastProofs) ? config.lastProofs.slice(-50) : [];
  if (changed) await writeJsonFile(extensionBridgeFile, config);
  return config;
}

async function writeExtensionBridgeConfig(config) {
  const current = await readExtensionBridgeConfig();
  const next = {
    ...current,
    ...config,
    bridgeUrl: `http://${host}:${port}`,
    targetScheduledCount: Math.max(1, Math.min(Number(config.targetScheduledCount || current.targetScheduledCount || threadsScheduleLimit), threadsScheduleLimit)),
    nativeScheduledNumbers: uniqueSortedNumbers(config.nativeScheduledNumbers || current.nativeScheduledNumbers),
    lastProofs: Array.isArray(config.lastProofs) ? config.lastProofs.slice(-50) : current.lastProofs,
  };
  await writeJsonFile(extensionBridgeFile, next);
  return next;
}

function sanitizeExtensionBridgeConfig(config, { includeToken = false } = {}) {
  return {
    enabled: Boolean(config.enabled),
    autopilot: Boolean(config.autopilot),
    targetScheduledCount: config.targetScheduledCount || threadsScheduleLimit,
    bridgeUrl: config.bridgeUrl || `http://${host}:${port}`,
    token: includeToken ? config.token : undefined,
    tokenPreview: config.token ? `${String(config.token).slice(0, 6)}...${String(config.token).slice(-4)}` : "",
    lastSyncAt: config.lastSyncAt || "",
    lastAccount: config.lastAccount || "",
    threadsConnected: Boolean(config.threadsConnected),
    lastNativeScheduledCount: Number(config.lastNativeScheduledCount || 0),
    nativeScheduledNumbers: uniqueSortedNumbers(config.nativeScheduledNumbers),
    lastError: config.lastError || "",
    lastProofs: Array.isArray(config.lastProofs) ? config.lastProofs.slice(-10) : [],
  };
}

class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message);
    this.status = status;
    this.expose = options.expose !== false;
  }
}

function badRequest(message) {
  throw new HttpError(400, message);
}

function unauthorized(message = "Sesi admin diperlukan.") {
  throw new HttpError(401, message);
}

function forbidden(message = "Akses tidak dibenarkan.") {
  throw new HttpError(403, message);
}

function parseCookies(req) {
  const header = String(req.headers.cookie || "");
  const cookies = {};
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    cookies[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue.join("=") || "");
  }
  return cookies;
}

function hashPassword(password, salt) {
  return pbkdf2Sync(String(password), salt, 120_000, 32, "sha256").toString("hex");
}

function safeCompareHex(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function safeCompareString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

function normalizeAdminUsername(username) {
  return String(username || "").trim().slice(0, 80);
}

async function readAdminAuth() {
  const envPassword = String(process.env.THREADSME_ADMIN_PASSWORD || "").trim();
  if (envPassword) {
    return {
      source: "env",
      hasPassword: true,
      username: normalizeAdminUsername(process.env.THREADSME_ADMIN_USERNAME || ""),
    };
  }
  const data = await readJsonFile(adminAuthFile, null);
  return data?.passwordHash && data?.salt ? { source: "file", ...data, hasPassword: true } : { source: "none", hasPassword: false };
}

async function setupAdminPassword(password, username = "") {
  const clean = String(password || "");
  const cleanUsername = normalizeAdminUsername(username);
  if (clean.length < 10) badRequest("Kata laluan admin mesti sekurang-kurangnya 10 aksara.");
  const current = await readAdminAuth();
  if (current.hasPassword) throw new HttpError(409, "Admin password sudah diset. Guna login atau reset fail private jika perlu.");
  const salt = randomBytes(16).toString("hex");
  const payload = {
    version: 1,
    username: cleanUsername,
    salt,
    passwordHash: hashPassword(clean, salt),
    createdAt: `${malaysiaNow()} GMT+8`,
  };
  await mkdir(path.dirname(adminAuthFile), { recursive: true });
  await writeJsonFile(adminAuthFile, payload);
  return payload;
}

async function verifyAdminPassword(password, username = "") {
  const auth = await readAdminAuth();
  if (!auth.hasPassword) badRequest("Admin password belum diset.");
  const clean = String(password || "");
  const expectedUsername = normalizeAdminUsername(auth.username);
  if (expectedUsername && normalizeAdminUsername(username).toLowerCase() !== expectedUsername.toLowerCase()) {
    return false;
  }
  if (auth.source === "env") {
    const expectedHash = hashPassword(String(process.env.THREADSME_ADMIN_PASSWORD || ""), "threadsme-env-password");
    const actualHash = hashPassword(clean, "threadsme-env-password");
    return safeCompareHex(actualHash, expectedHash);
  }
  return safeCompareHex(hashPassword(clean, auth.salt), auth.passwordHash);
}

async function readAdminSessions() {
  const data = await readJsonFile(adminSessionFile, { sessions: [] });
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  const now = Date.now();
  return sessions.filter((session) => Number(session.expiresAt || 0) > now);
}

async function writeAdminSessions(sessions) {
  await mkdir(path.dirname(adminSessionFile), { recursive: true });
  await writeJsonFile(adminSessionFile, { sessions });
}

async function createAdminSession() {
  const sessions = await readAdminSessions();
  const session = {
    token: randomBytes(32).toString("hex"),
    csrfToken: randomBytes(24).toString("hex"),
    createdAt: Date.now(),
    expiresAt: Date.now() + adminSessionTtlMs,
  };
  sessions.push(session);
  await writeAdminSessions(sessions.slice(-20));
  return session;
}

async function getAdminSession(req) {
  if (!authRequired) return { authenticated: true, csrfToken: "" };
  const token = parseCookies(req).tm_session;
  if (!token) return null;
  const sessions = await readAdminSessions();
  const session = sessions.find((item) => item.token === token);
  return session || null;
}

async function destroyAdminSession(req) {
  const token = parseCookies(req).tm_session;
  if (!token) return;
  const sessions = await readAdminSessions();
  await writeAdminSessions(sessions.filter((session) => session.token !== token));
}

function authCookie(session) {
  const maxAge = Math.floor(adminSessionTtlMs / 1000);
  return `tm_session=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

function expiredAuthCookie() {
  return "tm_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

function applyCors(req, res, pathname = "") {
  const origin = req.headers.origin;
  if (!origin) return true;
  const extensionOriginAllowed =
    pathname.startsWith("/api/extension/") &&
    pathname !== "/api/extension/pairing" &&
    /^chrome-extension:\/\/[a-z]{32}$/i.test(origin);
  if (!allowedOrigins.has(origin) && !extensionOriginAllowed) return false;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "authorization,content-type,x-threadsme-csrf,x-threadsme-extension-token");
  res.setHeader("vary", "Origin");
  return true;
}

function isPublicRoute(method, pathname) {
  if (method === "OPTIONS") return true;
  if (method === "GET" && pathname === "/api/health") return true;
  if (method === "GET" && pathname === "/api/auth/status") return true;
  if (method === "POST" && ["/api/auth/login", "/api/auth/setup", "/api/auth/logout"].includes(pathname)) return true;
  if (pathname.startsWith("/api/extension/") && pathname !== "/api/extension/pairing") return true;
  return false;
}

async function requireAdmin(req, pathname) {
  if (!authRequired || isPublicRoute(req.method, pathname)) return { authenticated: true, csrfToken: "" };
  const session = await getAdminSession(req);
  if (!session) unauthorized();
  if (req.method !== "GET") {
    const csrf = String(req.headers["x-threadsme-csrf"] || "");
    if (!csrf || csrf !== session.csrfToken) forbidden("CSRF token tidak sah. Sila login semula.");
  }
  return session;
}

async function getAuthStatus(req) {
  const auth = await readAdminAuth();
  const session = await getAdminSession(req);
  return {
    authRequired,
    hasPassword: Boolean(auth.hasPassword),
    setupRequired: authRequired && !auth.hasPassword,
    authenticated: !authRequired || Boolean(session),
    csrfToken: session?.csrfToken || "",
    source: auth.source,
    sessionExpiresAt: session?.expiresAt || null,
  };
}

async function handleAuthSetup(input) {
  await setupAdminPassword(input.password, input.username);
  const session = await createAdminSession();
  return { session, status: await getAuthStatus({ headers: { cookie: `tm_session=${session.token}` } }) };
}

async function handleAuthLogin(input) {
  const valid = await verifyAdminPassword(input.password, input.username);
  if (!valid) unauthorized("Username atau kata laluan admin tidak sah.");
  const session = await createAdminSession();
  return { session, status: await getAuthStatus({ headers: { cookie: `tm_session=${session.token}` } }) };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readStoryRuns() {
  try {
    const raw = (await readFile(storyRunsFile, "utf8")).replace(/^\uFEFF/, "");
    const data = JSON.parse(raw);
    return Array.isArray(data.runs) ? data.runs : [];
  } catch {
    return [];
  }
}

async function writeStoryRuns(runs) {
  await writeJsonFile(storyRunsFile, { runs });
}

async function syncStoryRunsWithStatus(statusData, scheduleData = null) {
  const runs = await readStoryRuns();
  if (!runs.length) return runs;

  const schedule = scheduleData || await readJsonFile(scheduleFile, { posts: [] });
  const posts = Array.isArray(schedule.posts) ? schedule.posts : [];
  const scheduledSet = new Set(statusData.scheduled || []);
  const postedSet = new Set(statusData.posted || []);
  const failedSet = new Set(statusData.failed || []);
  const preparedSet = new Set(statusData.prepared || []);
  const remainingSet = new Set(statusData.remaining || []);
  let changed = false;

  for (const run of runs) {
    for (const version of run.versions || []) {
      const number = Number(version.scheduleNumber);
      if (!number) continue;
      const post = posts[number - 1];
      if (post?.slot && version.slot !== post.slot) {
        version.slot = post.slot;
        version.updatedAt = `${malaysiaNow()} GMT+8`;
        changed = true;
      }
      if (post?.postsPerDay && run.postsPerDay !== post.postsPerDay) {
        run.postsPerDay = post.postsPerDay;
        changed = true;
      }
      let nextStatus = version.status || "pending";
      if (post?.qualityStatus === "review") nextStatus = "review";
      else if (failedSet.has(number)) nextStatus = "failed";
      else if (postedSet.has(number)) nextStatus = "passed";
      else if (scheduledSet.has(number)) nextStatus = "pending";
      else if (remainingSet.has(number) || preparedSet.has(number)) nextStatus = "blocked";
      if (version.status !== nextStatus) {
        version.status = nextStatus;
        version.updatedAt = `${malaysiaNow()} GMT+8`;
        changed = true;
      }
    }
  }

  if (changed) await writeStoryRuns(runs);
  return runs;
}

async function readJsonFile(file, fallback) {
  try {
    const raw = (await readFile(file, "utf8")).replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temp, file);
}

function safeLogValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
      .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[redacted]")
      .slice(0, 1200);
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(safeLogValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (/token|secret|password|cookie|key/i.test(key)) return [key, "[redacted]"];
        return [key, safeLogValue(item)];
      }),
    );
  }
  return value;
}

async function rotateLogFile(file) {
  try {
    const info = await stat(file);
    if (info.size < logMaxBytes) return;
  } catch {
    return;
  }

  for (let index = logBackups; index >= 1; index -= 1) {
    const current = `${file}.${index}`;
    const next = `${file}.${index + 1}`;
    if (index === logBackups) {
      await unlink(current).catch(() => null);
      continue;
    }
    try {
      await rename(current, next);
    } catch {
      // Older rotation file may not exist.
    }
  }
  await rename(file, `${file}.1`).catch(() => null);
}

async function appendRuntimeLog(fileName, entry) {
  const safeName = String(fileName || "api.log").replace(/[^a-z0-9_.-]/gi, "_");
  const file = path.join(logRoot, safeName);
  const payload = {
    ts: new Date().toISOString(),
    malaysiaTime: `${malaysiaNow()} GMT+8`,
    ...safeLogValue(entry),
  };
  try {
    await mkdir(logRoot, { recursive: true });
    await rotateLogFile(file);
    await appendFile(file, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error(`[ThreadsMe log] ${error.message}`);
  }
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntimeFile(runtimeFile, legacyFile, fallback) {
  if (await fileExists(runtimeFile)) return;
  await mkdir(path.dirname(runtimeFile), { recursive: true });
  if (await fileExists(legacyFile)) {
    await copyFile(legacyFile, runtimeFile);
    return;
  }
  await writeJsonFile(runtimeFile, fallback);
}

async function ensureRuntimeFiles() {
  await ensureRuntimeFile(scheduleFile, legacyScheduleFile, {
    timezone: "Asia/Kuala_Lumpur",
    affiliate_link: "https://s.shopee.com.my/7VDqSOoKf3",
    notes: "Runtime schedule ThreadsMe baru diwujudkan.",
    posts: [],
  });
  await ensureRuntimeFile(statusFile, legacyStatusFile, {
    systemStatus: "Automasi aktif",
    systemNote: "Runtime status ThreadsMe baru diwujudkan.",
    scheduled: [],
    posted: [],
    failed: [],
    prepared: [],
    remaining: [],
    automationMode: true,
    automationLimit: threadsScheduleLimit,
  });
  await ensureRuntimeFile(storyRunsFile, legacyStoryRunsFile, { runs: [] });
  await ensureRuntimeFile(publishLogFile, legacyPublishLogFile, { entries: [] });
  await ensureRuntimeFile(productIntelCacheFile, path.join(here, "product-intel-cache.json"), { entries: [] });
  await repairEmptyRuntimeSchedule();
  await repairRuntimeScheduleMetadataFromStoryRuns();
  await repairProductIntelCacheFromStoryRuns();
}

function countStatusNumbers(statusData = {}) {
  return ["scheduled", "posted", "failed", "prepared", "remaining"].reduce(
    (total, key) => total + uniqueSortedNumbers(statusData[key]).length,
    0,
  );
}

function normalizeRecoveredProductKey(value) {
  return cleanTitleCandidate(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericRecoveredTitle(value) {
  const key = normalizeRecoveredProductKey(value);
  return Boolean(
    key === "organizer rumah" ||
      key === "lampu led hiasan" ||
      key === "dekorasi dinding hiasan rumah diy" ||
      key === "hiasan rumah diy" ||
      key === "produk rumah" ||
      key === "barang kecil" ||
      key === "room divider lipat",
  );
}

function chooseRecoveredCategory(title, category, fallbackText = "") {
  const cleanTitle = cleanTitleCandidate(title);
  const cleanCategory = cleanTitleCandidate(category);
  if (cleanCategory && normalizeRecoveredProductKey(cleanCategory) !== normalizeRecoveredProductKey(cleanTitle)) {
    return cleanCategory;
  }
  return inferProductCategoryFromText([cleanTitle, fallbackText].filter(Boolean).join(" "));
}

function createRecoveredProduct(title, category, source, confidence, fallbackText = "") {
  const productTitle = cleanTitleCandidate(title);
  if (!isUsefulProductTitle(productTitle)) return null;
  if (source !== "story_run_recovered" && looksLikeStorySentence(productTitle)) return null;
  return {
    title: productTitle,
    category: chooseRecoveredCategory(productTitle, category, fallbackText),
    source,
    confidence,
    authoritative: source === "story_run_recovered",
  };
}

function buildRunProductCandidate(run = {}, version = {}) {
  const runCandidate = createRecoveredProduct(
    run.productTitle || "",
    run.productCategory || version.productCategory || "",
    "story_run_recovered",
    98,
    [run.productName, run.affiliateLink].filter(Boolean).join(" "),
  );
  const versionCandidate = createRecoveredProduct(
    version.productTitle || "",
    version.productCategory || run.productCategory || "",
    "story_run_recovered",
    96,
    [run.productName, run.affiliateLink].filter(Boolean).join(" "),
  );
  if (!runCandidate) return versionCandidate || null;
  if (!versionCandidate) return runCandidate;
  if (normalizeRecoveredProductKey(runCandidate.title) === normalizeRecoveredProductKey(versionCandidate.title)) return runCandidate;
  return runCandidate;
}

function buildAffiliateProductMap(runs) {
  const map = new Map();
  for (const run of runs) {
    const affiliate = String(run.affiliateLink || "").trim();
    if (!affiliate) continue;
    const candidate = buildRunProductCandidate(run, {});
    if (candidate) {
      map.set(affiliate, candidate);
      continue;
    }
    for (const version of run.versions || []) {
      const versionCandidate = buildRunProductCandidate(run, version);
      if (versionCandidate) {
        map.set(affiliate, versionCandidate);
        break;
      }
    }
  }
  return map;
}

function buildInferredProductCandidate(post = {}, run = {}, version = {}) {
  const context = [
    run.productName,
    run.affiliateLink,
    post.affiliateLink,
    post.imageUrl,
    post.imageName,
    version.productCategory,
    run.productCategory,
    post.productCategory,
    post.main,
    post.reply1,
    post.reply2,
  ]
    .filter(Boolean)
    .join(" ");
  const inferred = inferStoryProductCandidate(context);
  if (inferred) {
    return createRecoveredProduct(inferred.title, inferred.category, "story_inferred", 88, context);
  }
  const fileTitle = cleanTitleCandidate(String(run.productName || post.imageName || "").replace(/\.(?:webp|png|jpe?g)$/i, "").replace(/[-_]+/g, " "));
  return createRecoveredProduct(fileTitle, "", "product_name_recovered", 78, context);
}

function knownAffiliateRecoveredProduct(affiliateLink) {
  const affiliate = String(affiliateLink || "");
  if (/5q5mTxqz8i/i.test(affiliate)) {
    return createRecoveredProduct(
      "DESSINI Italy Pressure Cooker",
      "periuk tekanan, memasak cepat, dapur keluarga",
      "affiliate_known_map",
      99,
      affiliate,
    );
  }
  return null;
}

function resolveRecoveredProduct({ post, run, version, affiliateProductMap, scheduleData }) {
  const affiliate = String(post.affiliateLink || version.affiliateLink || run.affiliateLink || scheduleData.affiliate_link || "").trim();
  return (
    knownAffiliateRecoveredProduct(affiliate) ||
    buildRunProductCandidate(run, version) ||
    (affiliate ? affiliateProductMap.get(affiliate) : null) ||
    buildInferredProductCandidate(post, run, version)
  );
}

function shouldApplyRecoveredProduct(post, recovered) {
  if (!recovered?.title) return false;
  const current = cleanTitleCandidate(post.productTitle || "");
  if (!current) return true;
  if (normalizeRecoveredProductKey(current) === normalizeRecoveredProductKey(recovered.title)) return false;
  const evidence = String(post.productIntelEvidence || "").toLowerCase();
  if (evidence === "manual_verified" || evidence === "link_verified" || post.manualProductOverride) return false;
  if (recovered.authoritative) return true;
  return isGenericRecoveredTitle(current) && recovered.confidence >= 85;
}

function applyRecoveredProductToPost(post, recovered, affiliateLink) {
  const previousTitle = cleanTitleCandidate(post.productTitle || "");
  post.productTitle = recovered.title;
  post.productCategory = recovered.category || post.productCategory || inferProductCategoryFromText(recovered.title);
  post.productVerified = true;
  post.productIntelAutoFilled = Boolean(post.productIntelAutoFilled || recovered.source !== "story_run_recovered");
  post.productIntelEvidence = recovered.source;
  post.productIntelConfidence = Math.max(Number(post.productIntelConfidence || 0), recovered.confidence);
  post.productIntelSource = recovered.source === "story_run_recovered"
    ? "ThreadsMe runtime repair daripada story-runs"
    : "ThreadsMe runtime repair daripada affiliate/story context";
  post.productAuditNote = previousTitle && normalizeRecoveredProductKey(previousTitle) !== normalizeRecoveredProductKey(recovered.title)
    ? `Auto repair: produk dibetulkan daripada "${previousTitle}" kepada "${recovered.title}".`
    : `Auto repair: tajuk produk dipulihkan sebagai "${recovered.title}".`;

  if (post.source === "generated") {
    const quality = auditStoryQuality(post, { productTitle: post.productTitle, productCategory: post.productCategory, affiliateLink }, affiliateLink);
    post.qualityStatus = quality.status;
    post.qualityScore = quality.score;
    post.qualityChecks = quality.checks;
    post.qualityReasons = quality.reasons;
    post.autoAuditStatus = quality.status === "passed" ? "auto_repaired_passed" : "needs_regenerate";
    post.autoAuditDecision = quality.status === "passed"
      ? "Metadata produk dipulihkan dan story lulus Quality Gate."
      : "Metadata produk dipulihkan, tetapi story perlu regenerate supaya selari dengan produk sebenar.";
    post.autoAuditAt = `${malaysiaNow()} GMT+8`;
  }
}

async function repairEmptyRuntimeSchedule() {
  const [scheduleData, statusData, legacySchedule] = await Promise.all([
    readJsonFile(scheduleFile, { posts: [] }),
    readJsonFile(statusFile, {}),
    readJsonFile(legacyScheduleFile, { posts: [] }),
  ]);
  const hasRuntimePosts = Array.isArray(scheduleData.posts) && scheduleData.posts.length > 0;
  if (hasRuntimePosts || countStatusNumbers(statusData) === 0) return false;

  const candidates = [];
  const legacyPosts = Array.isArray(legacySchedule.posts) ? legacySchedule.posts : [];
  if (legacyPosts.length) candidates.push({ source: "legacy", data: legacySchedule, posts: legacyPosts.length });
  try {
    const backupEntries = await readdir(backupRoot, { withFileTypes: true });
    for (const entry of backupEntries) {
      if (!entry.isDirectory()) continue;
      const candidateFile = path.join(backupRoot, entry.name, "threads-schedule.json");
      const candidate = await readJsonFile(candidateFile, null);
      const candidatePosts = Array.isArray(candidate?.posts) ? candidate.posts : [];
      if (candidatePosts.length) candidates.push({ source: `backup:${entry.name}`, data: candidate, posts: candidatePosts.length });
    }
  } catch {
    // Backup folder is optional; legacy schedule remains the fallback.
  }
  candidates.sort((a, b) => b.posts - a.posts);
  const best = candidates[0];
  if (!best?.posts) return false;
  await writeJsonFile(scheduleFile, {
    ...best.data,
    restoredAt: `${malaysiaNow()} GMT+8`,
    restoredReason: `Runtime schedule kosong tetapi status queue masih aktif. ThreadsMe pulihkan daripada ${best.source} (${best.posts} siri).`,
    previousEmptyScheduleMeta: {
      lastAutoProductAuditAt: scheduleData.lastAutoProductAuditAt || "",
      lastAutoProductAuditNote: scheduleData.lastAutoProductAuditNote || "",
    },
  });
  return true;
}

async function repairRuntimeScheduleMetadataFromStoryRuns() {
  const [scheduleData, runs] = await Promise.all([
    readJsonFile(scheduleFile, { posts: [] }),
    readStoryRuns(),
  ]);
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  if (!posts.length || !runs.length) return false;

  const versionMap = new Map();
  for (const run of runs) {
    for (const version of run.versions || []) {
      const number = Number(version.scheduleNumber);
      if (!Number.isInteger(number) || number < 1) continue;
      versionMap.set(number, { run, version });
    }
  }
  if (!versionMap.size) return false;

  const affiliateProductMap = buildAffiliateProductMap(runs);
  let repaired = 0;
  let corrected = 0;
  let metadataTouched = 0;
  let runsTouched = false;
  posts.forEach((post, index) => {
    const number = index + 1;
    const match = versionMap.get(number);
    const run = match?.run || {};
    const version = match?.version || {};
    const affiliateLink = String(post.affiliateLink || version.affiliateLink || run.affiliateLink || scheduleData.affiliate_link || "").trim();
    const recovered = resolveRecoveredProduct({ post, run, version, affiliateProductMap, scheduleData });
    const currentTitle = cleanTitleCandidate(post.productTitle || "");
    const shouldApply = shouldApplyRecoveredProduct(post, recovered);

    if (affiliateLink && !post.affiliateLink) {
      post.affiliateLink = affiliateLink;
      metadataTouched += 1;
    }
    if (shouldApply) {
      if (currentTitle) corrected += 1;
      else repaired += 1;
      applyRecoveredProductToPost(post, recovered, affiliateLink);
    } else if (recovered?.category && !post.productCategory) {
      post.productCategory = recovered.category;
      metadataTouched += 1;
    }

    if (recovered?.title && match) {
      if (!version.productTitle || normalizeRecoveredProductKey(version.productTitle) !== normalizeRecoveredProductKey(recovered.title)) {
        version.productTitle = recovered.title;
        version.productCategory = version.productCategory || recovered.category;
        version.productVerified = true;
        version.productIntelEvidence = recovered.source;
        version.productIntelConfidence = recovered.confidence;
        version.updatedAt = `${malaysiaNow()} GMT+8`;
        runsTouched = true;
      }
      if (!run.productTitle) {
        run.productTitle = recovered.title;
        run.productCategory = run.productCategory || recovered.category;
        run.updatedAt = `${malaysiaNow()} GMT+8`;
        runsTouched = true;
      }
    }

    if (match) {
      if (version.label && !post.generatedLabel) {
        post.generatedLabel = version.label;
        metadataTouched += 1;
      }
      if (run.imageUrl && !post.imageUrl) {
        post.imageUrl = run.imageUrl;
        metadataTouched += 1;
      }
      if (version.qualityStatus && !post.qualityStatus) {
        post.qualityStatus = version.qualityStatus;
        metadataTouched += 1;
      }
      if (version.qualityScore && !post.qualityScore) {
        post.qualityScore = version.qualityScore;
        metadataTouched += 1;
      }
      if (Array.isArray(version.qualityChecks) && !post.qualityChecks) {
        post.qualityChecks = version.qualityChecks;
        metadataTouched += 1;
      }
      if (Array.isArray(version.qualityReasons) && !post.qualityReasons) {
        post.qualityReasons = version.qualityReasons;
        metadataTouched += 1;
      }
    }

    if (!match && affiliateLink && affiliateProductMap.has(affiliateLink)) {
      const affiliateRecovered = affiliateProductMap.get(affiliateLink);
      if (shouldApplyRecoveredProduct(post, affiliateRecovered)) {
        if (currentTitle) corrected += 1;
        else repaired += 1;
        applyRecoveredProductToPost(post, affiliateRecovered, affiliateLink);
      }
    }
  });

  if (!repaired && !corrected && !metadataTouched && !runsTouched) return false;
  scheduleData.posts = posts;
  scheduleData.lastRuntimeRepairAt = `${malaysiaNow()} GMT+8`;
  scheduleData.lastRuntimeRepairNote = `${repaired} tajuk dipulihkan, ${corrected} tajuk dibetulkan, ${metadataTouched} metadata diselaraskan daripada story-runs.`;
  await writeJsonFile(scheduleFile, scheduleData);
  if (runsTouched) await writeStoryRuns(runs);
  return true;
}

async function repairProductIntelCacheFromStoryRuns() {
  const runs = await readStoryRuns();
  if (!runs.length) return false;
  const affiliateProductMap = buildAffiliateProductMap(runs);
  if (!affiliateProductMap.size) return false;

  const data = await readJsonFile(productIntelCacheFile, { entries: [] });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  let touched = false;
  for (const entry of entries) {
    const affiliate = String(entry.key || "").replace(/^url:/, "").replace(/^affiliate:/, "");
    const recovered = affiliateProductMap.get(affiliate);
    if (!recovered?.title) continue;
    const currentTitle = cleanTitleCandidate(entry.intel?.productTitle || "");
    if (currentTitle && normalizeRecoveredProductKey(currentTitle) === normalizeRecoveredProductKey(recovered.title)) continue;
    if (entry.intel?.evidenceLevel === "link_verified" || entry.intel?.evidenceLevel === "provided") continue;
    entry.intel = {
      ...(entry.intel || {}),
      productTitle: recovered.title,
      productCategory: recovered.category || entry.intel?.productCategory || inferProductCategoryFromText(recovered.title),
      confidence: Math.max(Number(entry.intel?.confidence || 0), recovered.confidence),
      evidenceLevel: recovered.source,
      source: "ThreadsMe story-runs cache repair",
      autoResolvable: true,
      linkVerified: Boolean(entry.intel?.linkVerified),
      note: "Cache dibetulkan daripada story-runs supaya autopilot tidak guna metadata lama yang tersasar.",
      repairedAt: `${malaysiaNow()} GMT+8`,
    };
    touched = true;
  }

  if (!touched) return false;
  await writeJsonFile(productIntelCacheFile, {
    ...data,
    version: data.version || 1,
    updatedAt: `${malaysiaNow()} GMT+8`,
    entries,
  });
  return true;
}

async function readPublishLog() {
  const data = await readJsonFile(publishLogFile, { entries: [] });
  return Array.isArray(data.entries) ? data.entries : [];
}

async function writePublishLog(entries) {
  await writeJsonFile(publishLogFile, { entries: entries.slice(-250) });
}

async function appendPublishLog(entry) {
  const entries = await readPublishLog();
  const logEntry = {
    id: entry.id || `pub-${Date.now()}`,
    createdAt: `${malaysiaNow()} GMT+8`,
    ...entry,
  };
  entries.push(logEntry);
  await writePublishLog(entries);
  await appendRuntimeLog("publish-events.log", logEntry);
  return entries;
}

function uniqueSortedNumbers(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function removeNumber(values, number) {
  return uniqueSortedNumbers(values).filter((value) => value !== number);
}

function addNumber(values, number) {
  return uniqueSortedNumbers([...uniqueSortedNumbers(values), number]);
}

function getQueueStatusForNumber(statusData, number) {
  const scheduledSet = new Set(statusData.scheduled || []);
  const postedSet = new Set(statusData.posted || []);
  const failedSet = new Set(statusData.failed || []);
  const preparedSet = new Set(statusData.prepared || []);
  const remainingSet = new Set(statusData.remaining || []);
  if (failedSet.has(number)) return "failed";
  if (postedSet.has(number)) return "passed";
  if (scheduledSet.has(number)) return "pending";
  if (remainingSet.has(number) || preparedSet.has(number)) return "blocked";
  return "blocked";
}

function parseScheduleSlot(slot) {
  const [datePart, timePart] = String(slot || "").split(" ");
  if (!datePart || !timePart) return new Date(NaN);
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute);
}

function arraysMatch(a, b) {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function formatNumberRange(numbers) {
  if (!numbers.length) return "";
  if (numbers.length === 1) return `Siri ${numbers[0]}`;
  return `Siri ${numbers[0]}-${numbers[numbers.length - 1]}`;
}

function formatScheduleSlot(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getPostingTimes(postsPerDay) {
  const preset = postingTimePresets[postsPerDay] || postingTimePresets[5];
  return preset.slice(0, Math.max(1, Math.min(postsPerDay, preset.length)));
}

function getLatestExistingSlot(posts) {
  return posts.reduce((latest, post) => {
    const time = parseScheduleSlot(post.slot).getTime();
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
}

function buildScheduleSlots(existingPosts, count, postsPerDay) {
  const existingSlots = new Set(existingPosts.map((post) => post.slot).filter(Boolean));
  const times = getPostingTimes(postsPerDay);
  const latestExisting = getLatestExistingSlot(existingPosts);
  const startAfter = Math.max(Date.now() + 30 * 60 * 1000, latestExisting + 60 * 1000);
  const cursor = new Date(startAfter);
  const day = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  const slots = [];

  while (slots.length < count) {
    for (const time of times) {
      const [hour, minute] = time.split(":").map(Number);
      const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
      const slot = formatScheduleSlot(slotDate);
      if (slotDate.getTime() > startAfter && !existingSlots.has(slot)) {
        slots.push(slot);
        existingSlots.add(slot);
        if (slots.length === count) break;
      }
    }
    day.setDate(day.getDate() + 1);
  }

  return slots;
}

function buildAutomatedStatus(scheduleData, statusData, nowMs = Date.now(), options = {}) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const nativeScheduleMode = Boolean(options.nativeScheduleMode || statusData.nativeScheduleMode);
  const autoCompletePastSlots = nativeScheduleMode || options.autoCompletePastSlots !== false;
  const publisher = options.publisher || statusData.publisher || {};
  const previousScheduled = uniqueSortedNumbers(statusData.scheduled);
  const previousPosted = uniqueSortedNumbers(statusData.posted);
  const previousFailed = uniqueSortedNumbers(statusData.failed);
  const previousPrepared = uniqueSortedNumbers(statusData.prepared);
  const previousRemaining = uniqueSortedNumbers(statusData.remaining);

  const scheduledSet = new Set(previousScheduled);
  const postedSet = new Set(previousPosted);
  const failedSet = new Set(previousFailed);
  const preparedSet = new Set(previousPrepared);
  const remainingSet = new Set(previousRemaining);
  const publishResults =
    statusData.publishResults && typeof statusData.publishResults === "object" ? { ...statusData.publishResults } : {};
  const unverifiedPosted = [];

  for (const number of [...postedSet]) {
    const proof = publishResults[number] || publishResults[String(number)] || {};
    if (["published", "manual_published", "native_schedule_assumed"].includes(proof.status)) continue;
    postedSet.delete(number);
    remainingSet.add(number);
    unverifiedPosted.push(number);
  }

  posts.forEach((post, index) => {
    if (post?.qualityStatus !== "review") return;
    const number = index + 1;
    scheduledSet.delete(number);
    remainingSet.delete(number);
    preparedSet.add(number);
  });

  const postedNow = [];
  if (autoCompletePastSlots) {
    posts.forEach((post, index) => {
      const number = index + 1;
      if (!post || failedSet.has(number) || post.qualityStatus === "review") return;
      const time = parseScheduleSlot(post.slot).getTime();
      if (!Number.isFinite(time) || time > nowMs) return;
      if (!postedSet.has(number)) postedNow.push(number);
      postedSet.add(number);
      scheduledSet.delete(number);
      remainingSet.delete(number);
      preparedSet.delete(number);
      if (nativeScheduleMode && !publishResults[number] && !publishResults[String(number)]) {
        publishResults[number] = {
          status: "native_schedule_assumed",
          source: "Threads native schedule",
          slot: post.slot,
          publishedAt: `${malaysiaNow()} GMT+8`,
          note: "Ditanda Lulus kerana slot schedule sudah lepas dan Akmal sahkan scheduled posts dalam Threads berkurang.",
        };
      }
    });
  }

  const knownNumbers = new Set([
    ...scheduledSet,
    ...postedSet,
    ...failedSet,
    ...preparedSet,
    ...remainingSet,
  ]);

  posts.forEach((post, index) => {
    const number = index + 1;
    if (knownNumbers.has(number) || failedSet.has(number)) return;
    const time = parseScheduleSlot(post.slot).getTime();
    if (!Number.isFinite(time)) return;
    if (post.qualityStatus === "review") {
      preparedSet.add(number);
      return;
    }
    if (time <= nowMs && autoCompletePastSlots) postedSet.add(number);
    else remainingSet.add(number);
  });

  if (autoCompletePastSlots) {
    for (const number of previousScheduled) {
      const post = posts[number - 1];
      if (!post || failedSet.has(number) || postedSet.has(number)) continue;
      if (post.qualityStatus === "review") continue;
      if (parseScheduleSlot(post.slot).getTime() <= nowMs) {
        postedSet.add(number);
        postedNow.push(number);
      }
    }
  }

  const activeScheduled = uniqueSortedNumbers([...scheduledSet]).filter((number) => {
    const post = posts[number - 1];
    if (!post || postedSet.has(number) || failedSet.has(number)) return false;
    if (post.qualityStatus === "review") return false;
    const slotTime = parseScheduleSlot(post.slot).getTime();
    return !autoCompletePastSlots || slotTime > nowMs;
  });

  const openSlots = Math.max(0, threadsScheduleLimit - activeScheduled.length);
  const blockedPool = uniqueSortedNumbers([...remainingSet, ...preparedSet]).filter((number) => {
    const post = posts[number - 1];
    if (!post || scheduledSet.has(number) || postedSet.has(number) || failedSet.has(number)) return false;
    if (post.qualityStatus === "review") return false;
    return parseScheduleSlot(post.slot).getTime() > nowMs;
  });

  const promoted = blockedPool.slice(0, openSlots);
  for (const number of promoted) {
    scheduledSet.add(number);
    remainingSet.delete(number);
    preparedSet.delete(number);
  }

  const scheduled = uniqueSortedNumbers([...scheduledSet]).filter(
    (number) => {
      const post = posts[number - 1];
      return post?.qualityStatus !== "review" && !postedSet.has(number) && !failedSet.has(number);
    },
  );
  const posted = uniqueSortedNumbers([...postedSet]);
  const failed = uniqueSortedNumbers([...failedSet]);
  const prepared = uniqueSortedNumbers([...preparedSet]).filter(
    (number) => !scheduledSet.has(number) && !postedSet.has(number) && !failedSet.has(number),
  );
  const remaining = uniqueSortedNumbers([...remainingSet]).filter(
    (number) => !scheduledSet.has(number) && !postedSet.has(number) && !failedSet.has(number),
  );

  const blockedCount = remaining.length + prepared.length;

  let systemStatus = "Automasi aktif";
  let systemNote = "ThreadsMe sedang pantau jadual Threads dan status queue secara automatik.";
  if (nativeScheduleMode && postedNow.length) {
    systemStatus = "Tally Threads native - auto Lulus";
    systemNote = `${formatNumberRange(postedNow)} ditanda Lulus ikut masa slot Threads native. ${scheduled.length} masih Pending, ${blockedCount} masih Blocked.`;
  } else if (nativeScheduleMode) {
    systemStatus = "Tally Threads native aktif";
    systemNote = `${posted.length} siri Lulus ikut jadual native Threads. ${scheduled.length} masih Pending, ${blockedCount} masih Blocked.`;
  } else if (!publisher.liveReady) {
    systemStatus = "Publisher belum live - queue lokal";
    systemNote = `${scheduled.length} siri Pending masih queue lokal ThreadsMe. Tiada post akan masuk akaun Threads sehingga User ID/token lengkap dan dry-run dimatikan. ${blockedCount} siri disimpan sebagai Blocked.`;
  } else if (promoted.length) {
    systemStatus = "Automasi aktif - auto Pending";
    systemNote = `${formatNumberRange(promoted)} ditukar automatik daripada Blocked kepada Pending kerana slot jadual sudah kosong.`;
  } else if (unverifiedPosted.length) {
    systemStatus = "Publisher belum live - status dipulihkan";
    systemNote = `${formatNumberRange(unverifiedPosted)} dikeluarkan daripada Lulus kerana tiada bukti publish live ke Threads. Lengkapkan User ID/token dan matikan dry-run sebelum publish sebenar.`;
  } else if (postedNow.length) {
    systemStatus = "Automasi aktif - auto Lulus";
    systemNote = `${formatNumberRange(postedNow)} ditanda Lulus kerana masa posting sudah lepas.`;
  } else if (blockedCount) {
    systemStatus = "Automasi aktif - menunggu slot";
    systemNote = `${blockedCount} siri masih Blocked. ThreadsMe akan auto jadikan Pending bila slot jadual kosong.`;
  } else {
    systemStatus = "Automasi aktif - semua dipantau";
    systemNote = "Tiada siri Blocked. Semua siri sedang berada dalam status Lulus, Pending, atau Gagal.";
  }

  const nextRelease = uniqueSortedNumbers([...scheduledSet])
    .map((number) => {
      const post = posts[number - 1];
      return post ? { number, slot: post.slot, time: parseScheduleSlot(post.slot).getTime() } : null;
    })
    .filter((entry) => entry && !postedSet.has(entry.number) && !failedSet.has(entry.number) && entry.time > nowMs)
    .sort((a, b) => a.time - b.time)[0] || null;

  const nextBlocked = remaining[0] || prepared[0] || null;
  const nextPending = promoted[0] || null;
  const automationChanged =
    !arraysMatch(previousScheduled, scheduled) ||
    !arraysMatch(previousPosted, posted) ||
    !arraysMatch(previousPrepared, prepared) ||
    !arraysMatch(previousRemaining, remaining) ||
    statusData.systemStatus !== systemStatus ||
    statusData.systemNote !== systemNote;

  return {
    status: {
      ...statusData,
      systemStatus,
      systemNote,
      scheduled,
      posted,
      failed,
      prepared,
      remaining,
      publishResults,
      nativeScheduleMode,
      automationMode: true,
      automationLimit: threadsScheduleLimit,
      publisher,
      lastAutomationAt: `${malaysiaNow()} GMT+8`,
    },
    summary: {
      changed: automationChanged,
      promoted,
      postedNow,
      unverifiedPosted,
      openSlots,
      activeScheduled: activeScheduled.length,
      blockedCount,
      nextBlocked,
      nextPending,
      nextRelease,
    },
  };
}

function getThreadSeries(post) {
  return [
    { key: "main", label: "POST UTAMA", text: String(post?.main || "").trim() },
    { key: "reply1", label: "REPLY 1", text: String(post?.reply1 || "").trim() },
    { key: "reply2", label: "REPLY 2", text: String(post?.reply2 || "").trim() },
  ];
}

async function threadsGraphPost(config, token, endpoint, params) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    body.set(key, String(value));
  }
  body.set("access_token", token);

  const response = await fetch(`${threadsGraphUrl}/${config.threadsUserId}${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok) {
    const message = payload?.error?.message || payload?.error || raw || `HTTP ${response.status}`;
    throw new Error(`Threads API ${response.status}: ${message}`);
  }
  return payload;
}

async function publishTextToThreads({ config, token, text, replyToId }) {
  const container = await threadsGraphPost(config, token, "/threads", {
    media_type: "TEXT",
    text,
    reply_to_id: replyToId,
  });
  const waitMs = Math.max(0, Number(config.publishDelaySeconds || 0)) * 1000;
  if (waitMs) await sleep(waitMs);
  const published = await threadsGraphPost(config, token, "/threads_publish", {
    creation_id: container.id,
  });
  return {
    containerId: container.id,
    mediaId: published.id,
  };
}

async function publishThreadSeries(number, post, config) {
  const series = getThreadSeries(post);
  if (series.some((item) => !item.text)) throw new HttpError(400, `Siri ${number} tidak lengkap.`);

  if (config.dryRun) {
    return {
      dryRun: true,
      number,
      posts: series.map((item) => ({
        key: item.key,
        label: item.label,
        length: item.text.length,
        mediaId: `dry-run-${number}-${item.key}`,
      })),
    };
  }

  const token = await getThreadsAccessToken(config);
  if (!config.threadsUserId) throw new HttpError(400, "Threads User ID belum diset.");
  if (!token) throw new HttpError(400, "Threads access token belum diset.");

  const main = await publishTextToThreads({ config, token, text: series[0].text });
  const reply1 = await publishTextToThreads({
    config,
    token,
    text: series[1].text,
    replyToId: main.mediaId,
  });
  const reply2Parent = config.replyMode === "root" ? main.mediaId : reply1.mediaId;
  const reply2 = await publishTextToThreads({
    config,
    token,
    text: series[2].text,
    replyToId: reply2Parent,
  });

  return {
    dryRun: false,
    number,
    posts: [
      { key: "main", label: "POST UTAMA", ...main, length: series[0].text.length },
      { key: "reply1", label: "REPLY 1", ...reply1, length: series[1].text.length },
      { key: "reply2", label: "REPLY 2", ...reply2, length: series[2].text.length },
    ],
  };
}

async function markPublishSuccess(statusData, number, publishResult, publisherConfig) {
  const publishResults = statusData.publishResults && typeof statusData.publishResults === "object"
    ? statusData.publishResults
    : {};
  const updatedStatus = {
    ...statusData,
    scheduled: removeNumber(statusData.scheduled, number),
    posted: addNumber(statusData.posted, number),
    failed: removeNumber(statusData.failed, number),
    prepared: removeNumber(statusData.prepared, number),
    remaining: removeNumber(statusData.remaining, number),
    publishResults: {
      ...publishResults,
      [number]: {
        status: "published",
        publishedAt: `${malaysiaNow()} GMT+8`,
        posts: publishResult.posts,
      },
    },
    publisher: publisherConfig,
    systemStatus: "Threads API - Lulus",
    systemNote: `Siri ${number} berjaya dipublish ke Threads melalui API dan ditanda Lulus.`,
    lastPublishAt: `${malaysiaNow()} GMT+8`,
  };
  await writeJsonFile(statusFile, updatedStatus);
  await syncStoryRunsWithStatus(updatedStatus);
  return updatedStatus;
}

async function markPublishFailure(statusData, number, error, publisherConfig) {
  const publishResults = statusData.publishResults && typeof statusData.publishResults === "object"
    ? statusData.publishResults
    : {};
  const updatedStatus = {
    ...statusData,
    scheduled: removeNumber(statusData.scheduled, number),
    failed: addNumber(statusData.failed, number),
    prepared: removeNumber(statusData.prepared, number),
    remaining: removeNumber(statusData.remaining, number),
    publishResults: {
      ...publishResults,
      [number]: {
        status: "failed",
        failedAt: `${malaysiaNow()} GMT+8`,
        error: error.message,
      },
    },
    publisher: publisherConfig,
    systemStatus: "Threads API - Gagal",
    systemNote: `Siri ${number} gagal publish ke Threads: ${error.message}`,
    lastPublishErrorAt: `${malaysiaNow()} GMT+8`,
  };
  await writeJsonFile(statusFile, updatedStatus);
  await syncStoryRunsWithStatus(updatedStatus);
  return updatedStatus;
}

async function publishScheduleNumber(number, { force = false, config = null, hasToken = null } = {}) {
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const threadsConfig = config || await readThreadsConfig();
  const tokenReady = hasToken === null ? await hasThreadsToken(threadsConfig) : hasToken;
  const publisherConfig = sanitizeThreadsConfig(threadsConfig, tokenReady);
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const post = posts[number - 1];
  if (!post) throw new HttpError(404, `Siri ${number} tidak wujud dalam jadual.`);
  if (uniqueSortedNumbers(statusData.posted).includes(number)) {
    return { skipped: true, reason: "Siri sudah Lulus/posted dan tidak akan dihantar semula untuk elak duplicate.", number };
  }
  if (post.qualityStatus === "review") {
    return { skipped: true, reason: "Siri masih Perlu Semak dan tidak akan dipublish sehingga lulus Quality Gate.", number };
  }

  const slotTime = parseScheduleSlot(post.slot).getTime();
  const isDue = Number.isFinite(slotTime) && slotTime <= Date.now();
  if (!force && !isDue) {
    return { skipped: true, reason: "Slot belum sampai masa.", number };
  }
  if (!force && !uniqueSortedNumbers(statusData.scheduled).includes(number)) {
    return { skipped: true, reason: "Siri belum berada dalam Pending scheduled.", number };
  }
  if (!threadsConfig.dryRun && (!publisherConfig.liveReady)) {
    throw new HttpError(403, "Threads API belum live-ready. Semak User ID, access token, dan mode live.");
  }

  const startedAt = `${malaysiaNow()} GMT+8`;
  const preflight = await runPublisherPreflight(number, {
    scheduleData,
    statusData,
    config: threadsConfig,
  });
  if (!preflight.allow) {
    await appendPublishLog({
      number,
      slot: post.slot,
      mode: threadsConfig.dryRun ? "dry-run" : "live",
      status: preflight.retryable ? "preflight_waiting" : "preflight_blocked",
      startedAt,
      finishedAt: `${malaysiaNow()} GMT+8`,
      error: preflight.reason,
      preflight: {
        status: preflight.status,
        localScore: preflight.localReport?.score ?? null,
        aiScore: preflight.aiReport?.score ?? null,
        aiChecked: Boolean(preflight.aiReport?.checked),
        regenerated: preflight.regenerated?.updatedNumbers || [],
      },
    });
    return {
      skipped: true,
      reason: preflight.reason,
      number,
      preflight,
      status: preflight.statusData || await readJsonFile(statusFile, {}),
    };
  }

  try {
    const result = await publishThreadSeries(number, post, threadsConfig);
    await appendPublishLog({
      number,
      slot: post.slot,
      mode: result.dryRun ? "dry-run" : "live",
      status: result.dryRun ? "dry_run" : "published",
      startedAt,
      finishedAt: `${malaysiaNow()} GMT+8`,
      result,
      preflight: {
        status: preflight.status,
        localScore: preflight.localReport?.score ?? null,
        aiScore: preflight.aiReport?.score ?? null,
        aiChecked: Boolean(preflight.aiReport?.checked),
        regenerated: preflight.regenerated?.updatedNumbers || [],
      },
    });

    if (!result.dryRun) {
      const latestStatus = await readJsonFile(statusFile, {});
      const updatedStatus = await markPublishSuccess(latestStatus, number, result, publisherConfig);
      return { ok: true, number, result, preflight, status: updatedStatus };
    }

    const latestStatus = await readJsonFile(statusFile, {});
    const updatedStatus = {
      ...latestStatus,
      publisher: publisherConfig,
      systemStatus: "Threads API - dry-run",
      systemNote: `Dry-run Siri ${number} selesai. Tiada post dihantar ke Threads.`,
      lastPublishDryRunAt: `${malaysiaNow()} GMT+8`,
    };
    await writeJsonFile(statusFile, updatedStatus);
    return { ok: true, number, result, preflight, status: updatedStatus };
  } catch (error) {
    await appendPublishLog({
      number,
      slot: post.slot,
      mode: threadsConfig.dryRun ? "dry-run" : "live",
      status: "failed",
      startedAt,
      finishedAt: `${malaysiaNow()} GMT+8`,
      error: error.message,
    });
    if (!threadsConfig.dryRun) {
      const latestStatus = await readJsonFile(statusFile, {});
      const updatedStatus = await markPublishFailure(latestStatus, number, error, publisherConfig);
      return { ok: false, number, error: error.message, status: updatedStatus };
    }
    throw error;
  }
}

async function runThreadsPublisherDue({ scheduleData, statusData, config, hasToken }) {
  const publisherConfig = sanitizeThreadsConfig(config, hasToken);
  if (!publisherConfig.liveReady) {
    return {
      active: Boolean(config.enabled),
      liveReady: false,
      attempted: [],
      skippedReason: config.enabled ? "Threads API belum lengkap atau masih dry-run." : "Live publisher belum diaktifkan.",
    };
  }

  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const dueNumbers = uniqueSortedNumbers(statusData.scheduled)
    .filter((number) => {
      const post = posts[number - 1];
      if (!post) return false;
      return parseScheduleSlot(post.slot).getTime() <= Date.now();
    })
    .slice(0, config.maxDuePerSync);

  const attempted = [];
  for (const number of dueNumbers) {
    const result = await publishScheduleNumber(number, { config, hasToken });
    attempted.push({ number, ok: result.ok !== false, skipped: Boolean(result.skipped), error: result.error || "" });
  }

  return {
    active: true,
    liveReady: true,
    attempted,
  };
}

async function runThreadsMeAutomation() {
  await repairRuntimeScheduleMetadataFromStoryRuns();
  await repairProductIntelCacheFromStoryRuns();
  const autoAudit = await runAutoProductAudit();
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const threadsConfig = await readThreadsConfig();
  const tokenReady = await hasThreadsToken(threadsConfig);
  const publisherConfig = sanitizeThreadsConfig(threadsConfig, tokenReady);
  const result = buildAutomatedStatus(scheduleData, statusData, Date.now(), {
    autoCompletePastSlots: false,
    publisher: publisherConfig,
  });
  result.autoAudit = {
    summary: autoAudit.summary,
    actions: autoAudit.actions,
    updated: autoAudit.updated,
    protectedCount: autoAudit.protectedCount,
    autoFilledCount: autoAudit.autoFilledCount,
    linkVerifiedCount: autoAudit.linkVerifiedCount,
    resolveTried: autoAudit.resolveTried,
  };
  await writeJsonFile(statusFile, result.status);
  await syncStoryRunsWithStatus(result.status, scheduleData);
  const publisherSummary = await runThreadsPublisherDue({
    scheduleData,
    statusData: result.status,
    config: threadsConfig,
    hasToken: tokenReady,
  });
  result.publisher = publisherSummary;
  result.status = await readJsonFile(statusFile, result.status);
  return result;
}

async function scheduleGeneratedVersions(input, result, runId) {
  const scheduleData = await readJsonFile(scheduleFile, {
    timezone: "Asia/Kuala_Lumpur",
    affiliate_link: String(input.affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3").trim(),
    notes: "ThreadsMe generated schedule.",
    posts: [],
  });
  const statusData = await readJsonFile(statusFile, {});
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const versions = Array.isArray(result.versions) ? result.versions : [];
  const affiliateLink = String(input.affiliateLink || scheduleData.affiliate_link || "https://s.shopee.com.my/7VDqSOoKf3").trim();
  const postsPerDay = Math.max(1, Math.min(Number(input.postsPerDay || versions.length || 5), maxPostingPerDay));
  const qualityReports = versions.map((version) => {
    const quality = auditStoryQuality(version, input, affiliateLink);
    if (input.productVerified === false) {
      return {
        ...quality,
        status: "review",
        score: Math.min(Number(quality.score || 0), 64),
        reasons: [
          "Produk dicadangkan automatik tetapi belum link-verified daripada Shopee.",
          ...(quality.reasons || []),
        ],
      };
    }
    return quality;
  });
  const schedulableVersions = versions
    .map((version, index) => ({ version, index, quality: qualityReports[index] }))
    .filter((item) => item.quality.status === "passed");
  const slots = buildScheduleSlots(posts, schedulableVersions.length, postsPerDay);
  const startNumber = posts.length + 1;
  const itemsByIndex = Array.from({ length: versions.length }, () => null);

  const items = schedulableVersions.map(({ version, index, quality }, scheduledIndex) => {
    const number = startNumber + scheduledIndex;
    const slot = slots[scheduledIndex];
    posts.push({
      slot,
      main: version.main,
      reply1: version.reply1,
      reply2: version.reply2,
      affiliateLink,
      source: "generated",
      generatedRunId: runId,
      generatedLabel: version.label || `Versi ${index + 1}`,
      postsPerDay,
      createdAt: `${malaysiaNow()} GMT+8`,
      productTitle: String(input.productTitle || "").trim(),
      productCategory: String(input.productCategory || "").trim(),
      productVerified: input.productVerified !== false,
      productIntelEvidence: input.productIntelEvidence || "story_input",
      productIntelConfidence: Number(input.productIntelConfidence || 100),
      productIntelSource: input.productIntelSource || "Jana Story",
      qualityStatus: quality.status,
      qualityScore: quality.score,
      qualityChecks: quality.checks,
    });
    const item = {
      number,
      slot,
      affiliateLink,
      queueStatus: "blocked",
      originalIndex: index,
      quality,
    };
    itemsByIndex[index] = item;
    return item;
  });

  const queuedNumbers = items.map((item) => item.number);
  const reviewCount = qualityReports.filter((quality) => quality.status === "review").length;
  const updatedStatus = {
    ...statusData,
    remaining: uniqueSortedNumbers([...(statusData.remaining || []), ...queuedNumbers]),
    systemStatus: reviewCount ? "Quality Gate - perlu semak" : "Automasi aktif - story dijadualkan",
    systemNote: queuedNumbers.length
      ? `${formatNumberRange(queuedNumbers)} berjaya dijana dan dimasukkan ke Jadual Threads. ${reviewCount ? `${reviewCount} versi ditahan sebagai Perlu Semak.` : "Semua versi lulus Quality Gate."}`
      : `${reviewCount} versi ditahan sebagai Perlu Semak. Tiada siri dimasukkan ke Jadual Threads.`,
    lastGeneratedScheduleAt: `${malaysiaNow()} GMT+8`,
  };

  scheduleData.posts = posts;
  scheduleData.affiliate_link = scheduleData.affiliate_link || affiliateLink;
  scheduleData.lastGeneratedScheduleAt = `${malaysiaNow()} GMT+8`;
  scheduleData.threads_limits = {
    activeScheduledSeries: threadsScheduleLimit,
    apiPublishedPostsPer24h: threadsApiDailyPublishLimit,
    selectedPostingPerDay: postsPerDay,
  };

  await writeJsonFile(scheduleFile, scheduleData);
  const automation = buildAutomatedStatus(scheduleData, updatedStatus);
  await writeJsonFile(statusFile, automation.status);
  await syncStoryRunsWithStatus(automation.status, scheduleData);

  const scheduledSet = new Set(automation.status.scheduled || []);
  const postedSet = new Set(automation.status.posted || []);
  const failedSet = new Set(automation.status.failed || []);
  for (const item of items) {
    if (failedSet.has(item.number)) item.queueStatus = "failed";
    else if (postedSet.has(item.number)) item.queueStatus = "passed";
    else if (scheduledSet.has(item.number)) item.queueStatus = "pending";
    else item.queueStatus = "blocked";
  }

  return {
    items,
    itemsByIndex,
    qualityReports,
    reviewCount,
    postsPerDay,
    activeScheduledLimit: threadsScheduleLimit,
    apiDailyPublishLimit: threadsApiDailyPublishLimit,
    automation: automation.summary,
  };
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "x-frame-options": "DENY",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_200_000) throw new HttpError(413, "Request terlalu besar.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "JSON request tidak sah.");
  }
}

function buildPrompt(input) {
  const versions = Math.max(1, Math.min(Number(input.versions || input.postsPerDay || 3), maxPostingPerDay));
  const theme = input.theme || "auto";
  const productTitle = String(input.productTitle || "").trim();
  const productCategory = String(input.productCategory || "").trim();
  const sourceText = String(input.sourceText || "").trim();
  const imageNotes = String(input.imageNotes || "").trim();
  const imageName = String(input.imageName || "").trim();
  const imageUrl = String(input.imageUrl || "").trim();
  const imageSource = String(input.imageSource || "").trim();
  const affiliateLink = String(input.affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3").trim();
  const postsPerDay = Math.max(1, Math.min(Number(input.postsPerDay || 5), maxPostingPerDay));
  const hasProductContext = Boolean(productTitle || productCategory || sourceText || imageNotes || imageName || imageUrl || imageSource);
  const autoContext = hasProductContext
    ? "Ada konteks produk. Ikat semua storytelling kepada produk tepat yang diberi dan jangan reka spesifikasi teknikal yang tidak diberi."
    : "Tiada brief atau nota produk diberi. Cipta sendiri angle affiliate yang selamat, general, dan relatable untuk netizen Malaysia di Threads tanpa claim spesifik tentang produk.";

  return {
    versions,
    messages: [
      {
        role: "system",
        content: [
          "Anda ialah copywriter senior untuk Threads, pakar deep storytelling dan affiliate marketing yang nampak natural.",
          "Tulis dalam Bahasa Melayu Malaysia yang santai, personal, matang, dan terasa seperti luahan rakan yang pernah melalui masalah itu sendiri.",
          "Setiap siri mesti ada arc emosi yang jelas: POST UTAMA = hook kuat + rasa yang familiar, REPLY 1 = cerita kecil harian yang buat pembaca rasa difahami, REPLY 2 = resolusi lembut yang menghubungkan produk secara natural.",
          "Jangan kedengaran seperti iklan keras, katalog produk, atau ayat template. Utamakan human truth dahulu, produk datang sebagai penyelesaian kecil yang masuk akal.",
          "Jika tajuk produk diberi, produk itu wajib jadi anchor cerita. Jangan ubah kategori produk, jangan tukar kepada produk lain, dan jangan tulis manfaat yang tidak berkaitan.",
          "Jika user tidak beri brief, jangan minta maklumat tambahan. Terus cipta angle sendiri yang sesuai untuk Threads Malaysia.",
          "Jika produk tidak jelas, gunakan bahasa neutral seperti 'produk ni', 'barang ni', atau 'benda kecil ni' dan fokus pada emosi/situasi harian, bukan spesifikasi.",
          "Guna angle berbeza untuk setiap versi: jangan ulang struktur hook, konflik, atau CTA yang sama.",
          "Elakkan claim berlebihan. Produk boleh bantu ruang nampak lebih kemas/premium, bukan selesaikan semua masalah hidup.",
          "Nada mesti terasa macam orang Malaysia bercerita di Threads: sedikit vulnerable, tidak skema, tidak terlalu salesy, ada rasa 'aku pun pernah rasa macam ni'.",
          "Pastikan ada deep storyline walaupun ringkas: watak aku, masalah kecil harian, rasa yang terpendam, titik mula berubah, kemudian produk sebagai solusi kecil.",
          `Manfaatkan limit Threads: sasarkan ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara untuk setiap POST UTAMA, REPLY 1, dan REPLY 2. Jangan pendek sangat kecuali perlu untuk elak lebih ${threadPostMaxChars} aksara.`,
          "Setiap post perlu rasa lengkap: 2-4 ayat pendek yang ada detail visual, rasa manusia, dan flow cerita. Jangan tulis satu ayat generic sahaja.",
          "Gunakan Bahasa Melayu Malaysia yang kemas. Boleh santai, tetapi jangan guna typo, slanga keterlaluan, ayat kasar, atau ejaan cacat seperti 'tgok', 'macan', 'ubsuasana'.",
          "Reply 2 mesti akhiri dengan affiliate link yang tepat tanpa mengubah domain, ejaan, atau karakter link.",
          "Emoji sangat minimum dan hanya jika benar-benar menambah rasa.",
          "Output mesti JSON sahaja.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Tugasan: hasilkan ${versions} versi siri Threads.`,
          `Cadangan posting sehari: ${postsPerDay}. Variasi mesti cukup berbeza untuk dijadualkan sepanjang hari tanpa rasa berulang.`,
          `Tema emosi: ${theme}. Jika auto, pilih pain atau hope yang paling kuat.`,
          `Tajuk produk wajib: ${productTitle || "tidak diberi"}`,
          `Kategori / kegunaan produk: ${productCategory || "tidak diberi"}`,
          `Affiliate link wajib di akhir Reply 2: ${affiliateLink}`,
          `Mod auto konteks: ${autoContext}`,
          "Format setiap versi: POST UTAMA, REPLY 1, REPLY 2.",
          `Setiap post maksimum ${threadPostMaxChars} aksara termasuk ruang dan link.`,
          `Target panjang setiap post: ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara. Ini aksara, bukan perkataan. Gunakan ruang ini untuk deep storytelling yang sedap dibaca.`,
          "Post utama mesti mula dengan hook yang buat orang berhenti scroll: rasa penat, malu kecil, harapan, atau konflik rumah yang familiar.",
          "Reply 1 kembangkan emosi cerita secara spesifik: situasi harian, benda yang selalu dipandang, rasa rumah belum siap, atau mood yang jatuh/naik.",
          "Reply 2 bawa resolusi secara lembut: tunjuk bagaimana produk dalam gambar relevan dengan cerita, kemudian CTA ikhlas dan link affiliate.",
          "Kalau produk tidak diketahui, jangan sebut ciri khusus yang mungkin salah. Jadikan Reply 2 sebagai jambatan natural: 'kalau tengah cari benda kecil untuk mula ubah ruang/rutin, boleh tengok produk ni'.",
          "Gunakan bahasa yang menarik, ada deep storyline, padat, dan sesuai untuk netizen Malaysia di Threads. Jangan terlalu pendek, jangan macam caption iklan.",
          "Setiap versi mesti ada hook berbeza dan situasi yang terasa dekat dengan netizen Malaysia: rumah sewa, penat kerja, tetamu datang, ruang kecil, barang bersepah, bajet terhad, atau impian rumah kemas.",
          "Jangan jadikan produk sebagai hero terlalu awal. Cerita dan emosi dahulu, produk hanya masuk secara natural di Reply 2.",
          "Jangan ulang ayat CTA sama. Variasikan dengan cara ikhlas seperti 'boleh survey', 'boleh tengok', 'kalau tengah cari benda macam ni'.",
          "Gunakan emoji secukupnya sahaja, maksimum 1 emoji setiap post jika perlu.",
          "Jangan guna markdown table. Jangan guna code fence.",
          "Jangan tulis label selain field JSON. Jangan masukkan backticks.",
          "",
          `Sumber gambar: ${imageSource || "tiada"}`,
          `Nama fail gambar jika ada: ${imageName || "tiada"}`,
          `Link gambar produk jika ada: ${imageUrl || "tiada"}`,
          `Nota gambar/produk: ${imageNotes || "tiada nota gambar. Gunakan brief teks sahaja."}`,
          "",
          `Brief / output asal:\n${sourceText || "Tiada brief diberi. Cipta sendiri story, angle, dan CTA yang natural untuk audiens Threads Malaysia."}`,
          "",
          'Balas sebagai JSON: {"versions":[{"label":"Versi 1","main":"...","reply1":"...","reply2":"..."}]}',
        ].join("\n"),
      },
    ],
  };
}

function normalizeVersions(data) {
  if (data && Array.isArray(data.versions)) {
    return data.versions.map((item, index) => ({
      label: item.label || `Versi ${index + 1}`,
      main: String(item.main || "").trim(),
      reply1: String(item.reply1 || "").trim(),
      reply2: String(item.reply2 || "").trim(),
    }));
  }
  return [];
}

function attachExactAffiliateLink(text, affiliateLink) {
  const safeLink = String(affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3").trim();
  const linkBlock = `\n${safeLink}`;
  const withoutLinks = String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+$/g, "")
    .trim();
  const maxBodyLength = Math.max(20, threadPostMaxChars - linkBlock.length);
  const body =
    withoutLinks.length > maxBodyLength
      ? withoutLinks.slice(0, maxBodyLength).replace(/\s+\S*$/g, "").trim()
      : withoutLinks;
  return `${body}${linkBlock}`.trim();
}

function enforceGeneratedStoryRules(versions, affiliateLink) {
  return versions.map((version, index) => ({
    label: version.label || `Versi ${index + 1}`,
    main: String(version.main || "").trim(),
    reply1: String(version.reply1 || "").trim(),
    reply2: attachExactAffiliateLink(version.reply2, affiliateLink),
  }));
}

function tokenizeProductText(value) {
  const stopwords = new Set([
    "dan",
    "atau",
    "yang",
    "untuk",
    "dengan",
    "produk",
    "original",
    "ready",
    "stock",
    "stok",
    "free",
    "shipping",
    "murah",
    "malaysia",
    "by",
    "the",
    "of",
    "ini",
    "ni",
  ]);
  return Array.from(
    new Set(
      String(value || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !stopwords.has(token)),
    ),
  );
}

function hasSemanticProductRelevance(productText, fullText) {
  const product = String(productText || "").toLowerCase();
  const text = String(fullText || "").toLowerCase();
  const rules = [
    {
      product: /sambal|cili|chili|pedas|lauk|selera/,
      terms: ["sambal", "pedas", "lauk", "selera", "nasi", "makan", "telur", "ayam", "ikan", "dapur", "balang", "cedok"],
      primary: ["sambal", "pedas", "lauk"],
      minimum: 2,
    },
    {
      product: /marble|wallpaper|dinding|sheet|dekor|deco/,
      terms: ["marble", "dinding", "wall", "sticker", "sheet", "dekor", "ruang", "rumah", "kemas", "premium", "focal"],
      primary: ["marble", "dinding", "sheet"],
      minimum: 2,
    },
    {
      product: /lampu|light|led|fairy|solar|street/,
      terms: ["lampu", "light", "led", "cahaya", "terang", "malam", "luar", "outdoor", "jalan", "solar", "gelap"],
      primary: ["lampu", "light", "led", "solar"],
      minimum: 2,
    },
    {
      product: /organizer|storage|rak|kotak|susun|divider/,
      terms: ["organizer", "storage", "rak", "kotak", "susun", "kemas", "barang", "ruang", "meja", "simpan", "divider"],
      primary: ["organizer", "storage", "rak", "kotak", "susun"],
      minimum: 2,
    },
  ];
  const rule = rules.find((item) => item.product.test(product));
  if (!rule) return false;
  const matchedTerms = new Set(rule.terms.filter((term) => text.includes(term)));
  const repeatedPrimary = (rule.primary || []).some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = text.match(new RegExp(`\\b${escaped}\\b`, "g")) || [];
    return matches.length >= 2;
  });
  return matchedTerms.size >= rule.minimum || repeatedPrimary;
}

function inferStoryProductKind(value) {
  const text = String(value || "").toLowerCase();
  if (/sambal|nyet|khairulaming|cili|chili|pedas|lauk|selera/.test(text)) return "sambal";
  if (/pressure\s*cooker|periuk\s+tekanan|dessini|cooker|kukus|stew|sup/.test(text)) return "pressure_cooker";
  if (/poh\s*kong|\bgold\b|\bemas\b|bunga raya|24k|999/.test(text)) return "gold";
  if (/solar|outdoor|street|lampu jalan|waterproof|laman|pagar|porch/.test(text)) return "solar";
  if (/fairy|dawai|string\s*light|kelip|lampu\s*led/.test(text)) return "fairy_light";
  if (/marble|flexi\s*marble|wallpaper|wall\s*sheet|dinding|dekor|deco/.test(text)) return "marble";
  return "";
}

function inferAffiliateProductKind(link) {
  const value = String(link || "");
  if (/7VDqSOoKf3/i.test(value)) return "marble";
  if (/5q5lqSXkro/i.test(value)) return "fairy_light";
  if (/902oCbnlhL/i.test(value)) return "solar";
  if (/5q5mTxqz8i/i.test(value)) return "pressure_cooker";
  if (/2g8lFhByWQ/i.test(value)) return "sambal";
  if (/9zvMgGgvG7/i.test(value)) return "gold";
  return "";
}

function detectStoryProductAlignment(productText, fullText, affiliateLink = "") {
  const productKind = inferStoryProductKind(productText);
  const linkKind = inferAffiliateProductKind(affiliateLink);
  const expectedKind = productKind || linkKind;
  const text = String(fullText || "").toLowerCase();
  const issues = [];

  if (productKind && linkKind && productKind !== linkKind) {
    issues.push("Link affiliate tidak sepadan dengan tajuk/kategori produk.");
  }

  if (!expectedKind) return { ok: !issues.length, productKind, linkKind, issues };

  const leakRules = {
    sambal: [
      /marble|flexi\s*marble|wallpaper|feature\s*wall|dinding\s+(kosong|putih|kusam)|renovate|deko|hiasan|sofa|rak\s+senget|bilik\s+tidur|tanaman\s+hiasan|pressure\s*cooker|periuk\s+tekanan|dessini/,
      /meja\s+(lusuh|calar)|sudut\s+kopi|instagrammable|background\s+rumah/,
    ],
    pressure_cooker: [
      /sambal|nyet|khairulaming|pedas|lauk\s+ringkas|nasi\s+panas\s+dengan\s+sambal|marble|wallpaper|feature\s*wall|dinding|fairy|string\s*light|solar/,
    ],
    marble: [
      /sambal|nyet|khairulaming|pedas|lauk|telur\s+goreng|ayam\s+goreng|ikan\s+goreng|nasi\s+panas|bekal\s+cepat|pressure\s*cooker|periuk\s+tekanan|dessini/,
    ],
    gold: [
      /sambal|nyet|pedas|lauk|nasi\s+panas|marble|wallpaper|feature\s*wall|dinding\s+kosong|renovate/,
    ],
    fairy_light: [
      /solar|street\s*lamp|lampu\s+jalan|waterproof|ip68|pagar|porch|laman|jalan\s+gelap/,
    ],
    solar: [
      /fairy|string\s*light|lampu\s+dawai|kepala\s+katil|bilik\s+cozy|rak\s+kecil|tepi\s+cermin/,
    ],
  };

  const matchedLeaks = (leakRules[expectedKind] || []).filter((pattern) => pattern.test(text));
  if (matchedLeaks.length) {
    issues.push("Story bocor kepada kategori produk lain dan boleh mengelirukan pembaca.");
  }

  return { ok: !issues.length, productKind, linkKind, issues };
}

function auditStoryQuality(version, input, affiliateLink) {
  const productTitle = String(input.productTitle || "").trim();
  const productCategory = String(input.productCategory || "").trim();
  const exactLink = String(affiliateLink || input.affiliateLink || "").trim();
  const parts = {
    main: String(version.main || "").trim(),
    reply1: String(version.reply1 || "").trim(),
    reply2: String(version.reply2 || "").trim(),
  };
  const fullText = `${parts.main} ${parts.reply1} ${parts.reply2}`.toLowerCase();
  const productTokens = tokenizeProductText(`${productTitle} ${productCategory}`);
  const matchedProductTokens = productTokens.filter((token) => fullText.includes(token));
  const semanticRelevanceOk = hasSemanticProductRelevance(`${productTitle} ${productCategory}`, fullText);
  const alignment = detectStoryProductAlignment(`${productTitle} ${productCategory}`, fullText, exactLink);
  const claimPattern = /\b(confirm|konfem|jamin|guarantee|100%|sembuh|rawat|hilang terus|paling murah|termurah|viral gila|wajib beli)\b/i;
  const typoPattern = /\b(tgok|macan|ubsuasana|mmg|x\s?yah|takde|sngt)\b/i;
  const hardIssues = [];
  const checks = [];

  const lengths = Object.values(parts).map((text) => text.length);
  const lengthOk = lengths.every((length) => length > 0 && length <= threadPostMaxChars);
  checks.push({ key: "length", label: `Setiap post <=${threadPostMaxChars} aksara`, passed: lengthOk });
  if (!lengthOk) hardIssues.push(`Ada post kosong atau melebihi ${threadPostMaxChars} aksara.`);

  const targetLengthOk = lengths.every(
    (length) => length >= threadPostTargetMinChars && length <= threadPostTargetMaxChars,
  );
  checks.push({
    key: "target_length",
    label: `Manfaatkan ruang ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara`,
    passed: targetLengthOk,
  });

  const linkOk = exactLink ? parts.reply2.endsWith(exactLink) : /https?:\/\/\S+$/i.test(parts.reply2);
  checks.push({ key: "affiliate", label: "Reply 2 tamat dengan link affiliate", passed: linkOk });
  if (!linkOk) hardIssues.push("Reply 2 tidak tamat dengan link affiliate tepat.");

  const relevanceOk = !productTokens.length || matchedProductTokens.length >= Math.min(2, productTokens.length) || semanticRelevanceOk;
  checks.push({ key: "relevance", label: "Relevan dengan tajuk/kategori produk", passed: relevanceOk });
  if (!relevanceOk) hardIssues.push("Story tidak cukup menyebut konteks produk sebenar.");

  const linkProductOk = alignment.ok && (!alignment.linkKind || !alignment.productKind || alignment.linkKind === alignment.productKind);
  checks.push({ key: "link_product_match", label: "Link affiliate sepadan dengan produk dan story", passed: linkProductOk });
  if (!linkProductOk) hardIssues.push(...alignment.issues);

  const hookOk = parts.main.length >= 45 && !/^(produk ini|barang ini|jom beli|murah|sale)/i.test(parts.main);
  checks.push({ key: "hook", label: "Hook manusia, bukan iklan keras", passed: hookOk });

  const languageOk = !typoPattern.test(fullText);
  checks.push({ key: "language", label: "Bahasa Melayu Malaysia kemas", passed: languageOk });

  const claimOk = !claimPattern.test(fullText);
  checks.push({ key: "claims", label: "Tiada claim pelik atau berlebihan", passed: claimOk });
  if (!claimOk) hardIssues.push("Ada claim berlebihan atau terlalu menjual.");

  const storyOk = /\b(aku|kita|rumah|hari|rasa|penat|malam|pagi|balik|makan|dapur|kerja)\b/i.test(fullText);
  checks.push({ key: "story", label: "Ada rasa cerita harian", passed: storyOk });

  const passedCount = checks.filter((check) => check.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);
  const status = hardIssues.length ? "review" : "passed";
  return {
    status,
    score,
    checks,
    reasons: hardIssues,
    matchedProductTokens,
    reviewedAt: `${malaysiaNow()} GMT+8`,
  };
}

function inferLengthPolishKind(post) {
  const title = String(post.productTitle || "").toLowerCase();
  if (/sambal|nyet|khairulaming/.test(title)) return "sambal";
  if (/poh\s*kong|\bgold\b|\bemas\b|bunga raya|24k|999/.test(title)) return "gold";
  if (/solar|outdoor|street|lampu jalan|waterproof|laman|pagar|porch/.test(title)) return "solar";
  if (/marble|flexi\s*marble|wallpaper|wall\s*sheet|dinding/.test(title)) return "marble";
  if (/fairy|dawai|kelip|string\s*light/.test(title)) return "dawai";

  const primary = [post.productCategory, post.generatedLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const haystack = [
    post.productTitle,
    post.productCategory,
    post.generatedLabel,
    post.main,
    post.reply1,
    post.reply2,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/sambal|nyet|khairulaming|pedas|lauk|makan|nasi/.test(primary)) return "sambal";
  if (/poh\s*kong|\bgold\b|\bemas\b|bunga raya|24k|999/.test(primary)) return "gold";
  if (/solar|outdoor|street|lampu jalan|waterproof|laman|pagar|porch/.test(primary)) return "solar";
  if (/marble|flexi\s*marble|dinding|wall\s*sheet|wallpaper|renovate/.test(primary)) return "marble";
  if (/dawai|fairy|kelip|string\s*light|cahaya\s*warm/.test(primary)) return "dawai";
  if (/sambal|nyet|khairulaming|pedas|lauk|makan|nasi/.test(haystack)) return "sambal";
  if (/poh\s*kong|\bgold\s*bar\b|\bemas\b|bunga raya|24k|999/.test(haystack)) return "gold";
  if (/solar|outdoor|street|lampu jalan|waterproof|laman|pagar|porch/.test(haystack)) return "solar";
  if (/marble|flexi\s*marble|dinding|wall\s*sheet|wallpaper|renovate/.test(haystack)) return "marble";
  if (/dawai|fairy|kelip|string\s*light|cahaya\s*warm/.test(haystack)) return "dawai";
  return "generic";
}

const lengthPolishShortFillers = [
  " Kecil tapi terasa.",
  " Itu pun dah cukup.",
  " Mula kecil pun cukup.",
  " Mudah nak mula.",
  " Tak perlu berlebihan.",
  " Rasa lebih kemas.",
  " Simple tapi berguna.",
];

const lengthPolishBanks = {
  marble: {
    main: [
      " Kadang rumah bukan perlu besar, cuma perlu satu sudut yang nampak dijaga.",
      " Bila mata sedap tengok, hati pun rasa kurang serabut bila masuk rumah.",
      " Sikit perubahan pada dinding pun boleh buat ruang terasa lebih hidup.",
    ],
    reply1: [
      " Yang aku suka, perubahan macam ni tak perlu kacau satu rumah pun.",
      " Mula dari satu bahagian kecil pun cukup untuk rasa rumah ada jiwa.",
      " Bila ruang nampak kemas, mood balik rumah pun rasa lebih ringan.",
    ],
    reply2: [
      " Sesuai kalau nak mula dari satu dinding dulu, terutama ruang TV atau bilik.",
      " Boleh survey corak dan ukuran yang ngam sebelum mula tampal perlahan-lahan.",
      " Vibe marble tu bantu ruang nampak clean tanpa perlu renovate besar.",
    ],
  },
  dawai: {
    main: [
      " Kadang cahaya lembut sikit pun boleh ubah mood bilik yang hambar.",
      " Bila malam tak terlalu silau, kepala pun rasa lebih mudah reda.",
      " Bilik kecil pun boleh rasa cozy bila suasana dia kena dengan hati.",
    ],
    reply1: [
      " Tak perlu deco banyak, cukup ada satu sudut yang nampak hidup.",
      " Yang best, benda kecil macam ni mudah alih ikut mood dan ruang.",
      " Bila bilik ada cahaya warm, rasa nak duduk diam pun jadi sedap.",
    ],
    reply2: [
      " Sesuai untuk kepala katil, meja kerja, rak kecil atau tepi cermin.",
      " Boleh pilih panjang ikut ruang dan susun ikut mood bilik sendiri.",
      " Kalau ruang rasa kosong, lampu kecil ni boleh jadi permulaan yang mudah.",
    ],
  },
  solar: {
    main: [
      " Bila luar rumah terang sikit, hati pun rasa kurang risau waktu malam.",
      " Kadang rasa selamat bermula dari kawasan yang selalu kita abaikan.",
      " Balik lewat pun rasa lebih tenang bila depan rumah tak gelap sangat.",
    ],
    reply1: [
      " Bukan nak nampak mewah, cuma nak rumah rasa lebih terjaga.",
      " Perubahan kecil ni terasa setiap kali keluar masuk rumah waktu malam.",
      " Bila tetamu datang malam pun, kawasan depan nampak lebih kemas dan jelas.",
    ],
    reply2: [
      " Sesuai untuk porch, pagar, laman atau laluan kecil yang selalu gelap.",
      " Bila cahaya auto menyala malam, kawasan luar terus rasa lebih terjaga.",
      " Kalau ada sudut gelap, boleh mula dengan satu lampu dulu sebelum tambah lain.",
    ],
  },
  sambal: {
    main: [
      " Kadang yang kita cari cuma lauk ringkas yang buat nasi panas rasa cukup.",
      " Bila penat kerja, benda paling lega ialah makanan cepat yang masih ada rasa.",
      " Hari biasa pun boleh rasa lebih baik bila makan tak hambar sangat.",
    ],
    reply1: [
      " Bukan setiap hari kita rajin masak lauk penuh, tapi perut tetap nak puas.",
      " Masa macam ni, satu benda pedas yang kena tekak boleh selamatkan mood makan.",
      " Paling best bila boleh makan dengan telur, ayam goreng, roti atau nasi kosong.",
    ],
    reply2: [
      " Sesuai simpan di rumah untuk hari malas masak tapi tetap nak makan sedap.",
      " Boleh jadi penambah rasa untuk nasi panas, lauk ringkas atau bekal cepat.",
      " Kalau suka sambal ready-to-eat yang mudah, boleh survey pilihan ni dulu.",
    ],
  },
  gold: {
    main: [
      " Kadang kita cuma nak mula simpan sesuatu yang kecil tapi terasa bermakna.",
      " Bukan semua simpanan perlu nampak besar; yang penting kita mula dengan sedar.",
      " Ada rasa puas bila beli sesuatu yang bukan sekadar cantik, tapi boleh disimpan.",
    ],
    reply1: [
      " Aku suka idea mula kecil, sebab tak semua orang mampu terus beli berat besar.",
      " Untuk hadiah pun nampak kemas, sebab nilainya rasa lebih personal dan tersimpan.",
      " Yang penting, beli ikut kemampuan sendiri dan faham tujuan simpanan tu.",
    ],
    reply2: [
      " Gold bar kecil macam ni sesuai untuk mula kenal simpanan emas secara perlahan.",
      " Boleh semak detail produk, berat dan seller dulu sebelum buat keputusan.",
      " Ini bukan janji untung, cuma pilihan untuk orang yang suka simpan aset fizikal.",
    ],
  },
  generic: {
    main: [
      " Kadang benda kecil yang dekat dengan rutin harian boleh bagi rasa lega.",
      " Bila hidup tengah padat, perubahan kecil pun terasa besar pada emosi.",
      " Yang kita cari sebenarnya cuma cara mudah untuk rasa hari lebih ringan.",
    ],
    reply1: [
      " Mula-mula nampak remeh, tapi bila digunakan hari-hari, baru rasa bezanya.",
      " Tak perlu tunggu semua sempurna baru mula ubah satu bahagian kecil.",
      " Yang penting, benda tu praktikal dan kena dengan masalah harian sendiri.",
    ],
    reply2: [
      " Kalau rasa sesuai dengan rutin sendiri, boleh survey detail produk dulu.",
      " Semak saiz, fungsi dan kegunaan supaya beli ikut keperluan sebenar.",
      " Boleh mula dari satu barang yang paling dekat dengan masalah harian.",
    ],
  },
};

function compactThreadText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function singleLineThreadText(value) {
  return compactThreadText(value).replace(/\s+/g, " ").trim();
}

function cleanThreadCopyForTarget(value) {
  return singleLineThreadText(value)
    .replace(/\btakde\b/gi, "tak ada")
    .replace(/\btak tau\b/gi, "tak tahu")
    .replace(/\baku tau\b/gi, "aku tahu")
    .replace(/\bjek\b/gi, "je")
    .replace(/\bready\b(?!-to-eat)/gi, "sedia")
    .replace(/\bsolution\b/gi, "jalan")
    .replace(/\btry\b/gi, "cuba")
    .replace(/\bdecide\b/gi, "buat keputusan")
    .replace(/\bstart\b/gi, "mula")
    .replace(/\bthen\b/gi, "lepas tu")
    .replace(/([.!?])(?=[A-ZÀ-ÖØ-Þ])/g, "$1 ")
    .replace(/\bKalau nak (?:tengok|survey|lihat),?\s*(?:klik\s*)?(?:sini|pilihan)?\s*:?\s+(?=[A-Z])/gi, "")
    .replace(/\bKalau nak (?:tengok|survey|lihat)\.\s*/gi, "")
    .replace(/\bKalau nak cuba,\s+(?=[A-Z])/gi, "")
    .replace(/\bKalau nak,\s+(?=[A-Z])/gi, "")
    .replace(/\bKalau nak\.\s*/gi, "")
    .replace(/\bboleh survey dulu\.\s+(?=Kalau|Jika|Untuk)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trimThreadCopyAtWord(text, maxLength = threadPostTargetMaxChars) {
  const clean = cleanThreadCopyForTarget(text);
  if (clean.length <= maxLength) return clean;
  let cut = clean.slice(0, maxLength).trim();
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.max(40, Math.floor(maxLength * 0.72))) cut = cut.slice(0, lastSpace).trim();
  return cut.replace(/[,.!?;:]+$/g, ".").replace(/\s+\./g, ".");
}

function rotateLengthBank(items, seed) {
  const values = Array.isArray(items) ? items : [];
  if (!values.length) return [];
  const offset = Math.abs(seed) % values.length;
  return values.slice(offset).concat(values.slice(0, offset));
}

function appendSentence(base, sentence) {
  const cleanBase = String(base || "")
    .trim()
    .replace(/[,;]\s*$/g, ".");
  const cleanSentence = String(sentence || "").trim();
  if (!cleanSentence) return cleanBase;
  if (!cleanBase) return cleanSentence;
  const separator = /[.!?:…]$|[\u{1F300}-\u{1FAFF}]$/u.test(cleanBase) ? " " : ". ";
  return `${cleanBase}${separator}${cleanSentence}`;
}

function appendCopyToTarget(text, kind, part, seed, maxLength = threadPostTargetMaxChars) {
  let output = cleanThreadCopyForTarget(text);
  if (output.length > threadPostTargetMaxChars) output = trimThreadCopyAtWord(output, maxLength);
  const bank = lengthPolishBanks[kind] || lengthPolishBanks.generic;
  const candidates = [
    ...rotateLengthBank(bank[part], seed),
    ...rotateLengthBank(lengthPolishBanks.generic[part], seed + 1),
    ...rotateLengthBank(lengthPolishShortFillers, seed + 2),
  ];
  let guard = 0;
  while (output.length < threadPostTargetMinChars && guard < 8) {
    let added = false;
    for (const candidate of candidates) {
      const sentence = String(candidate || "").trim();
      if (!sentence || output.includes(sentence)) continue;
      const next = appendSentence(output, sentence);
      if (next.length <= maxLength) {
        output = next;
        added = true;
        break;
      }
    }
    if (!added && maxLength < threadPostMaxChars) return appendCopyToTarget(output, kind, part, seed + 2, threadPostMaxChars);
    if (!added) break;
    guard += 1;
  }
  if (output.length > threadPostTargetMaxChars) output = trimThreadCopyAtWord(output, threadPostTargetMaxChars);
  return output;
}

function getPostAffiliateLink(post, scheduleData) {
  const fromPost = String(post.affiliateLink || "").trim();
  if (fromPost) return fromPost;
  const fromSchedule = String(scheduleData?.affiliate_link || "").trim();
  if (fromSchedule) return fromSchedule;
  const found = String(post.reply2 || "").match(/https?:\/\/\S+/i);
  return found ? found[0] : "";
}

function normalizeReply2ToTarget(post, scheduleData, kind, seed) {
  const link = getPostAffiliateLink(post, scheduleData);
  let body = String(post.reply2 || "").replace(link, "");
  body = cleanThreadCopyForTarget(body)
    .replace(/\s*(kalau\s+nak\s+)?(tengok|survey|lihat|klik|cuba)\s*(sini|pilihan|dulu|juga|malam\s*ni|malam\s*ini)?\s*[:,]?\s*$/i, "")
    .replace(/\s*(boleh\s*)?(tengok|survey|lihat)\s*(sini|pilihan)?\s*[:,]?\s*$/i, "")
    .replace(/\s*Kalau[^.?!]{0,110},\s*boleh\.?$/i, "")
    .replace(/\s*Kalau\s+nak\s*,?\s*boleh\.?$/i, "")
    .replace(/\s*Kalau\s+nak\s*[,.]?\s*$/i, "")
    .replace(/Kalau nak cuba juga,\s*Boleh/gi, "Kalau nak cuba juga, boleh")
    .replace(/Kalau nak\s+Boleh/gi, "Kalau nak, boleh")
    .replace(/Jangan lupa link:\s*/gi, "")
    .replace(/Link dekat sini:\s*/gi, "")
    .replace(/Link:\s*/gi, "")
    .trim();
  const separator = link ? "\n" : "";
  const totalLength = () => body.length + separator.length + link.length;
  const maxBodyTarget = threadPostTargetMaxChars - separator.length - link.length;
  const maxBodyHard = threadPostMaxChars - separator.length - link.length;
  if (body.length > maxBodyTarget) body = trimThreadCopyAtWord(body, Math.max(40, maxBodyTarget));

  const bank = lengthPolishBanks[kind] || lengthPolishBanks.generic;
  const candidates = [
    ...rotateLengthBank(bank.reply2, seed),
    ...rotateLengthBank(lengthPolishBanks.generic.reply2, seed + 1),
    ...rotateLengthBank(lengthPolishShortFillers, seed + 2),
  ];
  let guard = 0;
  while (totalLength() < threadPostTargetMinChars && guard < 8) {
    let added = false;
    for (const candidate of candidates) {
      const sentence = String(candidate || "").trim();
      if (!sentence || body.includes(sentence)) continue;
      const next = appendSentence(body, sentence);
      if (next.length <= maxBodyTarget) {
        body = next;
        added = true;
        break;
      }
    }
    if (!added) {
      for (const candidate of candidates) {
        const sentence = String(candidate || "").trim();
        if (!sentence || body.includes(sentence)) continue;
        const next = appendSentence(body, sentence);
        if (next.length <= maxBodyHard) {
          body = next;
          added = true;
          break;
        }
      }
    }
    if (!added) break;
    guard += 1;
  }

  if (totalLength() > threadPostTargetMaxChars) body = trimThreadCopyAtWord(body, Math.max(40, maxBodyTarget));
  return link ? `${body}\n${link}` : body;
}

function applyThreadLengthTarget(post, number, scheduleData, reason = "Auto Audit length target") {
  if (!post) return false;
  const before = [post.main, post.reply1, post.reply2].map((value) => String(value || ""));
  const kind = inferLengthPolishKind(post);
  post.main = appendCopyToTarget(post.main, kind, "main", number);
  post.reply1 = appendCopyToTarget(post.reply1, kind, "reply1", number + 1);
  post.reply2 = normalizeReply2ToTarget(post, scheduleData, kind, number + 2);
  const affiliateLink = getPostAffiliateLink(post, scheduleData);
  if (affiliateLink && !post.affiliateLink) post.affiliateLink = affiliateLink;

  const lengths = [post.main, post.reply1, post.reply2].map((value) => String(value || "").length);
  const targetOk = lengths.every((length) => length >= threadPostTargetMinChars && length <= threadPostTargetMaxChars);
  const maxOk = lengths.every((length) => length <= threadPostMaxChars);
  const checks = Array.isArray(post.qualityChecks) ? post.qualityChecks : [];
  const setCheck = (key, label, passed) => {
    let check = checks.find((item) => item.key === key);
    if (!check) {
      check = { key, label, passed: Boolean(passed) };
      checks.push(check);
    }
    check.label = label;
    check.passed = Boolean(passed);
  };
  setCheck("length", `Setiap post <=${threadPostMaxChars} aksara`, maxOk);
  setCheck("target_length", `Manfaatkan ruang ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara`, targetOk);
  post.qualityChecks = checks;
  post.threadLengthTarget = {
    min: threadPostTargetMinChars,
    max: threadPostTargetMaxChars,
    hardMax: threadPostMaxChars,
    passed: targetOk,
    lengths,
  };
  post.lengthAdjustedAt = `${malaysiaNow()} GMT+8`;
  post.lengthAdjustmentReason = reason;
  return before.some((value, index) => value !== [post.main, post.reply1, post.reply2][index]);
}

function syncLengthAdjustedPostToRuns(runs, post, number) {
  for (const run of runs) {
    let runTouched = false;
    for (const version of run.versions || []) {
      if (Number(version.scheduleNumber) !== number) continue;
      version.mainLength = String(post.main || "").length;
      version.reply1Length = String(post.reply1 || "").length;
      version.reply2Length = String(post.reply2 || "").length;
      version.qualityStatus = post.qualityStatus || version.qualityStatus;
      version.qualityScore = post.qualityScore || version.qualityScore;
      version.qualityChecks = post.qualityChecks || version.qualityChecks;
      version.qualityReasons = post.qualityReasons || version.qualityReasons || [];
      version.lengthAdjustedAt = post.lengthAdjustedAt;
      version.lengthAdjustmentReason = post.lengthAdjustmentReason;
      version.updatedAt = `${malaysiaNow()} GMT+8`;
      runTouched = true;
    }
    if (runTouched) run.lengthAdjustedAt = `${malaysiaNow()} GMT+8`;
  }
}

function buildPublisherPreflightLocal(number, post, scheduleData, statusData) {
  const productTitle = String(post.productTitle || "").trim();
  const productCategory = String(post.productCategory || "").trim() || inferProductCategoryFromText(
    [post.main, post.reply1, post.reply2, post.generatedLabel, post.imageUrl].filter(Boolean).join(" "),
  );
  const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
  const series = getThreadSeries(post);
  const checks = [];
  const hardReasons = [];
  const addCheck = (key, label, passed, detail = "", severity = "hard") => {
    const check = { key, label, passed: Boolean(passed), detail, severity };
    checks.push(check);
    if (!check.passed && severity === "hard") hardReasons.push(detail || label);
  };

  const scheduledOk = uniqueSortedNumbers(statusData.scheduled).includes(number);
  addCheck("scheduled", "Siri berada dalam Pending scheduled", scheduledOk, "Siri belum berada dalam queue Pending.");

  const completeOk = series.every((item) => item.text);
  addCheck("complete", "POST UTAMA, REPLY 1 dan REPLY 2 lengkap", completeOk, "Ada bahagian post yang kosong.");

  const lengths = series.map((item) => item.text.length);
  const maxLengthOk = lengths.every((length) => length > 0 && length <= threadPostMaxChars);
  addCheck("max_length", `Setiap post <=${threadPostMaxChars} aksara`, maxLengthOk, `Ada post melebihi ${threadPostMaxChars} aksara.`);

  const targetLengthOk = lengths.every(
    (length) => length >= threadPostTargetMinChars && length <= threadPostTargetMaxChars,
  );
  addCheck(
    "target_length",
    `Setiap post manfaatkan ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara`,
    targetLengthOk,
    `Ada post belum berada dalam sasaran ${threadPostTargetMinChars}-${threadPostTargetMaxChars} aksara.`,
  );

  const affiliateOk = affiliateLink ? String(post.reply2 || "").trim().endsWith(affiliateLink) : /https?:\/\/\S+$/i.test(String(post.reply2 || ""));
  addCheck("affiliate", "Reply 2 tamat dengan link affiliate tepat", affiliateOk, "Reply 2 tidak tamat dengan link affiliate.");

  const productTitleOk = isUsefulProductTitle(productTitle);
  addCheck("product_title", "Tajuk produk sebenar jelas", productTitleOk, "Tajuk produk belum cukup jelas untuk pembaca.");

  const productVerifiedOk = productTitleOk && (post.productVerified !== false || shouldAutopilotVerifyProduct(productTitle, post));
  addCheck("product_verified", "Produk disahkan oleh Product Intel/DeepSeek", productVerifiedOk, "Produk belum cukup confidence untuk autopilot publish.");

  const quality = auditStoryQuality(post, { productTitle, productCategory, affiliateLink }, affiliateLink);
  for (const check of quality.checks || []) {
    checks.push({
      key: `quality_${check.key}`,
      label: check.label,
      passed: Boolean(check.passed),
      detail: check.passed ? "" : check.label,
      severity: check.key === "target_length" ? "hard" : "soft",
    });
  }
  if (quality.status !== "passed") {
    hardReasons.push(...(quality.reasons || ["Quality Gate belum lulus."]));
  }

  const passedCount = checks.filter((check) => check.passed).length;
  const score = checks.length ? Math.round((passedCount / checks.length) * 100) : 0;
  return {
    status: hardReasons.length ? "blocked" : "passed",
    allow: hardReasons.length === 0,
    score,
    checks,
    reasons: [...new Set(hardReasons)].slice(0, 8),
    lengths,
    productTitle,
    productCategory,
    affiliateLink,
    quality,
  };
}

async function askDeepSeekPublisherPreflight({ number, post, localReport }) {
  if (!publisherPreflightAiEnabled) {
    return {
      checked: false,
      allow: true,
      status: "ai_disabled",
      score: localReport.score,
      reasons: ["DeepSeek preflight dimatikan melalui konfigurasi."],
      checks: [],
    };
  }

  let apiKey = "";
  try {
    apiKey = await getApiKey();
  } catch {
    apiKey = "";
  }
  if (!apiKey) {
    return {
      checked: false,
      allow: false,
      retryable: true,
      status: "waiting_ai",
      score: localReport.score,
      reasons: ["DeepSeek API key tiada. Live publish ditahan sehingga preflight AI boleh berjalan."],
      checks: [],
    };
  }

  const payload = {
    number,
    productTitle: localReport.productTitle,
    productCategory: localReport.productCategory,
    affiliateLink: localReport.affiliateLink,
    postLengths: localReport.lengths,
    qualityChecks: localReport.quality?.checks || [],
    text: {
      main: post.main,
      reply1: post.reply1,
      reply2: post.reply2,
    },
  };

  try {
    const response = await fetch(deepseekUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: [
              "Anda ialah final QA publisher untuk ThreadsMe, sistem affiliate Threads Malaysia.",
              "Tugas anda ialah semak sama ada siri 3 post ini selamat dan layak dipublish public.",
              "Nilai relevansi produk, hook manusia, deep storytelling, Bahasa Melayu Malaysia natural, soft-sell, claim tidak pelik, tidak spam, dan link affiliate tepat di hujung Reply 2.",
              "Tahan jika story lari daripada produk, terlalu generik, claim berlebihan, nampak scammy, ada typo mengganggu, atau tidak memberi manfaat kepada netizen Malaysia.",
              "Pulangkan JSON sahaja.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "Semak siri ini sebelum publish:",
              JSON.stringify(payload, null, 2),
              "",
              'Format wajib: {"decision":"allow|hold","score":0,"confidence":0,"checks":[{"key":"","passed":true,"note":""}],"reasons":[],"summary":""}',
            ].join("\n"),
          },
        ],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.12,
        max_tokens: 1800,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        checked: false,
        allow: false,
        retryable: true,
        status: "ai_error",
        score: localReport.score,
        reasons: [`DeepSeek preflight gagal ${response.status}: ${raw.slice(0, 180)}`],
        checks: [],
      };
    }

    const data = JSON.parse(raw);
    const parsed = parseJsonObjectFromText(data.choices?.[0]?.message?.content || "{}");
    const score = normalizeDeepSeekPercent(parsed.score);
    const decision = String(parsed.decision || "").toLowerCase() === "allow" ? "allow" : "hold";
    const checks = Array.isArray(parsed.checks)
      ? parsed.checks.slice(0, 10).map((check) => ({
          key: String(check.key || "deepseek").slice(0, 80),
          label: String(check.key || "DeepSeek QA").slice(0, 120),
          passed: Boolean(check.passed),
          detail: String(check.note || "").slice(0, 220),
          severity: "hard",
        }))
      : [];
    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.map((reason) => String(reason || "").trim()).filter(Boolean).slice(0, 8)
      : [];
    const allow = decision === "allow" && score >= publisherPreflightMinScore && checks.every((check) => check.passed !== false);
    return {
      checked: true,
      allow,
      retryable: false,
      status: allow ? "passed_ai" : "blocked_ai",
      decision,
      score,
      confidence: normalizeDeepSeekPercent(parsed.confidence || score),
      checks,
      reasons: reasons.length
        ? reasons
        : allow
          ? []
          : [`DeepSeek score ${score}, bawah minimum ${publisherPreflightMinScore}.`],
      summary: String(parsed.summary || "").slice(0, 260),
      usage: data.usage || null,
    };
  } catch (error) {
    return {
      checked: false,
      allow: false,
      retryable: true,
      status: "ai_error",
      score: localReport.score,
      reasons: [`DeepSeek preflight error: ${error.message}`],
      checks: [],
    };
  }
}

function mergePreflightChecks(localReport, aiReport) {
  const localChecks = (localReport.checks || []).map((check) => ({
    key: check.key,
    label: check.label,
    passed: Boolean(check.passed),
    detail: check.detail || "",
    layer: "local",
  }));
  const aiChecks = (aiReport.checks || []).map((check) => ({
    key: check.key.startsWith("deepseek_") ? check.key : `deepseek_${check.key}`,
    label: check.label || check.key || "DeepSeek QA",
    passed: Boolean(check.passed),
    detail: check.detail || "",
    layer: "deepseek",
  }));
  return [...localChecks, ...aiChecks].slice(0, 24);
}

function normalizeDeepSeekPercent(value) {
  const raw = String(value ?? "").trim();
  const matched = raw.match(/\d+(?:\.\d+)?/);
  const numeric = Number(matched ? matched[0] : value || 0);
  if (!Number.isFinite(numeric)) return 0;
  if (numeric > 0 && numeric <= 10) return Math.round(numeric * 10);
  return Math.round(Math.max(0, Math.min(numeric, 100)));
}

function markPostPreflight(post, status, localReport, aiReport, reasons = []) {
  const checkedAt = `${malaysiaNow()} GMT+8`;
  const score = aiReport?.checked ? Math.min(localReport.score, aiReport.score) : localReport.score;
  post.publishPreflightStatus = status;
  post.publishPreflightScore = score;
  post.publishPreflightAt = checkedAt;
  post.publishPreflightReasons = reasons.slice(0, 10);
  post.publishPreflightChecks = mergePreflightChecks(localReport, aiReport || { checks: [] });
  post.publishPreflightAi = {
    enabled: publisherPreflightAiEnabled,
    checked: Boolean(aiReport?.checked),
    status: aiReport?.status || "not_checked",
    decision: aiReport?.decision || "",
    score: aiReport?.score ?? null,
    confidence: aiReport?.confidence ?? null,
    summary: aiReport?.summary || "",
    retryable: Boolean(aiReport?.retryable),
  };
  post.publishPreflightStrategy = [
    "Quality Gate tempatan",
    "Product Intel produk",
    "DeepSeek final QA sebelum publish",
  ];
  return checkedAt;
}

async function writePreflightStatus({ scheduleData, statusData, number, post, status, note, holdReview = false }) {
  const publisher = statusData.publisher || {};
  let nextStatus = {
    ...statusData,
    lastPublisherPreflightAt: post.publishPreflightAt || `${malaysiaNow()} GMT+8`,
    lastPublisherPreflightNumber: number,
    lastPublisherPreflightStatus: status,
    lastPublisherPreflightNote: note,
    systemStatus: status === "passed" ? "Publisher preflight - lulus" : "Publisher preflight - ditahan",
    systemNote: note,
  };

  if (holdReview) {
    post.qualityStatus = "review";
    post.qualityScore = Math.min(Number(post.qualityScore || post.publishPreflightScore || 0), 64);
    post.qualityReasons = post.publishPreflightReasons?.length
      ? post.publishPreflightReasons
      : ["Publisher Preflight tahan siri ini sebelum publish."];
    const automation = buildAutomatedStatus(scheduleData, nextStatus, Date.now(), {
      autoCompletePastSlots: false,
      publisher,
    });
    nextStatus = {
      ...automation.status,
      lastPublisherPreflightAt: post.publishPreflightAt,
      lastPublisherPreflightNumber: number,
      lastPublisherPreflightStatus: status,
      lastPublisherPreflightNote: note,
      systemStatus: "Publisher preflight - ditahan",
      systemNote: note,
    };
  }

  await writeJsonFile(scheduleFile, scheduleData);
  await writeJsonFile(statusFile, nextStatus);
  await syncStoryRunsWithStatus(nextStatus, scheduleData);
  return nextStatus;
}

async function runPublisherPreflight(number, { scheduleData, statusData, config }) {
  if (!publisherPreflightEnabled) {
    return {
      allow: true,
      status: "disabled",
      reason: "Publisher preflight dimatikan.",
      statusData,
    };
  }

  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const post = posts[number - 1];
  if (!post) throw new HttpError(404, `Siri ${number} tidak wujud dalam jadual.`);

  let touched = false;
  let runs = null;
  const resolveCache = new Map();
  if (post.source === "generated" && (!String(post.productTitle || "").trim() || post.productVerified === false)) {
    const resolved = await resolveProductForPost(post, scheduleData, number, resolveCache);
    touched = touched || Boolean(resolved.applied || resolved.tried);
  }

  let localReport = buildPublisherPreflightLocal(number, post, scheduleData, statusData);
  let regenerated = { updatedNumbers: [], failedNumbers: [], fallbackCount: 0 };
  if (!localReport.allow && post.source === "generated" && String(post.productTitle || "").trim() && post.productVerified !== false) {
    post.qualityStatus = "review";
    post.qualityReasons = localReport.reasons;
    runs = await readStoryRuns();
    regenerated = await autoRegenerateQualityPosts(scheduleData, runs, [number]);
    if (regenerated.updatedNumbers.includes(number)) {
      touched = true;
      localReport = buildPublisherPreflightLocal(number, post, scheduleData, statusData);
    }
  }

  let aiReport = {
    checked: false,
    allow: true,
    status: "not_needed",
    score: localReport.score,
    reasons: [],
    checks: [],
  };
  if (localReport.allow) {
    aiReport = await askDeepSeekPublisherPreflight({ number, post, localReport });
  }

  const strictAiRequired = config.dryRun === false && publisherPreflightAiEnabled;
  if (localReport.allow && aiReport.allow) {
    markPostPreflight(post, aiReport.checked ? "passed_ai" : "passed_local", localReport, aiReport, []);
    const note = aiReport.checked
      ? `Siri ${number} lulus Publisher Preflight DeepSeek. Score ${aiReport.score}.`
      : `Siri ${number} lulus Publisher Preflight tempatan.`;
    if (runs && regenerated.updatedNumbers.length) await writeStoryRuns(runs);
    const nextStatus = await writePreflightStatus({
      scheduleData,
      statusData,
      number,
      post,
      status: post.publishPreflightStatus,
      note,
      holdReview: false,
    });
    return {
      allow: true,
      status: post.publishPreflightStatus,
      reason: note,
      localReport,
      aiReport,
      regenerated,
      touched: true,
      statusData: nextStatus,
    };
  }

  if (localReport.allow && !aiReport.checked && strictAiRequired) {
    const reasons = aiReport.reasons?.length ? aiReport.reasons : ["DeepSeek preflight belum dapat disahkan."];
    markPostPreflight(post, "waiting_ai", localReport, aiReport, reasons);
    const note = `Siri ${number} belum dipublish kerana Publisher Preflight menunggu DeepSeek. ${reasons[0]}`;
    if (runs && regenerated.updatedNumbers.length) await writeStoryRuns(runs);
    const nextStatus = await writePreflightStatus({
      scheduleData,
      statusData,
      number,
      post,
      status: "waiting_ai",
      note,
      holdReview: false,
    });
    return {
      allow: false,
      retryable: true,
      status: "waiting_ai",
      reason: note,
      localReport,
      aiReport,
      regenerated,
      touched,
      statusData: nextStatus,
    };
  }

  if (localReport.allow && !aiReport.checked && !strictAiRequired) {
    const reasons = aiReport.reasons?.length ? aiReport.reasons : ["DeepSeek preflight tidak disahkan, tetapi mod selamat membenarkan semakan tempatan."];
    markPostPreflight(post, "passed_local", localReport, aiReport, reasons);
    const note = `Siri ${number} lulus Publisher Preflight tempatan. ${reasons[0]}`;
    if (runs && regenerated.updatedNumbers.length) await writeStoryRuns(runs);
    const nextStatus = await writePreflightStatus({
      scheduleData,
      statusData,
      number,
      post,
      status: "passed_local",
      note,
      holdReview: false,
    });
    return {
      allow: true,
      status: "passed_local",
      reason: note,
      localReport,
      aiReport,
      regenerated,
      touched: true,
      statusData: nextStatus,
    };
  }

  const reasons = localReport.allow
    ? aiReport.reasons || [`DeepSeek score bawah minimum ${publisherPreflightMinScore}.`]
    : localReport.reasons;
  markPostPreflight(post, localReport.allow ? "blocked_ai" : "blocked_local", localReport, aiReport, reasons);
  const note = `Siri ${number} ditahan Publisher Preflight: ${reasons[0] || "Quality belum cukup selamat untuk publish."}`;
  if (runs && regenerated.updatedNumbers.length) await writeStoryRuns(runs);
  const nextStatus = await writePreflightStatus({
    scheduleData,
    statusData,
    number,
    post,
    status: post.publishPreflightStatus,
    note,
    holdReview: true,
  });
  return {
    allow: false,
    retryable: false,
    status: post.publishPreflightStatus,
    reason: note,
    localReport,
    aiReport,
    regenerated,
    touched: true,
    statusData: nextStatus,
  };
}

function buildPublisherPreflightSummary(scheduleData, statusData) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const scheduled = uniqueSortedNumbers(statusData.scheduled);
  const dueNumbers = scheduled.filter((number) => {
    const post = posts[number - 1];
    return post && parseScheduleSlot(post.slot).getTime() <= Date.now();
  });
  const statuses = posts.reduce((acc, post) => {
    const status = post.publishPreflightStatus || "belum_semak";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const blockedNumbers = posts
    .map((post, index) => ({ post, number: index + 1 }))
    .filter(({ post }) => ["blocked_local", "blocked_ai", "waiting_ai"].includes(post.publishPreflightStatus))
    .map(({ number }) => number);

  return {
    enabled: publisherPreflightEnabled,
    aiEnabled: publisherPreflightAiEnabled,
    minScore: publisherPreflightMinScore,
    strategy: ["Quality Gate", "Product Intel", "DeepSeek final QA"],
    lastAt: statusData.lastPublisherPreflightAt || "",
    lastNumber: statusData.lastPublisherPreflightNumber || null,
    lastStatus: statusData.lastPublisherPreflightStatus || "",
    lastNote: statusData.lastPublisherPreflightNote || "",
    dueNumbers,
    dueCount: dueNumbers.length,
    passedCount: (statuses.passed_ai || 0) + (statuses.passed_local || 0),
    blockedCount: blockedNumbers.length,
    blockedNumbers: blockedNumbers.slice(0, 25),
    waitingAiCount: statuses.waiting_ai || 0,
  };
}

function limitPostText(text, maxLength = threadPostMaxChars) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength).replace(/\s+\S*$/g, "").trim();
}

function inferFallbackProduct(input) {
  const context = [
    input.productTitle,
    input.productCategory,
    input.sourceText,
    input.imageNotes,
    input.imageName,
    input.imageUrl,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (/sambal|cili|chili|sos|pedas|makan|lauk/.test(context)) {
    return {
      name: "sambal ni",
      moment: "bila makan ringkas pun rasa macam ada benda yang cukup",
      bridge: "Kalau hari-hari sibuk dan nak lauk yang mudah naikkan selera",
    };
  }

  if (/marble|dinding|wall|sheet|wallpaper|rumah|deko|dekor/.test(context)) {
    return {
      name: "flexi marble sheet ni",
      moment: "bila nak mula kemaskan satu sudut rumah tanpa renovate besar",
      bridge: "Kalau tengah cari cara kecil untuk bagi ruang nampak lebih kemas",
    };
  }

  if (/lampu|light|led|fairy|bilik|meja/.test(context)) {
    return {
      name: "lampu kecil ni",
      moment: "bila ruang biasa tiba-tiba rasa lebih tenang waktu malam",
      bridge: "Kalau nak mula ubah mood bilik atau meja kerja dengan bajet kecil",
    };
  }

  if (/organizer|storage|rak|kotak|susun|kemas/.test(context)) {
    return {
      name: "organizer ni",
      moment: "bila barang yang selalu bersepah akhirnya ada tempat sendiri",
      bridge: "Kalau tengah cuba kemaskan rutin rumah sedikit demi sedikit",
    };
  }

  return {
    name: "produk ni",
    moment: "bila satu benda kecil boleh buat rutin harian rasa kurang berat",
    bridge: "Kalau tengah cari benda kecil yang boleh bantu mulakan perubahan",
  };
}

function buildFallbackStories(input, affiliateLink) {
  const requested = Math.max(1, Math.min(Number(input.versions || input.postsPerDay || 3), maxPostingPerDay));
  const product = inferFallbackProduct(input);
  const theme = String(input.theme || "auto");
  const painHooks = [
    "Kadang bukan kita malas. Kita cuma penat nak hadap benda kecil yang sama setiap hari.",
    "Ada hari, benda remeh pun boleh buat kepala rasa penuh bila balik rumah.",
    "Pelik kan, hidup nampak biasa tapi dalam hati rasa macam ruang sendiri pun belum cukup tenang.",
    "Aku pernah rasa serba tak kena walaupun masalah tu nampak kecil kalau cerita dekat orang.",
    "Bila rutin dah padat, kita mula cari benda yang boleh bagi rasa lega tanpa tambah kerja baru.",
  ];
  const hopeHooks = [
    "Kadang perubahan besar mula dari satu keputusan kecil yang kita buat diam-diam.",
    "Aku suka bila benda kecil boleh bagi rasa baru dalam hari yang asalnya biasa-biasa je.",
    "Tak semua benda kena tunggu sempurna baru kita mula jaga ruang dan rutin sendiri.",
    "Ada satu rasa lega bila kita jumpa cara mudah untuk bantu diri sendiri sedikit demi sedikit.",
    "Rumah dan rutin tak perlu perfect. Cukup ada satu benda yang buat kita rasa lebih ringan.",
  ];
  const stories = [
    "Balik kerja, aku selalu fikir nak rehat. Tapi mata tetap nampak benda yang buat mood jatuh sikit. Bukan besar pun, cuma bila berulang hari-hari, rasa penat tu melekat sampai malam.",
    "Mula-mula aku biar je sebab fikir nanti ada masa. Lama-lama baru perasan, benda kecil yang berulang tu yang paling banyak makan tenaga dan buat rumah/rutin rasa tak siap.",
    "Aku belajar, tak semua masalah harian perlu solusi besar. Kadang yang kita perlukan cuma satu benda praktikal yang boleh buat hidup rasa tersusun sikit tanpa drama.",
    "Bila ada cara yang mudah, rasa macam hidup ni kurang sikit serabutnya. Tak besar pun perubahan tu, tapi cukup untuk buat kita rasa ada ruang bernafas semula.",
    "Yang aku cari sebenarnya bukan benda mahal. Aku cuma nak rutin yang nampak lebih ringan, senang dijaga, dan tak buat aku rasa kalah sebelum hari habis.",
    "Ada masa kita cuma perlukan satu permulaan kecil untuk rasa macam masih boleh kawal keadaan. Dari situ baru datang semangat nak kemaskan benda lain satu-satu.",
  ];
  const ctas = [
    "boleh tengok sini",
    "boleh survey dulu kat sini",
    "boleh cuba tengok kalau ngam",
    "boleh simpan link ni dulu",
    "boleh tengok pilihan ni",
    "boleh mula semak kat sini",
  ];

  return Array.from({ length: requested }, (_, index) => {
    const useHope = theme === "hope" || (theme === "auto" && index % 2 === 1);
    const hook = useHope ? hopeHooks[index % hopeHooks.length] : painHooks[index % painHooks.length];
    const story = stories[index % stories.length];
    const cta = ctas[index % ctas.length];
    const mainText = `${hook} Aku mula sedar benda macam ni bukan pasal nak hidup nampak sempurna, tapi pasal nak rasa tenang bila masuk ruang sendiri. Bila hati dah letih, detail kecil pun boleh jadi berat.`;
    const reply1Text = `${story} Aku tak nak tunggu semua benda ideal baru nak berubah. Aku cuma mula dari benda yang paling dekat dengan mata, tangan, dan rutin harian. Pelan-pelan, rasa serabut tu mula kurang.`;
    const reply2Text = `${product.bridge}, ${product.name} boleh jadi permulaan yang masuk akal. ${product.moment}. Bukan magic, tapi cukup untuk mula rasa ada perubahan kecil yang nampak dan terasa. Kalau rasa sesuai, ${cta}`;
    return {
      label: `Versi ${index + 1}`,
      main: limitPostText(mainText, threadPostTargetMaxChars),
      reply1: limitPostText(reply1Text, threadPostTargetMaxChars),
      reply2: attachExactAffiliateLink(reply2Text, affiliateLink),
    };
  });
}

async function generateStory(input) {
  const productTitle = String(input.productTitle || "").trim();
  if (!productTitle) {
    badRequest("Tajuk produk wajib. Masukkan nama produk Shopee supaya story tidak lari daripada produk sebenar.");
  }
  const prompt = buildPrompt(input);
  const affiliateLink = String(input.affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3").trim();
  let apiKey = "";
  try {
    apiKey = await getApiKey();
  } catch {
    apiKey = "";
  }

  if (!apiKey) {
    return {
      versions: buildFallbackStories(input, affiliateLink),
      usage: { provider: "local_fallback", reason: "missing_deepseek_key" },
      fallback: true,
      fallbackReason: "DeepSeek API key tiada. ThreadsMe guna fallback tempatan.",
    };
  }

  try {
    const response = await fetch(deepseekUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: prompt.messages,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.85,
        max_tokens: 12000,
        stream: false,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`DeepSeek API error ${response.status}: ${raw.slice(0, 300)}`);
    }

    const payload = JSON.parse(raw);
    const content = payload.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const versions = enforceGeneratedStoryRules(normalizeVersions(parsed), affiliateLink);
    if (!versions.length) throw new Error("DeepSeek tidak pulangkan versi story.");
    return {
      versions,
      usage: payload.usage || null,
      fallback: false,
    };
  } catch (error) {
    return {
      versions: buildFallbackStories(input, affiliateLink),
      usage: { provider: "local_fallback", reason: "deepseek_failed", error: error.message },
      fallback: true,
      fallbackReason: `DeepSeek gagal (${error.message}). ThreadsMe guna fallback tempatan.`,
    };
  }
}

async function saveStoryRun(input, result) {
  const runs = await readStoryRuns();
  const createdAt = `${malaysiaNow()} GMT+8`;
  const affiliateLink = String(input.affiliateLink || "").trim();
  const imageUrl = String(input.imageUrl || "").trim();
  const productTitle = String(input.productTitle || "").trim();
  const productCategory = String(input.productCategory || "").trim();
  const runId = `run-${Date.now()}`;
  const schedule = await scheduleGeneratedVersions(input, result, runId);
  const run = {
    id: runId,
    createdAt,
    productName: String(productTitle || input.imageNotes || input.sourceText || input.imageName || input.imageUrl || "Auto story Threads Malaysia").slice(0, 80),
    productTitle,
    productCategory,
    productVerified: input.productVerified !== false,
    productIntelEvidence: input.productIntelEvidence || "story_input",
    productIntelConfidence: Number(input.productIntelConfidence || 100),
    imageName: String(input.imageName || "").trim(),
    imageSource: String(input.imageSource || "").trim(),
    imageUrl,
    affiliateLink,
    postsPerDay: schedule.postsPerDay || Number(input.postsPerDay || 5),
    versions: result.versions.map((version, index) => {
      const scheduledItem = schedule.itemsByIndex?.[index] || null;
      const quality = schedule.qualityReports?.[index] || auditStoryQuality(version, input, affiliateLink);
      return {
        id: `${runId}-v${index + 1}`,
        label: version.label || `Versi ${index + 1}`,
        status: quality.status === "review" ? "review" : scheduledItem?.queueStatus || "blocked",
        scheduleNumber: scheduledItem?.number || null,
        slot: scheduledItem?.slot || "",
        mainLength: version.main.length,
        reply1Length: version.reply1.length,
        reply2Length: version.reply2.length,
        qualityStatus: quality.status,
        qualityScore: quality.score,
        qualityChecks: quality.checks,
        qualityReasons: quality.reasons,
        productTitle,
        productCategory,
        productVerified: input.productVerified !== false,
        productIntelEvidence: input.productIntelEvidence || "story_input",
        productIntelConfidence: Number(input.productIntelConfidence || 100),
      };
    }),
    schedule,
  };
  runs.push(run);
  await writeStoryRuns(runs.slice(-100));
  return run;
}

async function updateStoryRunStatus(versionId, status) {
  const allowed = new Set(["pending", "passed", "failed", "review"]);
  if (!allowed.has(status)) badRequest("Status tidak sah.");
  const runs = await readStoryRuns();
  const statusData = await readJsonFile(statusFile, {});
  let scheduleNumber = null;
  let changed = false;
  for (const run of runs) {
    for (const version of run.versions || []) {
      if (version.id === versionId) {
        version.status = status;
        version.updatedAt = `${malaysiaNow()} GMT+8`;
        scheduleNumber = Number(version.scheduleNumber) || null;
        changed = true;
      }
    }
  }
  if (!changed) throw new HttpError(404, "Versi story tidak ditemui.");

  let updatedStatus = statusData;
  if (scheduleNumber) {
    updatedStatus = {
      ...statusData,
      scheduled: removeNumber(statusData.scheduled, scheduleNumber),
      posted: removeNumber(statusData.posted, scheduleNumber),
      failed: removeNumber(statusData.failed, scheduleNumber),
      prepared: removeNumber(statusData.prepared, scheduleNumber),
      remaining: removeNumber(statusData.remaining, scheduleNumber),
      lastManualStatusAt: `${malaysiaNow()} GMT+8`,
    };

    if (status === "passed") {
      updatedStatus.posted = addNumber(updatedStatus.posted, scheduleNumber);
      updatedStatus.systemStatus = "Status manual - Lulus";
      updatedStatus.systemNote = `Siri ${scheduleNumber} ditanda Lulus daripada Status story dijana.`;
    } else if (status === "failed") {
      updatedStatus.failed = addNumber(updatedStatus.failed, scheduleNumber);
      updatedStatus.systemStatus = "Status manual - Gagal";
      updatedStatus.systemNote = `Siri ${scheduleNumber} ditanda Gagal daripada Status story dijana.`;
    } else if (status === "review") {
      updatedStatus.prepared = addNumber(updatedStatus.prepared, scheduleNumber);
      updatedStatus.systemStatus = "Status manual - Perlu Semak";
      updatedStatus.systemNote = `Siri ${scheduleNumber} ditahan sebagai Perlu Semak sebelum masuk queue aktif.`;
    } else {
      updatedStatus.remaining = addNumber(updatedStatus.remaining, scheduleNumber);
      updatedStatus.systemStatus = "Status manual - mohon Pending";
      updatedStatus.systemNote = `Siri ${scheduleNumber} diminta masuk Pending. ThreadsMe hanya akan tukar jika slot scheduled benar-benar kosong.`;
    }

    const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
    const automation = buildAutomatedStatus(scheduleData, updatedStatus);
    updatedStatus = automation.status;
    await writeJsonFile(statusFile, updatedStatus);

    for (const run of runs) {
      for (const version of run.versions || []) {
        const number = Number(version.scheduleNumber);
        if (!number) continue;
        const nextStatus = getQueueStatusForNumber(updatedStatus, number);
        if (version.status !== nextStatus) {
          version.status = nextStatus;
          version.updatedAt = `${malaysiaNow()} GMT+8`;
        }
      }
    }
  }

  await writeStoryRuns(runs);
  return { runs, status: updatedStatus };
}

function parseNumberList(value) {
  const numbers = new Set();
  for (const part of String(value || "").split(",")) {
    const clean = part.trim();
    if (!clean) continue;
    const rangeMatch = clean.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const min = Math.min(start, end);
      const max = Math.max(start, end);
      for (let number = min; number <= max; number += 1) numbers.add(number);
      continue;
    }
    const number = Number(clean);
    if (Number.isInteger(number) && number > 0) numbers.add(number);
  }
  return Array.from(numbers).sort((a, b) => a - b);
}

function productAuditSummary(scheduleData, runs) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const missingProductTitle = [];
  const unverifiedProduct = [];
  const reviewItems = [];
  const overLimit = [];
  const targetLengthIssues = [];
  const generated = [];

  posts.forEach((post, index) => {
    const number = index + 1;
    if (post.source === "generated") generated.push(number);
    if (post.source === "generated" && !String(post.productTitle || "").trim()) {
      missingProductTitle.push(number);
    }
    if (
      post.source === "generated" &&
      String(post.productTitle || "").trim() &&
      post.productVerified === false &&
      !shouldAutopilotVerifyProduct(post.productTitle, post)
    ) {
      unverifiedProduct.push(number);
    }
    if (post.qualityStatus === "review" && String(post.productTitle || "").trim()) reviewItems.push(number);
    for (const key of ["main", "reply1", "reply2"]) {
      const length = String(post[key] || "").length;
      if (length > threadPostMaxChars) overLimit.push({ number, key, length });
      if (length < threadPostTargetMinChars || length > threadPostTargetMaxChars) {
        targetLengthIssues.push({ number, key, length });
      }
    }
  });

  const runReviewItems = [];
  for (const run of runs) {
    for (const version of run.versions || []) {
      if (version.status === "review") {
        const number = Number(version.scheduleNumber);
        if (!Number.isInteger(number) || number < 1 || !posts[number - 1]) continue;
        if (number && posts[number - 1]?.qualityStatus === "review") continue;
        runReviewItems.push({
          runId: run.id,
          versionId: version.id,
          label: version.label,
          productName: run.productName,
          qualityScore: version.qualityScore,
          reasons: version.qualityReasons || [],
        });
      }
    }
  }

  const issueNumbers = uniqueSortedNumbers([
    ...missingProductTitle,
    ...unverifiedProduct,
    ...reviewItems,
    ...overLimit.map((item) => item.number),
    ...targetLengthIssues.map((item) => item.number),
  ]);

  return {
    totalPosts: posts.length,
    generatedCount: generated.length,
    issueNumbers,
    issueCount: issueNumbers.length,
    missingProductTitle,
    missingProductTitleCount: missingProductTitle.length,
    unverifiedProduct,
    unverifiedProductCount: unverifiedProduct.length,
    reviewItems,
    reviewCount: reviewItems.length + runReviewItems.length,
    overLimit,
    overLimitCount: overLimit.length,
    targetLengthIssues,
    targetLengthIssueCount: targetLengthIssues.length,
    runReviewItems,
  };
}

async function getProductAudit() {
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const runs = await readStoryRuns();
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const summary = productAuditSummary(scheduleData, runs);
  const issueNumbers = uniqueSortedNumbers([
    ...summary.missingProductTitle,
    ...summary.unverifiedProduct,
    ...summary.reviewItems,
    ...summary.overLimit.map((item) => item.number),
  ]);
  const items = issueNumbers.slice(0, 120).map((number) => {
    const post = posts[number - 1] || {};
    return {
      number,
      slot: post.slot || "",
      label: post.generatedLabel || `Siri ${number}`,
      productTitle: post.productTitle || "",
      productCategory: post.productCategory || "",
      affiliateLink: post.affiliateLink || scheduleData.affiliate_link || "",
      issue: !post.productTitle
        ? "Tiada tajuk produk"
        : post.productVerified === false
          ? "Produk auto confidence rendah"
        : post.qualityStatus === "review"
          ? "Perlu Semak Quality Gate"
          : summary.targetLengthIssues.some((issue) => issue.number === number)
            ? "Belum capai 250-295 aksara"
          : "Had aksara / metadata",
      main: post.main || "",
      reply1: post.reply1 || "",
      reply2: post.reply2 || "",
      snippet: String(post.main || "").slice(0, 180),
      qualityStatus: post.qualityStatus || "",
      qualityScore: post.qualityScore || null,
      productVerified: post.productVerified !== false,
      productIntelConfidence: post.productIntelConfidence || null,
      productIntelEvidence: post.productIntelEvidence || "",
    };
  });
  return { summary, items };
}

function buildAutoAuditReport(scheduleData, statusData, runs) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const audit = productAuditSummary(scheduleData, runs);
  const scheduledSet = new Set(uniqueSortedNumbers(statusData.scheduled));
  const postedSet = new Set(uniqueSortedNumbers(statusData.posted));
  const failedSet = new Set(uniqueSortedNumbers(statusData.failed));
  const actions = [];
  let autoPassed = 0;
  let autoGuarded = 0;
  let humanRequired = 0;
  let regenerateReady = 0;
  let autoFilled = 0;
  let linkVerified = 0;
  let verifyNeeded = 0;

  posts.forEach((post, index) => {
    const number = index + 1;
    if (post.source !== "generated") return;
    const productTitle = String(post.productTitle || "").trim();
    const productCategory = String(post.productCategory || "").trim();
    const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
    const lengths = ["main", "reply1", "reply2"].map((key) => String(post[key] || "").length);
    const overLimit = lengths.some((length) => length > 300);
    if (post.productIntelAutoFilled) autoFilled += 1;
    if (productTitle && post.productVerified !== false) linkVerified += 1;
    const statusLabel = postedSet.has(number)
      ? "Lulus"
      : scheduledSet.has(number)
        ? "Pending"
        : failedSet.has(number)
          ? "Gagal"
          : "Queue";

    if (!productTitle) {
      autoGuarded += 1;
      return;
    }

    const autopilotVerified = shouldAutopilotVerifyProduct(productTitle, post);
    if (post.productVerified === false && !autopilotVerified) {
      verifyNeeded += 1;
      autoGuarded += 1;
      return;
    }

    const quality = auditStoryQuality(post, { productTitle, productCategory, affiliateLink }, affiliateLink);
    if (quality.status === "passed" && !overLimit) {
      autoPassed += 1;
      return;
    }

    regenerateReady += 1;
    autoGuarded += 1;
  });

  const visibleActions = actions
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9) || a.number - b.number;
    })
    .slice(0, 24);

  return {
    summary: {
      totalGenerated: audit.generatedCount,
      issueCount: audit.issueCount,
      humanRequired,
      regenerateReady,
      autoPassed,
      autoGuarded,
      autoFilled,
      linkVerified,
      verifyNeeded,
      missingProductTitleCount: audit.missingProductTitleCount,
      unverifiedProductCount: audit.unverifiedProductCount,
      reviewCount: audit.reviewCount,
      overLimitCount: audit.overLimitCount,
      targetLengthIssueCount: audit.targetLengthIssueCount,
      lastAutoAuditAt: scheduleData.lastAutoProductAuditAt || "",
      mode: regenerateReady ? "autopilot guard aktif" : autoGuarded ? "autopilot memantau" : "automasi stabil",
      objective: "ThreadsMe automatik sahkan produk dengan DeepSeek/Product Intel, tapis risiko senyap, dan hanya buka edit bila Akmal mahu override.",
    },
    actions: visibleActions,
  };
}

function buildPostIntelInput(post, scheduleData, number) {
  const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
  const imageUrl = String(post.imageUrl || post.image_url || scheduleData.image_url || "").trim();
  const relatedSnippets = (Array.isArray(scheduleData.posts) ? scheduleData.posts : [])
    .filter((item) => String(item?.affiliateLink || scheduleData.affiliate_link || "").trim() === affiliateLink)
    .slice(0, 10)
    .map((item, index) => {
      const text = [item.productTitle, item.productCategory, item.generatedLabel, item.main, item.reply1, item.reply2]
        .filter(Boolean)
        .join(" ");
      return `Konteks link sama ${index + 1}: ${text.replace(/\s+/g, " ").slice(0, 320)}`;
    });
  const sourceText = [
    `Siri ${number}`,
    post.generatedLabel,
    post.main,
    post.reply1,
    post.reply2,
    ...relatedSnippets,
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    affiliateLink,
    productUrl: affiliateLink,
    imageUrl,
    sourceText,
    imageNotes: [post.productAuditNote, post.imageName, post.imageSource, post.slot].filter(Boolean).join(" | "),
    productTitle: post.productTitle || "",
    productCategory: post.productCategory || "",
    useAi: true,
  };
}

function applyProductIntelToPost(post, intel) {
  const productTitle = cleanTitleCandidate(intel.productTitle || "");
  if (!isUsefulProductTitle(productTitle)) return false;
  const autopilotVerified = shouldAutopilotVerifyProduct(productTitle, intel);
  post.productTitle = productTitle;
  post.productCategory = cleanTitleCandidate(intel.productCategory || "") || post.productCategory || inferProductCategoryFromText(productTitle);
  post.productVerified = autopilotVerified;
  post.productIntelAutoFilled = true;
  post.productIntelConfidence = Math.round(Number(intel.confidence || 0));
  post.productIntelEvidence = intel.evidenceLevel || (autopilotVerified ? "ai_verified" : "not_enough_info");
  post.productIntelSource = String(intel.source || "").slice(0, 220);
  post.productIntelAt = `${malaysiaNow()} GMT+8`;
  post.productIntelWarnings = Array.isArray(intel.warnings) ? intel.warnings.slice(0, 4) : [];
  post.shopeeProductIds = Array.isArray(intel.shopeeProductIds) ? intel.shopeeProductIds.slice(0, 3) : [];
  post.productAuditNote = intel.linkVerified
    ? `Auto isi daripada link Shopee/affiliate. Confidence ${post.productIntelConfidence}%.`
    : autopilotVerified
      ? `Auto disahkan oleh DeepSeek/Product Intel. Confidence ${post.productIntelConfidence}%. Edit hanya jika mahu override.`
      : `Auto guard: DeepSeek/Product Intel belum cukup yakin. Confidence ${post.productIntelConfidence}%.`;
  return true;
}

async function resolveProductForPost(post, scheduleData, number, cache) {
  const input = buildPostIntelInput(post, scheduleData, number);
  const cacheKey = input.affiliateLink ? `affiliate:${input.affiliateLink}` : "";
  if (cacheKey && cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (shouldAutopilotVerifyProduct(cached?.productTitle, cached) && applyProductIntelToPost(post, cached)) {
      return { tried: false, applied: true, linkVerified: Boolean(cached.linkVerified), intel: cached, cached: true };
    }
  }

  const intel = await inspectProductIntel(input);
  if (cacheKey && shouldAutopilotVerifyProduct(intel.productTitle, intel)) cache.set(cacheKey, intel);
  if (!intel.autoResolvable || !applyProductIntelToPost(post, intel)) {
    return { tried: true, applied: false, linkVerified: false, intel };
  }
  return { tried: true, applied: true, linkVerified: Boolean(intel.linkVerified), intel };
}

async function autoCompleteStoryProductInput(input) {
  if (String(input.productTitle || "").trim()) return input;
  const intel = await inspectProductIntel({ ...input, useAi: true });
  if (!intel.autoResolvable || !intel.productTitle) {
    badRequest("Autopilot guard: tajuk produk belum cukup jelas daripada link Shopee/DeepSeek, jadi story tidak dijadualkan.");
  }
  const autopilotVerified = shouldAutopilotVerifyProduct(intel.productTitle, intel);
  return {
    ...input,
    productTitle: intel.productTitle,
    productCategory: input.productCategory || intel.productCategory || "",
    productVerified: autopilotVerified,
    productIntelEvidence: intel.evidenceLevel || (autopilotVerified ? "ai_verified" : ""),
    productIntelConfidence: Number(intel.confidence || 0),
    productIntelSource: intel.source || "Server product intel",
    productIntelWarnings: intel.warnings || [],
  };
}

async function runAutoProductAudit() {
  await repairRuntimeScheduleMetadataFromStoryRuns();
  await repairProductIntelCacheFromStoryRuns();
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const runs = await readStoryRuns();
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  if (!posts.length && (countStatusNumbers(statusData) > 0 || runs.some((run) => Array.isArray(run.versions) && run.versions.length))) {
    return {
      updated: 0,
      protectedCount: 0,
      passedCount: 0,
      reviewCount: 0,
      resolveTried: 0,
      autoFilledCount: 0,
      linkVerifiedCount: 0,
      lowConfidenceCount: 0,
      lengthAdjustedCount: 0,
      lengthAdjustedNumbers: [],
      autoRegeneratedCount: 0,
      autoRegeneratedNumbers: [],
      autoRegenerateFallbackCount: 0,
      status: statusData,
      productAudit: await getProductAudit(),
      ok: false,
      issueCount: 1,
      actions: [
        {
          type: "runtime_repair_required",
          label: "Jadual siri kosong",
          description: "ThreadsMe mengesan status/story-runs masih aktif, tetapi threads-schedule.json kosong. Auto Audit dihentikan supaya data siri tidak dioverwrite.",
        },
      ],
      summary: {
        totalPosts: 0,
        issueCount: 1,
        targetLengthIssueCount: 0,
      },
    };
  }
  const lengthAdjustedNumbers = [];
  let touched = 0;
  let protectedCount = 0;
  let passedCount = 0;
  let reviewCount = 0;
  let resolveTried = 0;
  let autoFilledCount = 0;
  let linkVerifiedCount = 0;
  let lowConfidenceCount = 0;
  const resolveCache = new Map();
  const autoRegenerateNumbers = [];

  posts.forEach((post, index) => {
    const number = index + 1;
    const changed = applyThreadLengthTarget(post, number, scheduleData, "Auto Audit: semua siri disasarkan 250-295 aksara.");
    if (changed) {
      lengthAdjustedNumbers.push(number);
      touched += 1;
    }
  });

  for (const [index, post] of posts.entries()) {
    if (post.source !== "generated") continue;
    const number = index + 1;
    let productTitle = String(post.productTitle || "").trim();
    const productCategory = String(post.productCategory || "").trim() || inferProductCategoryFromText(
      [post.main, post.reply1, post.reply2, post.generatedLabel, post.imageUrl].filter(Boolean).join(" "),
    );
    const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
    const previous = JSON.stringify({
      qualityStatus: post.qualityStatus,
      qualityScore: post.qualityScore,
      productCategory: post.productCategory,
      productTitle: post.productTitle,
      productVerified: post.productVerified,
      productIntelAutoFilled: post.productIntelAutoFilled,
      productIntelConfidence: post.productIntelConfidence,
      autoAuditStatus: post.autoAuditStatus,
    });

    if (productCategory && !post.productCategory) post.productCategory = productCategory;

    if (!productTitle && resolveTried < autoProductResolveLimit) {
      const resolved = await resolveProductForPost(post, scheduleData, number, resolveCache);
      if (resolved.tried) resolveTried += 1;
      if (resolved.applied) {
        autoFilledCount += 1;
        if (resolved.linkVerified) linkVerifiedCount += 1;
        productTitle = String(post.productTitle || "").trim();
      } else {
        lowConfidenceCount += 1;
        post.productIntelAt = `${malaysiaNow()} GMT+8`;
        post.productIntelConfidence = Math.round(Number(resolved.intel?.confidence || 0));
        post.productIntelEvidence = resolved.intel?.evidenceLevel || "not_enough_info";
        post.productIntelWarnings = Array.isArray(resolved.intel?.warnings) ? resolved.intel.warnings.slice(0, 4) : [];
      }
    }

    if (productTitle && post.productVerified === false) {
      const titleCategory = inferProductCategoryFromText(productTitle);
      if (titleCategory && post.productCategory !== titleCategory) {
        post.productCategory = titleCategory;
      }
      if (shouldAutopilotVerifyProduct(productTitle, post)) {
        post.productVerified = true;
        post.productIntelAutoFilled = Boolean(post.productIntelAutoFilled);
        post.productIntelEvidence = post.productIntelEvidence || "ai_verified";
        post.productIntelConfidence = Math.round(Number(post.productIntelConfidence || autoProductMinimumConfidence));
        post.productIntelSource = post.productIntelSource || "ThreadsMe Auto Audit";
        post.productAuditNote = post.productAuditNote || `Autopilot: DeepSeek/Product Intel sahkan produk dengan confidence ${post.productIntelConfidence}%.`;
      }
    }

    if (!productTitle) {
      protectedCount += 1;
      reviewCount += 1;
      post.qualityStatus = "review";
      post.qualityScore = Math.min(Number(post.qualityScore || 0), 35);
      post.qualityReasons = ["Tajuk produk sebenar belum disahkan. ThreadsMe tidak akan reka produk untuk pembaca."];
      post.autoAuditStatus = "needs_product_title";
      post.autoAuditDecision = "Perlu input tajuk produk sebelum boleh masuk queue.";
      post.autoAuditAt = `${malaysiaNow()} GMT+8`;
    } else if (post.productVerified === false) {
      protectedCount += 1;
      reviewCount += 1;
      const quality = auditStoryQuality(post, { productTitle, productCategory: post.productCategory || productCategory, affiliateLink }, affiliateLink);
      post.qualityStatus = "review";
      post.qualityScore = Math.min(Number(quality.score || 0), 64);
      post.qualityChecks = quality.checks;
      post.qualityReasons = [
        "Maklumat produk masih confidence rendah selepas semakan DeepSeek/Product Intel.",
        ...(quality.reasons || []),
      ];
      post.autoAuditStatus = "auto_guarded_low_confidence";
      post.autoAuditDecision = "Autopilot tahan senyap kerana confidence rendah. Edit hanya jika Akmal mahu override.";
      post.autoAuditAt = `${malaysiaNow()} GMT+8`;
    } else {
      const quality = auditStoryQuality(post, { productTitle, productCategory, affiliateLink }, affiliateLink);
      post.qualityStatus = quality.status;
      post.qualityScore = quality.score;
      post.qualityChecks = quality.checks;
      post.qualityReasons = quality.reasons;
      post.autoAuditStatus = quality.status === "passed" ? "auto_passed" : "needs_regenerate";
      post.autoAuditDecision = quality.status === "passed"
        ? "Lulus auto audit. Story boleh terus ikut flow automation."
        : "Metadata ada, tetapi story perlu regenerate atau semakan copywriting.";
      post.autoAuditAt = `${malaysiaNow()} GMT+8`;
      if (quality.status === "passed") passedCount += 1;
      else {
        reviewCount += 1;
        autoRegenerateNumbers.push(number);
      }
    }

    const current = JSON.stringify({
      qualityStatus: post.qualityStatus,
      qualityScore: post.qualityScore,
      productCategory: post.productCategory,
      productTitle: post.productTitle,
      productVerified: post.productVerified,
      productIntelAutoFilled: post.productIntelAutoFilled,
      productIntelConfidence: post.productIntelConfidence,
      autoAuditStatus: post.autoAuditStatus,
    });
    if (previous !== current) touched += 1;
    post.autoAuditNumber = number;
  }

  const regenerated = await autoRegenerateQualityPosts(scheduleData, runs, autoRegenerateNumbers);
  if (regenerated.updatedNumbers.length) {
    touched += regenerated.updatedNumbers.length;
    passedCount += regenerated.updatedNumbers.length;
    reviewCount = Math.max(0, reviewCount - regenerated.updatedNumbers.length);
  }

  for (const number of lengthAdjustedNumbers) {
    const post = posts[number - 1];
    if (!post) continue;
    const productTitle = String(post.productTitle || "").trim();
    const productCategory = String(post.productCategory || "").trim();
    const affiliateLink = getPostAffiliateLink(post, scheduleData);
    if (productTitle && post.source !== "generated") {
      const quality = auditStoryQuality(post, { productTitle, productCategory, affiliateLink }, affiliateLink);
      post.qualityStatus = quality.status;
      post.qualityScore = quality.score;
      post.qualityChecks = quality.checks;
      post.qualityReasons = quality.reasons;
    }
    syncLengthAdjustedPostToRuns(runs, post, number);
  }

  scheduleData.posts = posts;
  scheduleData.lastAutoProductAuditAt = `${malaysiaNow()} GMT+8`;
  scheduleData.lastAutoProductAuditNote =
    `${touched} siri dikemas kini. ${lengthAdjustedNumbers.length} capai target 250-295 aksara, ${autoFilledCount} auto isi produk, ${linkVerifiedCount} link-verified, ${protectedCount} siri diguard automatik, ${regenerated.updatedNumbers.length} auto-regenerate.`;
  await writeJsonFile(scheduleFile, scheduleData);
  if (regenerated.updatedNumbers.length || lengthAdjustedNumbers.length) await writeStoryRuns(runs);

  const automation = buildAutomatedStatus(scheduleData, statusData, Date.now());
  await writeJsonFile(statusFile, {
    ...automation.status,
    lastAutoProductAuditAt: scheduleData.lastAutoProductAuditAt,
    lastAutoProductAuditNote: scheduleData.lastAutoProductAuditNote,
  });
  await syncStoryRunsWithStatus(automation.status, scheduleData);

  const report = buildAutoAuditReport(scheduleData, automation.status, runs);
  return {
    updated: touched,
    protectedCount,
    passedCount,
    reviewCount,
    resolveTried,
    autoFilledCount,
    linkVerifiedCount,
    lowConfidenceCount,
    lengthAdjustedCount: lengthAdjustedNumbers.length,
    lengthAdjustedNumbers,
    autoRegeneratedCount: regenerated.updatedNumbers.length,
    autoRegeneratedNumbers: regenerated.updatedNumbers,
    autoRegenerateFallbackCount: regenerated.fallbackCount,
    status: automation.status,
    productAudit: await getProductAudit(),
    ...report,
  };
}

async function updateProductAudit(input) {
  const numbers = parseNumberList(input.numbers);
  if (!numbers.length) badRequest("Pilih nombor siri untuk diaudit.");
  const productTitle = String(input.productTitle || "").trim();
  if (!productTitle) badRequest("Tajuk produk wajib untuk audit.");
  const productCategory = String(input.productCategory || "").trim();
  const affiliateLink = String(input.affiliateLink || "").trim();
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const runs = await readStoryRuns();
  const updatedNumbers = [];

  for (const number of numbers) {
    const post = posts[number - 1];
    if (!post) continue;
    post.productTitle = productTitle;
    post.productCategory = productCategory;
    post.productVerified = true;
    post.productIntelAutoFilled = Boolean(post.productIntelAutoFilled);
    post.productIntelEvidence = "manual_verified";
    post.productIntelConfidence = 100;
    post.productIntelSource = "Product Audit manual";
    if (affiliateLink) post.affiliateLink = affiliateLink;
    post.productAuditAt = `${malaysiaNow()} GMT+8`;
    post.productAuditNote = String(input.note || "Metadata produk dikemas kini melalui Product Audit.").trim();
    const quality = auditStoryQuality(post, { productTitle, productCategory, affiliateLink: post.affiliateLink }, post.affiliateLink);
    post.qualityStatus = quality.status;
    post.qualityScore = quality.score;
    post.qualityChecks = quality.checks;
    if (quality.status === "review") post.qualityReasons = quality.reasons;
    updatedNumbers.push(number);
  }

  for (const run of runs) {
    let runTouched = false;
    for (const version of run.versions || []) {
      const number = Number(version.scheduleNumber);
      if (!updatedNumbers.includes(number)) continue;
      version.productTitle = productTitle;
      version.productCategory = productCategory;
      version.updatedAt = `${malaysiaNow()} GMT+8`;
      runTouched = true;
    }
    if (runTouched) {
      run.productTitle = run.productTitle || productTitle;
      run.productCategory = run.productCategory || productCategory;
      run.productAuditAt = `${malaysiaNow()} GMT+8`;
    }
  }

  scheduleData.posts = posts;
  scheduleData.lastProductAuditAt = `${malaysiaNow()} GMT+8`;
  scheduleData.lastProductAuditNote = `${formatNumberRange(updatedNumbers)} metadata produk dikemas kini.`;
  await writeJsonFile(scheduleFile, scheduleData);
  await writeStoryRuns(runs);
  return { updatedNumbers, ...(await getProductAudit()) };
}

async function regenerateProductAudit(input) {
  const numbers = parseNumberList(input.numbers);
  if (!numbers.length) badRequest("Pilih nombor siri untuk regenerate.");
  const productTitle = String(input.productTitle || "").trim();
  if (!productTitle) badRequest("Tajuk produk wajib untuk regenerate.");
  const productCategory = String(input.productCategory || "").trim();
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const firstPost = posts[numbers[0] - 1] || {};
  const affiliateLink = String(input.affiliateLink || firstPost.affiliateLink || scheduleData.affiliate_link || "").trim();
  const result = await generateStory({
    productTitle,
    productCategory,
    sourceText: input.sourceText || "",
    imageNotes: input.note || "",
    imageUrl: input.imageUrl || firstPost.imageUrl || "",
    theme: input.theme || "auto",
    versions: numbers.length,
    postsPerDay: numbers.length,
    affiliateLink,
  });
  const runs = await readStoryRuns();
  const updatedNumbers = [];

  numbers.forEach((number, index) => {
    const post = posts[number - 1];
    const version = result.versions[index];
    if (!post || !version) return;
    const quality = auditStoryQuality(version, { productTitle, productCategory, affiliateLink }, affiliateLink);
    post.main = version.main;
    post.reply1 = version.reply1;
    post.reply2 = version.reply2;
    post.productTitle = productTitle;
    post.productCategory = productCategory;
    post.productVerified = true;
    post.productIntelEvidence = "regenerated_verified";
    post.productIntelConfidence = 100;
    post.productIntelSource = "Product Audit regenerate";
    post.affiliateLink = affiliateLink || post.affiliateLink;
    post.regeneratedAt = `${malaysiaNow()} GMT+8`;
    post.regenerationReason = "Regenerated melalui Product Audit supaya story selari dengan produk.";
    post.qualityStatus = quality.status;
    post.qualityScore = quality.score;
    post.qualityChecks = quality.checks;
    post.qualityReasons = quality.reasons;
    updatedNumbers.push(number);
  });

  for (const run of runs) {
    let runTouched = false;
    for (const version of run.versions || []) {
      const number = Number(version.scheduleNumber);
      const post = posts[number - 1];
      if (!updatedNumbers.includes(number) || !post) continue;
      version.mainLength = String(post.main || "").length;
      version.reply1Length = String(post.reply1 || "").length;
      version.reply2Length = String(post.reply2 || "").length;
      version.productTitle = productTitle;
      version.productCategory = productCategory;
      version.qualityStatus = post.qualityStatus;
      version.qualityScore = post.qualityScore;
      version.qualityChecks = post.qualityChecks;
      version.qualityReasons = post.qualityReasons;
      version.updatedAt = `${malaysiaNow()} GMT+8`;
      if (post.qualityStatus === "review") version.status = "review";
      runTouched = true;
    }
    if (runTouched) {
      run.productTitle = run.productTitle || productTitle;
      run.productCategory = run.productCategory || productCategory;
      run.regeneratedAt = `${malaysiaNow()} GMT+8`;
    }
  }

  scheduleData.posts = posts;
  scheduleData.lastProductRegenerationAt = `${malaysiaNow()} GMT+8`;
  scheduleData.lastProductRegenerationNote = `${formatNumberRange(updatedNumbers)} regenerated melalui Product Audit.`;
  await writeJsonFile(scheduleFile, scheduleData);
  await writeStoryRuns(runs);
  return { updatedNumbers, fallback: result.fallback, usage: result.usage, ...(await getProductAudit()) };
}

function syncRegeneratedPostToRuns(runs, post, number) {
  for (const run of runs) {
    let runTouched = false;
    for (const version of run.versions || []) {
      if (Number(version.scheduleNumber) !== number) continue;
      version.mainLength = String(post.main || "").length;
      version.reply1Length = String(post.reply1 || "").length;
      version.reply2Length = String(post.reply2 || "").length;
      version.productTitle = post.productTitle || version.productTitle;
      version.productCategory = post.productCategory || version.productCategory;
      version.productVerified = post.productVerified !== false;
      version.productIntelEvidence = post.productIntelEvidence || version.productIntelEvidence;
      version.productIntelConfidence = Number(post.productIntelConfidence || version.productIntelConfidence || 100);
      version.qualityStatus = post.qualityStatus;
      version.qualityScore = post.qualityScore;
      version.qualityChecks = post.qualityChecks;
      version.qualityReasons = post.qualityReasons;
      version.status = post.qualityStatus === "review" ? "review" : version.status === "review" ? "blocked" : version.status;
      version.updatedAt = `${malaysiaNow()} GMT+8`;
      runTouched = true;
    }
    if (runTouched) {
      run.productTitle = run.productTitle || post.productTitle;
      run.productCategory = run.productCategory || post.productCategory;
      run.autoRegeneratedAt = `${malaysiaNow()} GMT+8`;
    }
  }
}

async function autoRegenerateQualityPosts(scheduleData, runs, numbers) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const queue = uniqueSortedNumbers(numbers)
    .filter((number) => {
      const post = posts[number - 1];
      if (!post || post.source !== "generated") return false;
      if (!String(post.productTitle || "").trim()) return false;
      if (post.productVerified === false) return false;
      if (Number(post.autoRegenerateAttempts || 0) >= 2) return false;
      return post.qualityStatus === "review";
    })
    .slice(0, autoQualityRegenerateLimit);
  if (!queue.length) return { updatedNumbers: [], failedNumbers: [], fallbackCount: 0 };

  const groups = new Map();
  for (const number of queue) {
    const post = posts[number - 1];
    const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
    const productTitle = String(post.productTitle || "").trim();
    const productCategory = String(post.productCategory || "").trim();
    const key = [affiliateLink, productTitle, productCategory, post.imageUrl || ""].join("|");
    if (!groups.has(key)) groups.set(key, { affiliateLink, productTitle, productCategory, imageUrl: post.imageUrl || "", numbers: [] });
    groups.get(key).numbers.push(number);
  }

  const updatedNumbers = [];
  const failedNumbers = [];
  let fallbackCount = 0;

  for (const group of groups.values()) {
    const sourceText = group.numbers
      .map((number) => {
        const post = posts[number - 1] || {};
        return [`Siri ${number}`, post.main, post.reply1, post.reply2, ...(post.qualityReasons || [])].filter(Boolean).join("\n");
      })
      .join("\n\n---\n\n");
    const result = await generateStory({
      productTitle: group.productTitle,
      productCategory: group.productCategory,
      sourceText,
      imageNotes: "Autopilot regenerate: baiki story supaya jelas selari dengan produk sebenar, deep storytelling, BM Malaysia natural, soft-sell, dan setiap post bawah 300 aksara.",
      imageUrl: group.imageUrl,
      theme: "auto",
      versions: group.numbers.length,
      postsPerDay: group.numbers.length,
      affiliateLink: group.affiliateLink,
    });
    if (result.fallback) fallbackCount += 1;

    group.numbers.forEach((number, index) => {
      const post = posts[number - 1];
      const version = result.versions[index];
      if (!post || !version) {
        failedNumbers.push(number);
        return;
      }
      const quality = auditStoryQuality(version, group, group.affiliateLink);
      post.main = version.main;
      post.reply1 = version.reply1;
      post.reply2 = version.reply2;
      post.productVerified = true;
      post.productIntelEvidence = "auto_regenerated_verified";
      post.productIntelConfidence = Math.max(Number(post.productIntelConfidence || 0), 100);
      post.productIntelSource = "ThreadsMe autopilot regenerate";
      post.autoRegenerateAttempts = Number(post.autoRegenerateAttempts || 0) + 1;
      post.autoRegeneratedAt = `${malaysiaNow()} GMT+8`;
      post.regeneratedAt = post.autoRegeneratedAt;
      post.regenerationReason = "Autopilot regenerate supaya story selari dengan produk sebenar.";
      post.qualityStatus = quality.status;
      post.qualityScore = quality.score;
      post.qualityChecks = quality.checks;
      post.qualityReasons = quality.reasons;
      post.autoAuditStatus = quality.status === "passed" ? "auto_regenerated_passed" : "auto_regenerated_review";
      post.autoAuditDecision = quality.status === "passed"
        ? "Autopilot regenerate selesai dan lulus Quality Gate."
        : "Autopilot sudah regenerate tetapi Quality Gate masih guard. Edit optional jika mahu override.";
      syncRegeneratedPostToRuns(runs, post, number);
      updatedNumbers.push(number);
    });
  }

  return { updatedNumbers, failedNumbers, fallbackCount };
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const valueCode = Number(code);
      return Number.isFinite(valueCode) ? String.fromCharCode(valueCode) : "";
    });
}

function cleanTitleCandidate(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\\u0026/g, "&")
    .replace(/\s*[\|-]\s*Shopee.*$/i, "")
    .replace(/\b(?:buy|jual|harga|online shopping)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 22)
    .join(" ");
}

function isUsefulProductTitle(value) {
  const title = cleanTitleCandidate(decodeHtmlEntities(value));
  const lower = title.toLowerCase();
  if (title.length < 8) return false;
  if (/^(shopee|online shopping|file|image|gambar|produk|barang|product|tiada tajuk|untitled)\b/i.test(title)) return false;
  if (/^(my|sg|vn|th|id)[-\s]?\d{6,}/i.test(title)) return false;
  if (/^[a-f0-9]{18,}$/i.test(title)) return false;
  if (/^\/?(opaanlp|product|api)\b/i.test(title)) return false;
  return tokenizeProductText(lower).length >= 2 || /\b(sambal|marble|lampu|organizer|rak|divider|wallpaper|led|cili|chili)\b/i.test(lower);
}

function shouldAutopilotVerifyProduct(productTitle, intel = {}) {
  const title = cleanTitleCandidate(productTitle || intel.productTitle || "");
  if (!isUsefulProductTitle(title)) return false;
  const confidence = Number(intel.productIntelConfidence ?? intel.confidence ?? 0);
  const evidence = String(intel.productIntelEvidence || intel.evidenceLevel || "").toLowerCase();
  return Boolean(
    intel.productVerified === true ||
      intel.linkVerified ||
      intel.autoResolvable ||
      evidence === "manual_verified" ||
      evidence === "link_verified" ||
      evidence === "regenerated_verified" ||
      confidence >= autoProductMinimumConfidence,
  );
}

function looksLikeStorySentence(value) {
  const text = cleanTitleCandidate(value).toLowerCase();
  if (/[?!]/.test(text)) return true;
  if (text.split(/\s+/).length > 12) return true;
  return /^(aku|bila|kadang|ada tak|pernah|rupanya|yang buat|mula-mula|kalau hari|hari ni|balik|rumah rasa)\b/i.test(text);
}

function inferProductCategoryFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (/sambal|cili|chili|sos|pedas|lauk|makan/.test(lower)) {
    return "sambal ready-to-eat, lauk cepat, penambah selera";
  }
  if (/marble|wallpaper|dinding|sheet|dekor|deco/.test(lower)) {
    return "dekorasi rumah, kemasan dinding, projek DIY";
  }
  if (/lampu|light|led|fairy/.test(lower)) {
    return "lampu dekorasi, suasana bilik, pencahayaan kecil";
  }
  if (/organizer|storage|rak|kotak|susun/.test(lower)) {
    return "organizer rumah, simpanan barang, kemas ruang";
  }
  return "";
}

function inferStoryProductCandidate(text) {
  const lower = String(text || "").toLowerCase();
  const rules = [
    {
      pattern: /flexi\s*marble\s*sheet|stiker\s*marble|sticker\s*marble|marble\s*sheet|corak\s*marble/,
      title: "Flexi Marble Sheet",
      category: "dekorasi rumah, kemasan dinding dan meja, projek DIY",
    },
    {
      pattern: /sambal\s*nyet|sambal\s*berapi|khairulaming|sambal\s*ready/,
      title: "Sambal Nyet Berapi by Khairulaming",
      category: "sambal ready-to-eat, lauk cepat, penambah selera",
    },
    {
      pattern: /fairy\s*light|lampu\s*(led|hias|dekor|kecil)|led\s*string|lampu\s*kelip/,
      title: "Lampu LED hiasan",
      category: "lampu dekorasi, pencahayaan bilik, suasana meja atau ruang kecil",
    },
    {
      pattern: /storage\s*box|kotak\s*simpan|bekas\s*simpan|organizer|rak\s*kecik|rak\s*kecil|susun\s*barang/,
      title: "Organizer rumah",
      category: "organizer rumah, simpanan barang, kemas ruang",
    },
    {
      pattern: /room\s*divider|divider\s*lipat|pembahagi\s*ruang|partition/,
      title: "Room divider lipat",
      category: "pembahagi ruang, privasi rumah, susun ruang kerja atau bilik",
    },
  ];
  return rules.find((rule) => rule.pattern.test(lower)) || null;
}

function extractHtmlMeta(html) {
  const title = cleanTitleCandidate(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const ogTitle = cleanTitleCandidate(html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1] || "");
  const description = cleanTitleCandidate(
    html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      html.match(/property=["']og:description["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
      "",
  );
  return { title: ogTitle || title, description };
}

function titleFromUrlPath(urlValue) {
  try {
    const url = new URL(urlValue);
    const decoded = decodeURIComponent(url.pathname)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleanTitleCandidate(decoded);
  } catch {
    return "";
  }
}

function parseShopeeProductIds(urlValue) {
  try {
    const url = new URL(urlValue);
    const host = url.hostname.toLowerCase();
    if (!host.includes("shopee")) return null;
    const full = decodeURIComponent(`${url.pathname}${url.search}`);
    const productMatch = full.match(/\/product\/(\d+)\/(\d+)/i) || full.match(/\/i\.(\d+)\.(\d+)/i);
    if (productMatch) {
      return { shopId: productMatch[1], itemId: productMatch[2], url: url.href };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    for (let index = 0; index < parts.length - 1; index += 1) {
      if (/^\d{5,}$/.test(parts[index]) && /^\d{6,}$/.test(parts[index + 1])) {
        return { shopId: parts[index], itemId: parts[index + 1], url: url.href };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function shopeeProductKey(ids) {
  return ids?.shopId && ids?.itemId ? `${ids.shopId}:${ids.itemId}` : "";
}

function normalizeProductIntelCacheUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "").trim();
  }
}

function getProductIntelCacheKey(input = {}) {
  const urls = [input.affiliateLink, input.productUrl, input.imageUrl]
    .map(normalizeProductIntelCacheUrl)
    .filter(Boolean);
  for (const urlValue of urls) {
    const ids = parseShopeeProductIds(urlValue);
    const productKey = shopeeProductKey(ids);
    if (productKey) return `shopee:${productKey}`;
  }
  if (urls[0]) return `url:${urls[0]}`;
  const title = cleanTitleCandidate(input.productTitle || "");
  return title ? `title:${title.toLowerCase()}` : "";
}

async function readProductIntelCache() {
  const data = await readJsonFile(productIntelCacheFile, { entries: [] });
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const now = Date.now();
  return entries
    .filter((entry) => entry?.key && Number(entry.expiresAt || 0) > now)
    .slice(-productIntelCacheMaxEntries);
}

async function writeProductIntelCache(entries) {
  const sorted = entries
    .filter((entry) => entry?.key && entry?.intel?.productTitle)
    .sort((a, b) => Number(a.createdAtMs || 0) - Number(b.createdAtMs || 0))
    .slice(-productIntelCacheMaxEntries);
  await writeJsonFile(productIntelCacheFile, { version: 1, updatedAt: `${malaysiaNow()} GMT+8`, entries: sorted });
}

async function getCachedProductIntel(cacheKey) {
  if (!cacheKey) return null;
  const entries = await readProductIntelCache();
  const entry = entries.find((item) => item.key === cacheKey);
  if (!entry) return null;
  return {
    ...entry.intel,
    cached: true,
    cacheKey,
    cacheStoredAt: entry.createdAt || "",
    warnings: [...(entry.intel?.warnings || []), "Product Intel guna cache runtime untuk link yang sama."].slice(0, 10),
  };
}

async function saveProductIntelCache(cacheKey, intel) {
  if (!cacheKey || !intel?.productTitle || Number(intel.confidence || 0) < 45) return;
  const now = Date.now();
  const entries = (await readProductIntelCache()).filter((entry) => entry.key !== cacheKey);
  entries.push({
    key: cacheKey,
    createdAtMs: now,
    expiresAt: now + productIntelCacheTtlMs,
    createdAt: `${malaysiaNow()} GMT+8`,
    intel: {
      productTitle: intel.productTitle,
      productCategory: intel.productCategory || "",
      confidence: Number(intel.confidence || 0),
      source: intel.source || "",
      evidenceLevel: intel.evidenceLevel || "not_enough_info",
      linkVerified: Boolean(intel.linkVerified),
      storyAligned: Boolean(intel.storyAligned),
      sourceEvidence: intel.sourceEvidence || "",
      autoResolvable: Boolean(intel.autoResolvable),
      shopeeProductIds: Array.isArray(intel.shopeeProductIds) ? intel.shopeeProductIds.slice(0, 3) : [],
      candidates: Array.isArray(intel.candidates) ? intel.candidates.slice(0, 5) : [],
      warnings: Array.isArray(intel.warnings) ? intel.warnings.slice(0, 6) : [],
      note: intel.note || "",
    },
  });
  await writeProductIntelCache(entries);
}

async function getProductIntelCacheStatus() {
  const entries = await readProductIntelCache();
  return {
    file: productIntelCacheFile.replace(workspaceRoot, "").replace(/^[/\\]/, ""),
    entries: entries.length,
    maxEntries: productIntelCacheMaxEntries,
    ttlDays: Math.round(productIntelCacheTtlMs / (24 * 60 * 60 * 1000)),
    latestAt: entries[entries.length - 1]?.createdAt || "",
  };
}

function normalizeShopeeItemPayload(payload) {
  const data = payload?.data || payload?.item || payload;
  const item = data?.item || data?.product_info || data;
  const title = cleanTitleCandidate(
    item?.name ||
      item?.title ||
      item?.item?.name ||
      item?.item_basic?.name ||
      data?.name ||
      "",
  );
  const description = cleanTitleCandidate(
    item?.description ||
      item?.item?.description ||
      item?.item_basic?.description ||
      data?.description ||
      "",
  );
  const categories = [
    ...(Array.isArray(item?.categories) ? item.categories : []),
    ...(Array.isArray(data?.categories) ? data.categories : []),
  ]
    .map((category) => category?.display_name || category?.cat_name || category?.name || "")
    .filter(Boolean)
    .join(", ");
  return { title, description, categories };
}

async function fetchShopeeItemDetails(ids) {
  if (!ids?.shopId || !ids?.itemId) return { warnings: ["Shopee product id tidak lengkap."] };
  const cookie = await getShopeeCookie();
  const urls = [
    `https://shopee.com.my/api/v4/pdp/get_pc?shop_id=${ids.shopId}&item_id=${ids.itemId}`,
    `https://shopee.com.my/api/v4/item/get?shopid=${ids.shopId}&itemid=${ids.itemId}`,
  ];
  const warnings = [];
  for (const urlValue of urls) {
    try {
      const response = await fetch(urlValue, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 ThreadsMe Product Intel",
          accept: "application/json,text/plain,*/*",
          referer: `https://shopee.com.my/product/${ids.shopId}/${ids.itemId}`,
          "x-api-source": "pc",
          ...(cookie ? { cookie } : {}),
        },
        signal: AbortSignal.timeout(10000),
      });
      const raw = await response.text();
      if (!response.ok) {
        warnings.push(`Shopee API ${response.status} untuk item ${ids.itemId}.`);
        continue;
      }
      const parsed = JSON.parse(raw);
      const normalized = normalizeShopeeItemPayload(parsed);
      if (isUsefulProductTitle(normalized.title)) {
        return {
          ...normalized,
          source: urlValue,
          evidenceLevel: "link_verified",
          warnings,
        };
      }
    } catch (error) {
      warnings.push(`Gagal baca Shopee item ${ids.itemId}: ${error.message}`);
    }
  }
  return { warnings };
}

function parseJsonObjectFromText(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return {};
      }
    }
  }
  return {};
}

async function askDeepSeekProductIntel(input, baseIntel) {
  let apiKey = "";
  try {
    apiKey = await getApiKey();
  } catch {
    apiKey = "";
  }
  if (!apiKey) {
    return {
      warnings: ["DeepSeek key tiada, jadi auto product intel guna metadata link sahaja."],
      confidence: 0,
      evidenceLevel: "not_enough_info",
    };
  }

  const sourceText = String(input.sourceText || "").slice(0, 1800);
  const payload = {
    affiliateLink: input.affiliateLink || "",
    productUrl: input.productUrl || "",
    imageUrl: input.imageUrl || "",
    imageNotes: String(input.imageNotes || "").slice(0, 900),
    providedTitle: input.productTitle || "",
    providedCategory: input.productCategory || "",
    shopeeProductIds: baseIntel.shopeeProductIds || [],
    fetchedCandidates: (baseIntel.candidates || []).slice(0, 8),
    fetchedWarnings: (baseIntel.warnings || []).slice(0, 8),
    existingStoryText: sourceText,
  };

  try {
    const response = await fetch(deepseekUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          {
            role: "system",
            content: [
              "Anda ialah analis metadata produk affiliate Shopee Malaysia untuk sistem ThreadsMe.",
              "Tugas anda ialah pulangkan JSON sahaja, bukan copywriting.",
              "Jangan reka nama produk jika bukti link/metadata tidak cukup. Jika boleh infer dengan yakin daripada link, imej, nota, atau story, tandakan evidenceLevel sebagai story_inferred dan beri confidence yang munasabah.",
              "evidenceLevel mesti salah satu: link_verified, story_inferred, not_enough_info.",
              "link_verified hanya boleh digunakan jika fetchedCandidates/providedTitle jelas menunjukkan nama produk sebenar, bukan sekadar shopid/itemid.",
              "Pulangkan confidence 0-95. Kurangkan confidence jika Shopee API blocked, title generik, atau story nampak tidak sepadan.",
              "Kategori mesti ringkas dalam Bahasa Melayu Malaysia dan berfungsi untuk copywriting Threads.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "Analisis data ini dan pulangkan JSON:",
              JSON.stringify(payload, null, 2),
              "",
              'Format wajib: {"productTitle":"","productCategory":"","productUseCase":"","confidence":0,"evidenceLevel":"not_enough_info","storyAligned":false,"sourceEvidence":"","warning":""}',
            ].join("\n"),
          },
        ],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.15,
        max_tokens: 1400,
        stream: false,
      }),
      signal: AbortSignal.timeout(25000),
    });

    const raw = await response.text();
    if (!response.ok) {
      return {
        warnings: [`DeepSeek product intel gagal ${response.status}: ${raw.slice(0, 180)}`],
        confidence: 0,
        evidenceLevel: "not_enough_info",
      };
    }
    const data = JSON.parse(raw);
    const parsed = parseJsonObjectFromText(data.choices?.[0]?.message?.content || "{}");
    const productTitle = cleanTitleCandidate(parsed.productTitle || "");
    const confidence = Math.max(0, Math.min(Number(parsed.confidence || 0), 95));
    const evidenceLevel = ["link_verified", "story_inferred", "not_enough_info"].includes(parsed.evidenceLevel)
      ? parsed.evidenceLevel
      : "not_enough_info";
    return {
      productTitle,
      productCategory: cleanTitleCandidate(parsed.productCategory || ""),
      productUseCase: cleanTitleCandidate(parsed.productUseCase || ""),
      confidence,
      evidenceLevel,
      storyAligned: Boolean(parsed.storyAligned),
      sourceEvidence: String(parsed.sourceEvidence || "").slice(0, 240),
      warning: String(parsed.warning || "").slice(0, 240),
      source: "DeepSeek product intel",
      warnings: [],
    };
  } catch (error) {
    return {
      warnings: [`DeepSeek product intel error: ${error.message}`],
      confidence: 0,
      evidenceLevel: "not_enough_info",
    };
  }
}

async function inspectProductIntel(input) {
  const urls = [input.affiliateLink, input.productUrl, input.imageUrl]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const sourceText = String(input.sourceText || "").trim();
  const imageNotes = String(input.imageNotes || "").trim();
  const providedTitle = cleanTitleCandidate(input.productTitle || "");
  const providedCategory = cleanTitleCandidate(input.productCategory || "");
  const cacheKey = getProductIntelCacheKey(input);
  if (!providedTitle && input.skipCache !== true) {
    const cached = await getCachedProductIntel(cacheKey);
    if (cached?.productTitle) return cached;
  }
  const notes = [sourceText, imageNotes, providedTitle, providedCategory].filter(Boolean).join(" ");
  const candidates = [];
  const warnings = [];
  const shopeeProductIds = [];
  const seenShopeeIds = new Set();
  const shopeeCookie = await getShopeeCookie();

  const addShopeeIds = (ids) => {
    const key = shopeeProductKey(ids);
    if (!key || seenShopeeIds.has(key)) return;
    seenShopeeIds.add(key);
    shopeeProductIds.push(ids);
  };

  for (const urlValue of urls.slice(0, 3)) {
    addShopeeIds(parseShopeeProductIds(urlValue));
    try {
      const response = await fetch(urlValue, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 ThreadsMe Product Intel",
          accept: "text/html,application/xhtml+xml,image/*,*/*",
          ...(shopeeCookie ? { cookie: shopeeCookie } : {}),
        },
        signal: AbortSignal.timeout(12000),
      });
      const finalUrl = response.url || urlValue;
      addShopeeIds(parseShopeeProductIds(finalUrl));
      const contentType = response.headers.get("content-type") || "";
      if (/text\/html|application\/xhtml/i.test(contentType)) {
        const html = (await response.text()).slice(0, 500000);
        const meta = extractHtmlMeta(html);
        if (isUsefulProductTitle(meta.title)) {
          candidates.push({
            source: finalUrl,
            evidenceLevel: "link_verified",
            title: meta.title,
            description: meta.description,
          });
        }
      } else {
        warnings.push(`${urlValue} nampak seperti fail ${contentType || "bukan HTML"}, jadi tajuk produk tidak boleh diekstrak terus.`);
      }
    } catch (error) {
      warnings.push(`Gagal semak ${urlValue}: ${error.message}`);
    }
    const pathTitle = titleFromUrlPath(urlValue);
    if (isUsefulProductTitle(pathTitle) && !/^file\/|\/file\/|my \d+/i.test(pathTitle)) {
      candidates.push({ source: urlValue, evidenceLevel: "url_path", title: pathTitle, description: "" });
    }
  }

  for (const ids of shopeeProductIds.slice(0, 2)) {
    const item = await fetchShopeeItemDetails(ids);
    warnings.push(...(item.warnings || []));
    if (isUsefulProductTitle(item.title)) {
      candidates.push({
        source: item.source || `Shopee item ${ids.itemId}`,
        evidenceLevel: item.evidenceLevel || "link_verified",
        title: item.title,
        description: [item.description, item.categories].filter(Boolean).join(" "),
      });
    }
  }

  if (providedTitle) {
    candidates.push({
      source: "tajuk diisi",
      evidenceLevel: "provided",
      title: providedTitle.slice(0, 140),
      description: notes.slice(0, 240),
    });
  } else {
    const storyProduct = inferStoryProductCandidate(notes);
    if (storyProduct) {
      candidates.push({
        source: "keyword story",
        evidenceLevel: "story_inferred",
        title: storyProduct.title,
        description: [storyProduct.category, notes.slice(0, 240)].filter(Boolean).join(" "),
      });
      if (!providedCategory) {
        candidates.push({
          source: "kategori keyword",
          evidenceLevel: "story_inferred",
          title: storyProduct.title,
          description: storyProduct.category,
        });
      }
    }
  }

  if (!providedTitle && sourceText) {
    const noteTitle = cleanTitleCandidate(sourceText.split(/\n/)[0]);
    if (isUsefulProductTitle(noteTitle) && !looksLikeStorySentence(noteTitle)) {
      candidates.push({
        source: "brief/story",
        evidenceLevel: "story_inferred",
        title: noteTitle.slice(0, 140),
        description: notes.slice(0, 240),
      });
    }
  }

  const ranked = candidates
    .map((candidate) => {
      const title = cleanTitleCandidate(candidate.title);
      const evidenceBonus =
        candidate.evidenceLevel === "link_verified" ? 4 :
          candidate.evidenceLevel === "provided" ? 3 :
            candidate.evidenceLevel === "story_inferred" ? 1 : 0;
      return {
        ...candidate,
        title,
        score: tokenizeProductText(`${title} ${candidate.description || ""}`).length + evidenceBonus,
      };
    })
    .filter((candidate) => isUsefulProductTitle(candidate.title))
    .sort((a, b) => b.score - a.score);

  let best = ranked[0] || null;
  let evidenceLevel = best?.evidenceLevel || "not_enough_info";
  let confidence = best ? Math.min(95, 45 + best.score * 7) : 20;
  let source = best?.source || "";
  let storyAligned = false;
  let sourceEvidence = "";

  const baseIntel = {
    productTitle: best?.title || "",
    productCategory: inferProductCategoryFromText([best?.title, best?.description, notes].filter(Boolean).join(" ")),
    confidence,
    source,
    evidenceLevel,
    candidates: ranked.slice(0, 8),
    warnings,
    shopeeProductIds,
  };

  const needsAi =
    input.useAi !== false &&
    (!best || evidenceLevel !== "link_verified" || confidence < 78 || !baseIntel.productCategory);
  if (needsAi) {
    const aiIntel = await askDeepSeekProductIntel(input, baseIntel);
    warnings.push(...(aiIntel.warnings || []));
    if (aiIntel.warning) warnings.push(aiIntel.warning);
    if (isUsefulProductTitle(aiIntel.productTitle) && aiIntel.confidence >= 45) {
      const aiEvidence = aiIntel.evidenceLevel || "story_inferred";
      const aiBeatsCurrent =
        !best ||
        (aiEvidence === "link_verified" && evidenceLevel !== "link_verified") ||
        aiIntel.confidence > confidence + 5;
      if (aiBeatsCurrent) {
        best = {
          source: aiIntel.source || "DeepSeek product intel",
          evidenceLevel: aiEvidence,
          title: aiIntel.productTitle,
          description: [aiIntel.productCategory, aiIntel.productUseCase, aiIntel.sourceEvidence].filter(Boolean).join(" "),
        };
        confidence = aiIntel.confidence;
        evidenceLevel = aiEvidence;
        source = best.source;
      }
      storyAligned = Boolean(aiIntel.storyAligned);
      sourceEvidence = aiIntel.sourceEvidence || "";
      if (aiIntel.productCategory && !baseIntel.productCategory) {
        baseIntel.productCategory = aiIntel.productCategory;
      }
    }
  }

  const joined = [best?.title, best?.description, baseIntel.productCategory, notes].filter(Boolean).join(" ");
  const productTitle = isUsefulProductTitle(best?.title) ? cleanTitleCandidate(best.title) : "";
  const titleCategory = inferProductCategoryFromText(productTitle);
  const productCategory =
    evidenceLevel === "provided"
      ? providedCategory || titleCategory || baseIntel.productCategory || inferProductCategoryFromText(joined)
      : titleCategory || providedCategory || baseIntel.productCategory || inferProductCategoryFromText(joined);
  const verified = evidenceLevel === "link_verified" || evidenceLevel === "provided";
  const autoResolvable = Boolean(productTitle) && confidence >= autoProductMinimumConfidence;
  const linkVerified = Boolean(productTitle) && verified && confidence >= autoProductMinimumConfidence;

  const result = {
    productTitle,
    productCategory,
    confidence: productTitle ? confidence : 20,
    source,
    evidenceLevel,
    linkVerified,
    storyAligned,
    sourceEvidence,
    autoResolvable,
    shopeeProductIds,
    candidates: ranked.slice(0, 8),
    warnings: warnings.filter(Boolean).slice(0, 10),
    note: productTitle
      ? verified
        ? "Produk berjaya dikenal pasti daripada link/metadata. Anda masih boleh edit jika perlu."
        : autoResolvable
          ? "Produk disahkan oleh DeepSeek/Product Intel untuk autopilot. Anda masih boleh edit jika mahu override."
          : "Produk dicadangkan oleh AI tetapi confidence masih rendah, jadi autopilot akan guard siri ini."
      : "ThreadsMe belum dapat kenal produk dengan yakin. Shopee mungkin block detail tanpa sesi login/cookie.",
  };
  await saveProductIntelCache(cacheKey, result);
  return result;
}

async function getPublisherStatus() {
  const config = await readThreadsConfig();
  const hasToken = await hasThreadsToken(config);
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const dueNumbers = uniqueSortedNumbers(statusData.scheduled).filter((number) => {
    const post = posts[number - 1];
    return post && parseScheduleSlot(post.slot).getTime() <= Date.now();
  });
  const log = await readPublishLog();
  return {
    config: sanitizeThreadsConfig(config, hasToken),
    dueNumbers,
    preflight: buildPublisherPreflightSummary(scheduleData, statusData),
    lastEntries: log.slice(-20).reverse(),
  };
}

function getNativeProofMap(statusData) {
  const value = statusData?.nativeThreadsScheduleProofs;
  if (Array.isArray(value)) {
    return value.reduce((map, item) => {
      const number = Number(item?.number);
      if (Number.isInteger(number) && number > 0) map[number] = item;
      return map;
    }, {});
  }
  return value && typeof value === "object" ? { ...value } : {};
}

function getExtensionToken(req) {
  const auth = String(req.headers.authorization || "").trim();
  if (/^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return String(req.headers["x-threadsme-extension-token"] || "").trim();
}

async function requireExtensionBridge(req) {
  const bridge = await readExtensionBridgeConfig();
  if (!bridge.enabled) forbidden("ThreadsMe Extension Bridge belum diaktifkan.");
  const token = getExtensionToken(req);
  if (!token || !safeCompareString(token, bridge.token)) unauthorized("Token extension ThreadsMe tidak sah.");
  return bridge;
}

function productPreviewTerms(kind) {
  const terms = {
    marble: ["marble", "sheet", "wall", "dinding", "sticker", "flexi"],
    sambal: ["sambal", "nyet", "khairulaming", "pedas", "cili"],
    pressure_cooker: ["pressure", "cooker", "periuk", "tekanan", "dessini"],
    fairy_light: ["fairy", "string", "dawai", "lampu", "led"],
    solar: ["solar", "outdoor", "waterproof", "lampu"],
    gold: ["gold", "emas", "poh", "kong", "24k", "999"],
  };
  return terms[kind] || [];
}

function productBlockTerms(kind) {
  const terms = {
    marble: ["sambal", "nyet", "khairulaming", "pressure cooker", "periuk tekanan", "dessini"],
    sambal: ["marble", "wallpaper", "dinding", "pressure cooker", "periuk tekanan", "dessini"],
    pressure_cooker: ["sambal", "nyet", "khairulaming", "marble", "wallpaper", "dinding"],
    fairy_light: ["solar", "street lamp", "lampu jalan"],
    solar: ["fairy", "string light", "lampu dawai"],
    gold: ["sambal", "marble", "wallpaper"],
  };
  return terms[kind] || [];
}

function scheduleItemText(item) {
  return [item?.text, item?.main, item?.reply1, item?.reply2, item?.preview]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchNativeScheduledItems(scheduleData, scheduledItems) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const matched = new Set();
  for (const item of Array.isArray(scheduledItems) ? scheduledItems : []) {
    const nativeText = scheduleItemText(item);
    if (!nativeText) continue;
    for (const [index, post] of posts.entries()) {
      const number = index + 1;
      if (matched.has(number)) continue;
      const main = String(post.main || "").replace(/\s+/g, " ").trim().toLowerCase();
      const reply2 = String(post.reply2 || "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
      const mainNeedle = main.slice(0, Math.min(80, main.length));
      const replyNeedle = reply2.slice(0, Math.min(70, reply2.length));
      if ((mainNeedle.length >= 28 && nativeText.includes(mainNeedle)) || (replyNeedle.length >= 28 && nativeText.includes(replyNeedle))) {
        matched.add(number);
        break;
      }
    }
  }
  return uniqueSortedNumbers([...matched]);
}

function futureExtensionSlot(post, scheduleData) {
  const current = parseScheduleSlot(post?.slot);
  if (Number.isFinite(current.getTime()) && current.getTime() > Date.now() + 15 * 60 * 1000) return post.slot;
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  return buildScheduleSlots(posts, 1, maxPostingPerDay)[0] || formatScheduleSlot(new Date(Date.now() + 30 * 60 * 1000));
}

function buildExtensionPostPayload(number, post, scheduleData) {
  const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
  const productText = `${post.productTitle || ""} ${post.productCategory || ""}`;
  const expectedProductKind = inferAffiliateProductKind(affiliateLink) || inferStoryProductKind(productText);
  return {
    number,
    slot: futureExtensionSlot(post, scheduleData),
    productTitle: post.productTitle || "",
    productCategory: post.productCategory || "",
    affiliateLink,
    expectedProductKind,
    previewMustIncludeAny: productPreviewTerms(expectedProductKind),
    previewMustNotInclude: productBlockTerms(expectedProductKind),
    main: String(post.main || "").trim(),
    reply1: String(post.reply1 || "").trim(),
    reply2: String(post.reply2 || "").trim(),
    thread: [post.main, post.reply1, post.reply2].map((part) => String(part || "").trim()).filter(Boolean),
  };
}

function buildExtensionQueue(scheduleData, statusData, bridge) {
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const postedSet = new Set(uniqueSortedNumbers(statusData.posted));
  const failedSet = new Set(uniqueSortedNumbers(statusData.failed));
  const localPending = uniqueSortedNumbers(statusData.scheduled).filter((number) => !postedSet.has(number) && !failedSet.has(number));
  const blocked = uniqueSortedNumbers([...(statusData.remaining || []), ...(statusData.prepared || [])]).filter(
    (number) => !postedSet.has(number) && !failedSet.has(number),
  );
  const proofMap = getNativeProofMap(statusData);
  const proofNumbers = uniqueSortedNumbers([
    ...Object.keys(proofMap).map(Number),
    ...(bridge.nativeScheduledNumbers || []),
  ]);
  const proofSet = new Set(proofNumbers);
  const orderedNumbers = uniqueSortedNumbers([...localPending, ...blocked]);
  const rejected = [];

  for (const number of orderedNumbers) {
    if (proofSet.has(number)) continue;
    const post = posts[number - 1];
    if (!post) continue;
    if (post.qualityStatus === "review") {
      rejected.push({ number, reason: "quality_review" });
      continue;
    }
    const affiliateLink = String(post.affiliateLink || scheduleData.affiliate_link || "").trim();
    const quality = auditStoryQuality(post, {
      productTitle: post.productTitle,
      productCategory: post.productCategory,
      affiliateLink,
    }, affiliateLink);
    if (quality.status === "review" || Number(quality.score || 0) < 75) {
      rejected.push({ number, reason: "quality_gate", score: quality.score, reasons: quality.reasons || [] });
      continue;
    }
    return {
      targetScheduledCount: bridge.targetScheduledCount || threadsScheduleLimit,
      localPendingCount: localPending.length,
      blockedCount: blocked.length,
      proofNumbers,
      rejected: rejected.slice(0, 10),
      next: buildExtensionPostPayload(number, post, scheduleData),
    };
  }

  return {
    targetScheduledCount: bridge.targetScheduledCount || threadsScheduleLimit,
    localPendingCount: localPending.length,
    blockedCount: blocked.length,
    proofNumbers,
    rejected: rejected.slice(0, 10),
    next: null,
  };
}

async function getExtensionBridgeStatus(req) {
  const bridge = await requireExtensionBridge(req);
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const queue = buildExtensionQueue(scheduleData, statusData, bridge);
  return {
    bridge: sanitizeExtensionBridgeConfig(bridge),
    queue: {
      targetScheduledCount: queue.targetScheduledCount,
      nativeScheduledCount: bridge.lastNativeScheduledCount || 0,
      localPendingCount: queue.localPendingCount,
      blockedCount: queue.blockedCount,
      nextNumber: queue.next?.number || null,
      rejected: queue.rejected,
    },
  };
}

async function getExtensionNext(req) {
  const bridge = await requireExtensionBridge(req);
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const queue = buildExtensionQueue(scheduleData, statusData, bridge);
  const nativeCount = Number(bridge.lastNativeScheduledCount || 0);
  if (nativeCount >= queue.targetScheduledCount) {
    return {
      needsScheduling: false,
      reason: "Threads native sudah cukup mengikut target extension.",
      nativeScheduledCount: nativeCount,
      targetScheduledCount: queue.targetScheduledCount,
      next: null,
      rejected: queue.rejected,
    };
  }
  if (!queue.next) {
    return {
      needsScheduling: false,
      reason: "Tiada siri yang lulus Quality Gate untuk extension schedule.",
      nativeScheduledCount: nativeCount,
      targetScheduledCount: queue.targetScheduledCount,
      next: null,
      rejected: queue.rejected,
    };
  }
  return {
    needsScheduling: true,
    nativeScheduledCount: nativeCount,
    targetScheduledCount: queue.targetScheduledCount,
    next: queue.next,
    rejected: queue.rejected,
  };
}

async function syncExtensionNativeSchedule(req, input) {
  const bridge = await requireExtensionBridge(req);
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const scheduledItems = Array.isArray(input.scheduledItems) ? input.scheduledItems : [];
  const nativeScheduledCount = Math.max(0, Number(input.nativeScheduledCount ?? scheduledItems.length ?? 0));
  const matchedNumbers = matchNativeScheduledItems(scheduleData, scheduledItems);
  const nextBridge = await writeExtensionBridgeConfig({
    ...bridge,
    lastSyncAt: `${malaysiaNow()} GMT+8`,
    lastAccount: String(input.account || "").slice(0, 120),
    threadsConnected: Boolean(input.threadsConnected),
    lastNativeScheduledCount: nativeScheduledCount,
    nativeScheduledNumbers: matchedNumbers,
    lastError: "",
  });
  const updatedStatus = {
    ...statusData,
    nativeScheduleMode: true,
    lastNativeScheduleSyncAt: `${malaysiaNow()} GMT+8`,
    lastNativeThreadsConnected: Boolean(input.threadsConnected),
    lastNativeScheduledCount: nativeScheduledCount,
    nativeScheduledMatchedNumbers: matchedNumbers,
    systemStatus: "Threads native sync",
    systemNote: `Extension kesan ${nativeScheduledCount} scheduled post dalam Threads${matchedNumbers.length ? `, ${matchedNumbers.length} dipadankan dengan siri lokal` : ""}.`,
  };
  await writeJsonFile(statusFile, updatedStatus);
  await appendRuntimeLog("extension-events.log", {
    event: "native_schedule_sync",
    account: input.account || "",
    threadsConnected: Boolean(input.threadsConnected),
    nativeScheduledCount,
    matchedNumbers,
  });
  return {
    bridge: sanitizeExtensionBridgeConfig(nextBridge),
    nativeScheduledCount,
    matchedNumbers,
    queue: buildExtensionQueue(scheduleData, updatedStatus, nextBridge),
  };
}

async function recordExtensionProof(req, input) {
  const bridge = await requireExtensionBridge(req);
  const number = Number(input.number);
  if (!Number.isInteger(number) || number < 1) badRequest("Nombor siri proof extension tidak sah.");
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const post = posts[number - 1];
  if (!post) throw new HttpError(404, `Siri ${number} tidak wujud dalam jadual.`);
  if (uniqueSortedNumbers(statusData.posted).includes(number)) badRequest(`Siri ${number} sudah Lulus/posted dan tidak patut dijadualkan semula.`);

  const slot = String(input.slot || post.slot || "").trim();
  if (slot && post.slot !== slot) {
    post.slot = slot;
    scheduleData.posts = posts;
    await writeJsonFile(scheduleFile, scheduleData);
  }

  const proofMap = getNativeProofMap(statusData);
  const proof = {
    number,
    status: "native_scheduled",
    scheduledAt: `${malaysiaNow()} GMT+8`,
    slot: slot || post.slot || "",
    account: String(input.account || bridge.lastAccount || "").slice(0, 120),
    proofText: limitPostText(input.proofText || "", 280),
    nativeScheduledCount: Math.max(0, Number(input.nativeScheduledCount || bridge.lastNativeScheduledCount || 0)),
  };
  proofMap[number] = proof;
  const publishResults = statusData.publishResults && typeof statusData.publishResults === "object" ? statusData.publishResults : {};
  const updatedStatus = {
    ...statusData,
    scheduled: addNumber(statusData.scheduled, number),
    failed: removeNumber(statusData.failed, number),
    prepared: removeNumber(statusData.prepared, number),
    remaining: removeNumber(statusData.remaining, number),
    nativeScheduleMode: true,
    nativeThreadsScheduleProofs: proofMap,
    lastNativeScheduleProofAt: `${malaysiaNow()} GMT+8`,
    lastNativeScheduledCount: proof.nativeScheduledCount,
    publishResults: {
      ...publishResults,
      [number]: {
        status: "native_scheduled",
        scheduledAt: proof.scheduledAt,
        slot: proof.slot,
        account: proof.account,
        proofText: proof.proofText,
      },
    },
    systemStatus: "Threads native - Pending",
    systemNote: `Siri ${number} berjaya dijadualkan dalam Threads melalui extension dan kekal Pending sehingga slot keluar.`,
  };
  await writeJsonFile(statusFile, updatedStatus);
  await syncStoryRunsWithStatus(updatedStatus, scheduleData);
  await appendPublishLog({
    number,
    slot: proof.slot,
    mode: "threadsme-extension",
    status: "native_scheduled",
    result: proof,
  });
  const nextBridge = await writeExtensionBridgeConfig({
    ...bridge,
    lastSyncAt: `${malaysiaNow()} GMT+8`,
    lastAccount: proof.account,
    threadsConnected: true,
    lastNativeScheduledCount: proof.nativeScheduledCount,
    nativeScheduledNumbers: addNumber(bridge.nativeScheduledNumbers, number),
    lastProofs: [...(bridge.lastProofs || []), proof],
    lastError: "",
  });
  await appendRuntimeLog("extension-events.log", {
    event: "native_schedule_proof",
    number,
    slot: proof.slot,
    account: proof.account,
    nativeScheduledCount: proof.nativeScheduledCount,
  });
  return {
    bridge: sanitizeExtensionBridgeConfig(nextBridge),
    proof,
    status: updatedStatus,
  };
}

async function recordExtensionError(req, input) {
  const bridge = await requireExtensionBridge(req);
  const nextBridge = await writeExtensionBridgeConfig({
    ...bridge,
    lastError: String(input.error || "Extension error").slice(0, 260),
    lastSyncAt: `${malaysiaNow()} GMT+8`,
  });
  await appendRuntimeLog("extension-events.log", {
    event: "extension_error",
    error: input.error || "Extension error",
  });
  return { bridge: sanitizeExtensionBridgeConfig(nextBridge) };
}

async function getShopeeCookieStatus() {
  const hasCookie = Boolean(await getShopeeCookie());
  return {
    hasCookie,
    source: process.env.SHOPEE_COOKIE ? "env" : hasCookie ? "file" : "none",
    file: shopeeCookieFile.replace(workspaceRoot, "").replace(/^[/\\]/, ""),
  };
}

async function updateShopeeCookieConfig(input) {
  const cookie = String(input.cookie || "").trim();
  await mkdir(path.dirname(shopeeCookieFile), { recursive: true });
  await writeFile(shopeeCookieFile, cookie, "utf8");
  return getShopeeCookieStatus();
}

async function buildRuntimeBackup() {
  const [scheduleData, statusData, runs, publisher, shopee, productIntelCache] = await Promise.all([
    readJsonFile(scheduleFile, { posts: [] }),
    readJsonFile(statusFile, {}),
    readStoryRuns(),
    getPublisherStatus(),
    getShopeeCookieStatus(),
    readProductIntelCache(),
  ]);
  return {
    type: "threadsme-runtime-backup",
    version: "0.9.6",
    createdAt: `${malaysiaNow()} GMT+8`,
    files: {
      schedule: path.relative(workspaceRoot, scheduleFile),
      status: path.relative(workspaceRoot, statusFile),
      storyRuns: path.relative(workspaceRoot, storyRunsFile),
    },
    schedule: scheduleData,
    status: statusData,
    storyRuns: runs,
    productIntelCache: {
      version: 1,
      entries: productIntelCache,
    },
    publisher: {
      config: publisher.config,
      dueNumbers: publisher.dueNumbers,
      lastEntries: publisher.lastEntries,
    },
    privateState: {
      deepseekKeyStored: Boolean(await getApiKey().catch(() => "")),
      shopeeCookieStored: shopee.hasCookie,
      threadsTokenStored: Boolean(publisher.config?.hasToken),
    },
  };
}

async function listBackupCandidates() {
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    const full = path.join(backupRoot, entry.name);
    const info = await stat(full).catch(() => null);
    if (!info) continue;

    if (entry.isFile() && /^threadsme-backup-.*\.json$/i.test(entry.name)) {
      const data = await readJsonFile(full, null);
      candidates.push({
        source: "api-snapshot",
        file: path.relative(workspaceRoot, full),
        posts: Array.isArray(data?.schedule?.posts) ? data.schedule.posts.length : 0,
        mtime: info.mtime.toISOString(),
      });
      continue;
    }

    if (entry.isDirectory()) {
      const manifestFile = path.join(full, "manifest.json");
      const scheduleCandidate = path.join(full, "threads-schedule.json");
      const [manifest, scheduleData] = await Promise.all([
        readJsonFile(manifestFile, null),
        readJsonFile(scheduleCandidate, null),
      ]);
      const posts = Array.isArray(scheduleData?.posts)
        ? scheduleData.posts.length
        : Number(manifest?.counts?.posts || 0);
      candidates.push({
        source: /^runtime-cli-/i.test(entry.name) ? "cli-backup" : "folder-backup",
        file: path.relative(workspaceRoot, full),
        posts,
        mtime: info.mtime.toISOString(),
      });
    }
  }
  return candidates.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
}

async function fileStatus(file, { json = false } = {}) {
  try {
    const info = await stat(file);
    let validJson = null;
    if (json) {
      try {
        JSON.parse(await readFile(file, "utf8"));
        validJson = true;
      } catch {
        validJson = false;
      }
    }
    return {
      exists: true,
      bytes: info.size,
      updatedAt: info.mtime.toISOString(),
      validJson,
    };
  } catch {
    return { exists: false, bytes: 0, updatedAt: "", validJson: json ? false : null };
  }
}

async function getOpsHealth() {
  const config = await readThreadsConfig();
  const hasToken = await hasThreadsToken(config);
  const extension = await readExtensionBridgeConfig();
  return {
    ok: true,
    runtime: {
      root: runtimeRoot,
      schedule: await fileStatus(scheduleFile, { json: true }),
      status: await fileStatus(statusFile, { json: true }),
      storyRuns: await fileStatus(storyRunsFile, { json: true }),
      publishLog: await fileStatus(publishLogFile, { json: true }),
      productIntelCache: await fileStatus(productIntelCacheFile, { json: true }),
    },
    backups: {
      root: backupRoot,
      latest: (await listBackupCandidates()).slice(0, 5).map((item) => ({
        source: item.source,
        file: item.file,
        posts: item.posts,
        mtime: item.mtime,
      })),
    },
    logs: {
      root: logRoot,
      maxBytes: logMaxBytes,
      backups: logBackups,
      apiErrors: await fileStatus(path.join(logRoot, "api-errors.log")),
      publishEvents: await fileStatus(path.join(logRoot, "publish-events.log")),
      extensionEvents: await fileStatus(path.join(logRoot, "extension-events.log")),
    },
    publisher: sanitizeThreadsConfig(config, hasToken),
    extension: sanitizeExtensionBridgeConfig(extension),
    auth: {
      authRequired,
      source: (await readAdminAuth()).source,
    },
  };
}

async function saveRuntimeBackup() {
  const backup = await buildRuntimeBackup();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(backupRoot, `threadsme-backup-${stamp}.json`);
  await mkdir(backupRoot, { recursive: true });
  await writeJsonFile(filePath, backup);
  return {
    saved: true,
    file: path.relative(workspaceRoot, filePath),
    backup,
  };
}

async function updatePublisherConfig(input) {
  const current = await readThreadsConfig();
  const next = {
    ...current,
    enabled: Boolean(input.enabled),
    dryRun: input.dryRun !== false,
    threadsUserId: String(input.threadsUserId || "").trim(),
    replyMode: input.replyMode === "root" ? "root" : "chain",
    publishDelaySeconds: Math.max(0, Math.min(Number(input.publishDelaySeconds || 30), 60)),
    maxDuePerSync: Math.max(1, Math.min(Number(input.maxDuePerSync || 1), maxPostingPerDay)),
  };

  const token = String(input.accessToken || "").trim();
  if (token) {
    await mkdir(path.dirname(threadsTokenFile), { recursive: true });
    await writeFile(threadsTokenFile, token, "utf8");
  }

  const saved = await writeThreadsConfig(next);
  const hasToken = await hasThreadsToken(saved);
  const statusData = await readJsonFile(statusFile, {});
  await writeJsonFile(statusFile, {
    ...statusData,
    publisher: sanitizeThreadsConfig(saved, hasToken),
    systemStatus: "Threads API - konfigurasi disimpan",
    systemNote: saved.dryRun
      ? "Publisher disimpan dalam dry-run. Tiada post live dihantar."
      : "Publisher live disimpan. ThreadsMe akan publish slot due bila token dan User ID sah.",
    lastPublisherConfigAt: `${malaysiaNow()} GMT+8`,
  });
  return getPublisherStatus();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    const corsAllowed = applyCors(req, res, url.pathname);
    if (!corsAllowed) {
      sendJson(res, 403, { ok: false, error: "Origin tidak dibenarkan." });
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    await requireAdmin(req, url.pathname);

    if (req.method === "GET" && url.pathname === "/api/health") {
      let hasKey = false;
      try {
        hasKey = Boolean(await getApiKey());
      } catch {
        hasKey = false;
      }
      const session = await getAdminSession(req);
      const authenticated = !authRequired || Boolean(session);
      sendJson(res, 200, {
        ok: true,
        authRequired,
        authenticated,
        hasKey: authenticated ? hasKey : undefined,
        model: "deepseek-v4-flash",
        hasShopeeCookie: authenticated ? Boolean(await getShopeeCookie()) : undefined,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auth/status") {
      sendJson(res, 200, { ok: true, ...(await getAuthStatus(req)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/setup") {
      const input = await readBody(req);
      const { session, status } = await handleAuthSetup(input);
      sendJson(res, 200, { ok: true, ...status }, { "set-cookie": authCookie(session) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const input = await readBody(req);
      const { session, status } = await handleAuthLogin(input);
      sendJson(res, 200, { ok: true, ...status }, { "set-cookie": authCookie(session) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      await destroyAdminSession(req);
      sendJson(res, 200, { ok: true, authRequired, authenticated: false }, { "set-cookie": expiredAuthCookie() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/story-runs") {
      sendJson(res, 200, { ok: true, runs: await readStoryRuns() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/product-audit") {
      sendJson(res, 200, { ok: true, ...(await getProductAudit()) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/auto-audit") {
      const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
      const statusData = await readJsonFile(statusFile, {});
      const runs = await readStoryRuns();
      sendJson(res, 200, { ok: true, ...buildAutoAuditReport(scheduleData, statusData, runs) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/system-data") {
      const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
      const statusData = await readJsonFile(statusFile, {});
      sendJson(res, 200, { ok: true, schedule: scheduleData, status: statusData });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/automation-health") {
      const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
      const statusData = await readJsonFile(statusFile, {});
      const config = await readThreadsConfig();
      const hasToken = await hasThreadsToken(config);
      const runs = await readStoryRuns();
      const autoAudit = buildAutoAuditReport(scheduleData, statusData, runs);
      let hasKey = false;
      try {
        hasKey = Boolean(await getApiKey());
      } catch {
        hasKey = false;
      }
      const hasShopeeCookie = Boolean(await getShopeeCookie());
      const productIntelCache = await getProductIntelCacheStatus();
      const extensionBridge = await readExtensionBridgeConfig();
      sendJson(res, 200, {
        ok: true,
        runtimeRoot,
        deepseek: { hasKey, model: "deepseek-v4-flash" },
        shopee: { hasCookie: hasShopeeCookie, productIntelCache },
        queue: {
          totalPosts: Array.isArray(scheduleData.posts) ? scheduleData.posts.length : 0,
          pending: uniqueSortedNumbers(statusData.scheduled).length,
          posted: uniqueSortedNumbers(statusData.posted).length,
          failed: uniqueSortedNumbers(statusData.failed).length,
          blocked: uniqueSortedNumbers([...(statusData.remaining || []), ...(statusData.prepared || [])]).length,
          limit: threadsScheduleLimit,
          lastAutomationAt: statusData.lastAutomationAt || "",
        },
        publisher: sanitizeThreadsConfig(config, hasToken),
        publisherPreflight: buildPublisherPreflightSummary(scheduleData, statusData),
        extension: sanitizeExtensionBridgeConfig(extensionBridge),
        audit: productAuditSummary(scheduleData, runs),
        autoAudit: autoAudit.summary,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/extension/pairing") {
      const bridge = await readExtensionBridgeConfig();
      sendJson(res, 200, { ok: true, bridge: sanitizeExtensionBridgeConfig(bridge, { includeToken: true }) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/extension/status") {
      sendJson(res, 200, { ok: true, ...(await getExtensionBridgeStatus(req)) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/extension/next") {
      sendJson(res, 200, { ok: true, ...(await getExtensionNext(req)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/extension/sync") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await syncExtensionNativeSchedule(req, input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/extension/proof") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await recordExtensionProof(req, input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/extension/error") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await recordExtensionError(req, input)) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/threads-publisher/status") {
      sendJson(res, 200, { ok: true, ...(await getPublisherStatus()) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/shopee-cookie/status") {
      sendJson(res, 200, { ok: true, ...(await getShopeeCookieStatus()) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/runtime-backup") {
      sendJson(res, 200, { ok: true, backup: await buildRuntimeBackup() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ops-health") {
      sendJson(res, 200, await getOpsHealth());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/automation/sync") {
      const result = await runThreadsMeAutomation();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/threads-publisher/config") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await updatePublisherConfig(input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/shopee-cookie/config") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await updateShopeeCookieConfig(input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/runtime-backup/snapshot") {
      sendJson(res, 200, { ok: true, ...(await saveRuntimeBackup()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/threads-publisher/run-due") {
      const config = await readThreadsConfig();
      const hasToken = await hasThreadsToken(config);
      const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
      const statusData = await readJsonFile(statusFile, {});
      const publisher = await runThreadsPublisherDue({ scheduleData, statusData, config, hasToken });
      sendJson(res, 200, { ok: true, publisher, ...(await getPublisherStatus()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/threads-publisher/publish-one") {
      const input = await readBody(req);
      const number = Number(input.number);
      if (!Number.isInteger(number) || number < 1) badRequest("Nombor siri tidak sah.");
      const result = await publishScheduleNumber(number, { force: Boolean(input.force) });
      sendJson(res, 200, { ok: result.ok !== false, result, ...(await getPublisherStatus()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-intel") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await inspectProductIntel(input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-audit/update") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await updateProductAudit(input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/product-audit/regenerate") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await regenerateProductAudit(input)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/auto-audit/run") {
      sendJson(res, 200, { ok: true, ...(await runAutoProductAudit()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate-story") {
      const input = await autoCompleteStoryProductInput(await readBody(req));
      const result = await generateStory(input);
      const run = await saveStoryRun(input, result);
      sendJson(res, 200, { ...result, run });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/story-runs/status") {
      const input = await readBody(req);
      const result = await updateStoryRunStatus(String(input.versionId || ""), String(input.status || ""));
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError && error.expose ? error.message : "Ralat server dalaman.";
    await appendRuntimeLog("api-errors.log", {
      method: req.method || "",
      path: (() => {
        try {
          return new URL(req.url || "/", `http://${host}:${port}`).pathname;
        } catch {
          return req.url || "";
        }
      })(),
      status,
      error: message,
      internalError: error instanceof HttpError ? "" : error.message,
    });
    if (!(error instanceof HttpError)) {
      console.error(`[ThreadsMe API] ${error.stack || error.message}`);
    }
    sendJson(res, status, { ok: false, error: message });
  }
});

await ensureRuntimeFiles();

server.listen(port, host, () => {
  console.log(`ThreadsMe AI server listening at http://${host}:${port}`);
  runThreadsMeAutomation().catch((error) => console.error(`[ThreadsMe automation] ${error.message}`));
  setInterval(() => {
    runThreadsMeAutomation().catch((error) => console.error(`[ThreadsMe automation] ${error.message}`));
  }, 60_000);
});
