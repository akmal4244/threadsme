import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = process.env.SMTA_WORKSPACE_ROOT || here;
const defaultKeyFile = path.join(workspaceRoot, "work", "private", "deepseek.key");
const keyFile = process.env.DEEPSEEK_API_KEY_FILE || defaultKeyFile;
const storyRunsFile = path.join(here, "story-runs.json");
const scheduleFile = path.join(here, "threads_flexi_marble_schedule.json");
const statusFile = path.join(here, "status.json");
const publishLogFile = path.join(here, "publish-log.json");
const threadsConfigFile = path.join(workspaceRoot, "work", "private", "threads-config.json");
const threadsTokenFile = path.join(workspaceRoot, "work", "private", "threads-access-token.txt");
const port = Number(process.env.SMTA_AI_PORT || process.argv[2] || 8788);
const host = "127.0.0.1";
const deepseekUrl = "https://api.deepseek.com/chat/completions";
const threadsGraphUrl = "https://graph.threads.net/v1.0";
const threadsScheduleLimit = 25;
const threadsApiDailyPublishLimit = 250;
const maxPostingPerDay = 25;
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
      if (failedSet.has(number)) nextStatus = "failed";
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
    if (time <= nowMs && autoCompletePastSlots) postedSet.add(number);
    else remainingSet.add(number);
  });

  const postedNow = [];
  if (autoCompletePastSlots) {
    for (const number of previousScheduled) {
      const post = posts[number - 1];
      if (!post || failedSet.has(number) || postedSet.has(number)) continue;
      if (parseScheduleSlot(post.slot).getTime() <= nowMs) {
        postedSet.add(number);
        postedNow.push(number);
      }
    }
  }

  const activeScheduled = uniqueSortedNumbers([...scheduledSet]).filter((number) => {
    const post = posts[number - 1];
    if (!post || postedSet.has(number) || failedSet.has(number)) return false;
    return parseScheduleSlot(post.slot).getTime() > nowMs;
  });

  const openSlots = Math.max(0, threadsScheduleLimit - activeScheduled.length);
  const blockedPool = uniqueSortedNumbers([...remainingSet, ...preparedSet]).filter((number) => {
    const post = posts[number - 1];
    if (!post || scheduledSet.has(number) || postedSet.has(number) || failedSet.has(number)) return false;
    return parseScheduleSlot(post.slot).getTime() > nowMs;
  });

  const promoted = blockedPool.slice(0, openSlots);
  for (const number of promoted) {
    scheduledSet.add(number);
    remainingSet.delete(number);
    preparedSet.delete(number);
  }

  const scheduled = uniqueSortedNumbers([...scheduledSet]).filter(
    (number) => !postedSet.has(number) && !failedSet.has(number),
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
    return post && !postedSet.has(number) && !failedSet.has(number) && parseScheduleSlot(post.slot).getTime() > nowMs;
  }).length;
  const blockedCount = remaining.length + prepared.length;

  let systemStatus = "Automasi aktif";
  let systemNote = "SMTA sedang pantau jadual Threads dan status queue secara automatik.";
  if (promoted.length) {
    systemStatus = "Automasi aktif - auto Pending";
    systemNote = `${formatNumberRange(promoted)} ditukar automatik daripada Blocked kepada Pending kerana slot jadual sudah kosong.`;
  } else if (postedNow.length) {
    systemStatus = "Automasi aktif - auto Lulus";
    systemNote = `${formatNumberRange(postedNow)} ditanda Lulus kerana masa posting sudah lepas.`;
  } else if (blockedCount) {
    systemStatus = "Automasi aktif - menunggu slot";
    systemNote = `${blockedCount} siri masih Blocked. SMTA akan auto jadikan Pending bila slot jadual kosong.`;
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
  if (series.some((item) => !item.text)) throw new Error(`Siri ${number} tidak lengkap.`);

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
  if (!config.threadsUserId) throw new Error("Threads User ID belum diset.");
  if (!token) throw new Error("Threads access token belum diset.");

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
  if (!post) throw new Error(`Siri ${number} tidak wujud dalam jadual.`);

  const slotTime = parseScheduleSlot(post.slot).getTime();
  const isDue = Number.isFinite(slotTime) && slotTime <= Date.now();
  if (!force && !isDue) {
    return { skipped: true, reason: "Slot belum sampai masa.", number };
  }
  if (!force && !uniqueSortedNumbers(statusData.scheduled).includes(number)) {
    return { skipped: true, reason: "Siri belum berada dalam Pending scheduled.", number };
  }
  if (!threadsConfig.dryRun && (!publisherConfig.liveReady)) {
    throw new Error("Threads API belum live-ready. Semak User ID, access token, dan mode live.");
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

async function runMtaAutomation() {
  const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
  const statusData = await readJsonFile(statusFile, {});
  const threadsConfig = await readThreadsConfig();
  const tokenReady = await hasThreadsToken(threadsConfig);
  const publisherConfig = sanitizeThreadsConfig(threadsConfig, tokenReady);
  const result = buildAutomatedStatus(scheduleData, statusData, Date.now(), {
    autoCompletePastSlots: !publisherConfig.liveReady,
    publisher: publisherConfig,
  });
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
    notes: "SMTA generated schedule.",
    posts: [],
  });
  const statusData = await readJsonFile(statusFile, {});
  const posts = Array.isArray(scheduleData.posts) ? scheduleData.posts : [];
  const versions = Array.isArray(result.versions) ? result.versions : [];
  const affiliateLink = String(input.affiliateLink || scheduleData.affiliate_link || "https://s.shopee.com.my/7VDqSOoKf3").trim();
  const postsPerDay = Math.max(1, Math.min(Number(input.postsPerDay || versions.length || 5), maxPostingPerDay));
  const slots = buildScheduleSlots(posts, versions.length, postsPerDay);
  const startNumber = posts.length + 1;

  const items = versions.map((version, index) => {
    const number = startNumber + index;
    const slot = slots[index];
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
    });
    return {
      number,
      slot,
      affiliateLink,
      queueStatus: "blocked",
    };
  });

  const queuedNumbers = items.map((item) => item.number);
  const updatedStatus = {
    ...statusData,
    remaining: uniqueSortedNumbers([...(statusData.remaining || []), ...queuedNumbers]),
    systemStatus: "Automasi aktif - story dijadualkan",
    systemNote: `${formatNumberRange(queuedNumbers)} berjaya dijana dan dimasukkan ke Jadual Threads. SMTA akan pantau ikut slot dan limit ${threadsScheduleLimit} active scheduled.`,
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
    postsPerDay,
    activeScheduledLimit: threadsScheduleLimit,
    apiDailyPublishLimit: threadsApiDailyPublishLimit,
    automation: automation.summary,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_200_000) throw new Error("Request too large");
  }
  return body ? JSON.parse(body) : {};
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
    throw new Error("Tajuk produk wajib. Masukkan nama produk Shopee supaya story tidak lari daripada produk sebenar.");
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
      fallbackReason: "DeepSeek API key tiada. SMTA guna fallback tempatan.",
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
      fallbackReason: `DeepSeek gagal (${error.message}). SMTA guna fallback tempatan.`,
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
    imageName: String(input.imageName || "").trim(),
    imageSource: String(input.imageSource || "").trim(),
    imageUrl,
    affiliateLink,
    postsPerDay: schedule.postsPerDay || Number(input.postsPerDay || 5),
    versions: result.versions.map((version, index) => ({
      id: `${runId}-v${index + 1}`,
      label: version.label || `Versi ${index + 1}`,
      status: schedule.items[index]?.queueStatus || "pending",
      scheduleNumber: schedule.items[index]?.number || null,
      slot: schedule.items[index]?.slot || "",
      mainLength: version.main.length,
      reply1Length: version.reply1.length,
      reply2Length: version.reply2.length,
    })),
    schedule,
  };
  runs.push(run);
  await writeStoryRuns(runs.slice(-100));
  return run;
}

