import { createServer } from "node:http";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
const threadsConfigFile = path.join(workspaceRoot, "work", "private", "threads-config.json");
const threadsTokenFile = path.join(workspaceRoot, "work", "private", "threads-access-token.txt");
const adminAuthFile = path.join(workspaceRoot, "work", "private", "admin-auth.json");
const adminSessionFile = path.join(workspaceRoot, "work", "private", "admin-sessions.json");
const port = Number(process.env.THREADSME_AI_PORT || process.argv[2] || 8788);
const host = "127.0.0.1";
const deepseekUrl = "https://api.deepseek.com/chat/completions";
const threadsGraphUrl = "https://graph.threads.net/v1.0";
const threadsScheduleLimit = 25;
const threadsApiDailyPublishLimit = 250;
const maxPostingPerDay = 25;
const autoProductResolveLimit = Math.max(1, Math.min(Number(process.env.THREADSME_AUTO_RESOLVE_LIMIT || 8), 25));
const autoProductMinimumConfidence = Math.max(40, Math.min(Number(process.env.THREADSME_AUTO_RESOLVE_CONFIDENCE || 62), 95));
const autoQualityRegenerateLimit = Math.max(0, Math.min(Number(process.env.THREADSME_AUTO_REGENERATE_LIMIT || 25), 25));
const authRequired = process.env.THREADSME_AUTH_REQUIRED === "true";
const productIntelCacheTtlMs = Math.max(1, Number(process.env.THREADSME_PRODUCT_INTEL_CACHE_DAYS || 14)) * 24 * 60 * 60 * 1000;
const productIntelCacheMaxEntries = Math.max(50, Math.min(Number(process.env.THREADSME_PRODUCT_INTEL_CACHE_MAX || 250), 1000));
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

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (!allowedOrigins.has(origin)) return false;
  res.setHeader("access-control-allow-origin", origin);
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,x-threadsme-csrf");
  res.setHeader("vary", "Origin");
  return true;
}