async function updateStoryRunStatus(versionId, status) {
  const allowed = new Set(["pending", "passed", "failed"]);
  if (!allowed.has(status)) throw new Error("Invalid status");
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
  if (!changed) throw new Error("Version not found");

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
    } else {
      updatedStatus.remaining = addNumber(updatedStatus.remaining, scheduleNumber);
      updatedStatus.systemStatus = "Status manual - mohon Pending";
      updatedStatus.systemNote = `Siri ${scheduleNumber} diminta masuk Pending. SMTA hanya akan tukar jika slot scheduled benar-benar kosong.`;
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
      : "Publisher live disimpan. SMTA akan publish slot due bila token dan User ID sah.",
    lastPublisherConfigAt: `${malaysiaNow()} GMT+8`,
  });
  return getPublisherStatus();
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (req.method === "GET" && url.pathname === "/api/health") {
      let hasKey = false;
      try {
        hasKey = Boolean(await getApiKey());
      } catch {
        hasKey = false;
      }
      sendJson(res, 200, { ok: true, hasKey, model: "deepseek-v4-flash" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/story-runs") {
      sendJson(res, 200, { ok: true, runs: await readStoryRuns() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/system-data") {
      const scheduleData = await readJsonFile(scheduleFile, { posts: [] });
      const statusData = await readJsonFile(statusFile, {});
      sendJson(res, 200, { ok: true, schedule: scheduleData, status: statusData });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/threads-publisher/status") {
      sendJson(res, 200, { ok: true, ...(await getPublisherStatus()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/automation/sync") {
      const result = await runMtaAutomation();
      sendJson(res, 200, { ok: true, ...result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/threads-publisher/config") {
      const input = await readBody(req);
      sendJson(res, 200, { ok: true, ...(await updatePublisherConfig(input)) });
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
      if (!Number.isInteger(number) || number < 1) throw new Error("Nombor siri tidak sah.");
      const result = await publishScheduleNumber(number, { force: Boolean(input.force) });
      sendJson(res, 200, { ok: result.ok !== false, result, ...(await getPublisherStatus()) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate-story") {
      const input = await readBody(req);
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
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`SMTA AI server listening at http://${host}:${port}`);
  runMtaAutomation().catch((error) => console.error(`[SMTA automation] ${error.message}`));
  setInterval(() => {
    runMtaAutomation().catch((error) => console.error(`[SMTA automation] ${error.message}`));
  }, 60_000);
});