function isPublicRoute(method, pathname) {
  if (method === "OPTIONS") return true;
  if (method === "GET" && pathname === "/api/health") return true;
  if (method === "GET" && pathname === "/api/auth/status") return true;
  if (method === "POST" && ["/api/auth/login", "/api/auth/setup", "/api/auth/logout"].includes(pathname)) return true;
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
  await mkdir(path.dirname(storyRunsFile), { recursive: true });
  await writeFile(storyRunsFile, JSON.stringify({ runs }, null, 2), "utf8");
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
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
  entries.push({
    id: entry.id || `pub-${Date.now()}`,
    createdAt: `${malaysiaNow()} GMT+8`,
    ...entry,
  });
  await writePublishLog(entries);
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
  const autoCompletePastSlots = options.autoCompletePastSlots !== false;
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

  posts.forEach((post, index) => {
    if (post?.qualityStatus !== "review") return;
    const number = index + 1;
    scheduledSet.delete(number);
    remainingSet.delete(number);
    preparedSet.add(number);
  });

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

  const postedNow = [];
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
    return parseScheduleSlot(post.slot).getTime() > nowMs;
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

  const futureActiveCount = uniqueSortedNumbers([...scheduledSet]).filter((number) => {
    const post = posts[number - 1];
    return post && post.qualityStatus !== "review" && !postedSet.has(number) && !failedSet.has(number) && parseScheduleSlot(post.slot).getTime() > nowMs;
  }).length;
  const blockedCount = remaining.length + prepared.length;

  let systemStatus = "Automasi aktif";
  let systemNote = "ThreadsMe sedang pantau jadual Threads dan status queue secara automatik.";
  if (promoted.length) {
    systemStatus = "Automasi aktif - auto Pending";
    systemNote = `${formatNumberRange(promoted)} ditukar automatik daripada Blocked kepada Pending kerana slot jadual sudah kosong.`;
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
      automationMode: true,
      automationLimit: threadsScheduleLimit,
      publisher,
      lastAutomationAt: `${malaysiaNow()} GMT+8`,
    },
    summary: {
      changed: automationChanged,
      promoted,
      postedNow,
      openSlots,
      activeScheduled: futureActiveCount,
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
    });

    if (!result.dryRun) {
      const latestStatus = await readJsonFile(statusFile, {});
      const updatedStatus = await markPublishSuccess(latestStatus, number, result, publisherConfig);
      return { ok: true, number, result, status: updatedStatus };
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
    return { ok: true, number, result, status: updatedStatus };
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
  const autoAudit = await runAutoProductAudit();
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const threadsConfig = await readThreadsConfig();
  const tokenReady = await hasThreadsToken(threadsConfig);
  const publisherConfig = sanitizeThreadsConfig(threadsConfig, tokenReady);
  const result = buildAutomatedStatus(scheduleData, statusData, Date.now(), {
    autoCompletePastSlots: !publisherConfig.liveReady,
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
          "Setiap post maksimum 300 aksara termasuk ruang dan link.",
          "Post utama mesti mula dengan hook yang buat orang berhenti scroll: rasa penat, malu kecil, harapan, atau konflik rumah yang familiar.",
          "Reply 1 kembangkan emosi cerita secara spesifik: situasi harian, benda yang selalu dipandang, rasa rumah belum siap, atau mood yang jatuh/naik.",
          "Reply 2 bawa resolusi secara lembut: tunjuk bagaimana produk dalam gambar relevan dengan cerita, kemudian CTA ikhlas dan link affiliate.",
          "Kalau produk tidak diketahui, jangan sebut ciri khusus yang mungkin salah. Jadikan Reply 2 sebagai jambatan natural: 'kalau tengah cari benda kecil untuk mula ubah ruang/rutin, boleh tengok produk ni'.",
          "Gunakan bahasa yang menarik, ada deep storyline, tetapi kekal ringkas dan sesuai untuk Threads.",
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
  const maxBodyLength = Math.max(20, 300 - linkBlock.length);
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
  const claimPattern = /\b(confirm|konfem|jamin|guarantee|100%|sembuh|rawat|hilang terus|paling murah|termurah|viral gila|wajib beli)\b/i;
  const typoPattern = /\b(tgok|macan|ubsuasana|mmg|x\s?yah|takde|sngt)\b/i;
  const hardIssues = [];
  const checks = [];

  const lengthOk = Object.values(parts).every((text) => text.length > 0 && text.length <= 300);
  checks.push({ key: "length", label: "Setiap post <300 aksara", passed: lengthOk });
  if (!lengthOk) hardIssues.push("Ada post kosong atau melebihi 300 aksara.");

  const linkOk = exactLink ? parts.reply2.endsWith(exactLink) : /https?:\/\/\S+$/i.test(parts.reply2);
  checks.push({ key: "affiliate", label: "Reply 2 tamat dengan link affiliate", passed: linkOk });
  if (!linkOk) hardIssues.push("Reply 2 tidak tamat dengan link affiliate tepat.");

  const relevanceOk = !productTokens.length || matchedProductTokens.length >= Math.min(2, productTokens.length);
  checks.push({ key: "relevance", label: "Relevan dengan tajuk/kategori produk", passed: relevanceOk });
  if (!relevanceOk) hardIssues.push("Story tidak cukup menyebut konteks produk sebenar.");

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

function limitPostText(text, maxLength = 300) {
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
    "Kadang bukan kita malas. Kita cuma penat nak hadap benda sama setiap hari.",
    "Ada hari, benda kecil pun boleh buat kepala rasa penuh.",
    "Pelik kan, hidup nampak biasa tapi dalam hati rasa macam tak cukup ruang.",
    "Aku pernah rasa serba tak kena walaupun benda tu nampak remeh.",
    "Bila rutin dah padat, kita mula cari jalan paling mudah untuk rasa lega.",
  ];
  const hopeHooks = [
    "Kadang perubahan besar mula dari satu keputusan kecil je.",
    "Aku suka bila benda kecil boleh bagi rasa baru dalam hari yang biasa.",
    "Tak semua benda kena tunggu sempurna baru kita mula.",
    "Ada satu rasa lega bila kita jumpa cara mudah untuk bantu diri sendiri.",
    "Rumah dan rutin tak perlu perfect. Cukup ada satu benda yang buat kita rasa lebih baik.",
  ];
  const stories = [
    "Balik kerja, aku selalu fikir nak rehat. Tapi mata tetap nampak benda yang buat mood jatuh sikit.",
    "Mula-mula aku biar je. Lama-lama baru perasan, benda kecil yang berulang tu yang paling banyak makan tenaga.",
    "Aku belajar, tak semua masalah harian perlu solusi besar. Kadang cukup mula dengan satu benda yang praktikal.",
    "Bila ada cara yang mudah, rasa macam hidup ni kurang sikit serabutnya. Tak besar pun, tapi terasa.",
    "Yang aku cari sebenarnya bukan benda mahal. Aku cuma nak rutin yang nampak lebih ringan dan tak menyusahkan.",
    "Ada masa kita cuma perlukan satu permulaan kecil untuk rasa macam masih boleh kawal keadaan.",
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
    return {
      label: `Versi ${index + 1}`,
      main: limitPostText(`${hook} Aku mula perasan, kalau nak rasa hidup lebih ringan, tak semestinya kena ubah semua sekaligus.`),
      reply1: limitPostText(`${story} Dari situ aku mula pilih solusi yang kecil, senang buat, dan tak rasa membebankan.`),
      reply2: attachExactAffiliateLink(`${product.bridge}, ${product.name} boleh jadi permulaan. ${product.moment}. Kalau rasa sesuai, ${cta}`, affiliateLink),
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
      if (String(post[key] || "").length > 300) overLimit.push({ number, key, length: String(post[key] || "").length });
    }
  });

  const runReviewItems = [];
  for (const run of runs) {
    for (const version of run.versions || []) {
      if (version.status === "review") {
        const number = Number(version.scheduleNumber);
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
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const runs = await readStoryRuns();
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
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

  scheduleData.posts = posts;
  scheduleData.lastAutoProductAuditAt = `${malaysiaNow()} GMT+8`;
  scheduleData.lastAutoProductAuditNote =
    `${touched} siri dikemas kini. ${autoFilledCount} auto isi produk, ${linkVerifiedCount} link-verified, ${protectedCount} siri diguard automatik, ${regenerated.updatedNumbers.length} auto-regenerate.`;
  await writeJsonFile(scheduleFile, scheduleData);
  if (regenerated.updatedNumbers.length) await writeStoryRuns(runs);

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
    lastEntries: log.slice(-20).reverse(),
  };
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
    const corsAllowed = applyCors(req, res);
    if (!corsAllowed) {
      sendJson(res, 403, { ok: false, error: "Origin tidak dibenarkan." });
      return;
    }

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url || "/", `http://${host}:${port}`);
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
        audit: productAuditSummary(scheduleData, runs),
        autoAudit: autoAudit.summary,
      });
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
