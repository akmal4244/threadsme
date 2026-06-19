const DEFAULT_CONFIG = {
  bridgeUrl: "http://127.0.0.1:8788",
  token: "",
  humanDelayMs: 1800,
  autopilotTickMinutes: 1,
};

const AUTOPILOT_ALARM_NAME = "threadsme-autopilot";
const OFFICIAL_BRIDGE_HOST = "threadsme.akmalmarvis.com";
let autopilotBusy = false;
let scheduleBusy = false;

function errorMessage(error, fallback = "Command extension gagal.") {
  return String(error?.message || error?.error || error || fallback).trim() || fallback;
}

async function getConfig() {
  const saved = await chrome.storage.local.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...saved };
}

function normalizeBridgeUrl(value) {
  const url = new URL(String(value || DEFAULT_CONFIG.bridgeUrl).trim());
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  const isLocal = localHosts.has(url.hostname) && ["http:", "https:"].includes(url.protocol);
  const isOfficialProduction =
    url.protocol === "https:" &&
    url.hostname === OFFICIAL_BRIDGE_HOST &&
    (!url.port || url.port === "443");
  if (!isLocal && !isOfficialProduction) {
    throw new Error(`Bridge URL hanya dibenarkan untuk localhost atau https://${OFFICIAL_BRIDGE_HOST}.`);
  }
  return url.origin.replace(/\/+$/g, "");
}

async function saveConfig(input = {}) {
  const next = {
    bridgeUrl: normalizeBridgeUrl(input.bridgeUrl || DEFAULT_CONFIG.bridgeUrl),
    token: String(input.token || "").trim(),
    humanDelayMs: Math.max(700, Math.min(Number(input.humanDelayMs || DEFAULT_CONFIG.humanDelayMs), 8000)),
    autopilotTickMinutes: Math.max(1, Math.min(Number(input.autopilotTickMinutes || DEFAULT_CONFIG.autopilotTickMinutes), 10)),
  };
  await chrome.storage.local.set(next);
  await ensureAutopilotAlarm();
  return next;
}

async function apiFetch(path, options = {}) {
  const config = await getConfig();
  if (!config.token) throw new Error("Token pairing ThreadsMe belum diset.");
  const bridgeUrl = normalizeBridgeUrl(config.bridgeUrl);
  const headers = new Headers(options.headers || {});
  headers.set("authorization", `Bearer ${config.token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${bridgeUrl}${path}`, {
    ...options,
    headers,
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `ThreadsMe API ${response.status}`);
  return data;
}

async function getThreadsTab() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active?.url?.startsWith("https://www.threads.com/")) return active;
  const tabs = await chrome.tabs.query({ url: "https://www.threads.com/*" });
  if (tabs[0]) return tabs[0];
  return chrome.tabs.create({ url: "https://www.threads.com/?hl=en", active: true });
}

async function sendToThreadsTab(type, payload = {}) {
  const tab = await getThreadsTab();
  await chrome.tabs.update(tab.id, { active: true });
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type, payload });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content.js"] });
    result = await chrome.tabs.sendMessage(tab.id, { type, payload });
  }
  if (result?.ok === false) throw new Error(errorMessage(result, "Command tab Threads gagal."));
  return result || {};
}

async function syncThreadsToBridge() {
  const scan = await sendToThreadsTab("THREADSME_SCAN_THREADS");
  const synced = await apiFetch("/api/extension/sync", {
    method: "POST",
    body: JSON.stringify(scan),
  });
  return { scan, synced };
}

async function scheduleNextApproved() {
  if (scheduleBusy) {
    return {
      scheduled: false,
      skipped: true,
      reason: "Satu proses schedule sedang berjalan. Extension tahan arahan baru untuk elak duplicate composer.",
    };
  }
  scheduleBusy = true;
  try {
    const next = await apiFetch("/api/extension/next");
    if (!next.needsScheduling || !next.next) return { next, scheduled: false };
    const result = await sendToThreadsTab("THREADSME_SCHEDULE_POST", {
      post: next.next,
      delayMs: (await getConfig()).humanDelayMs,
    });
    const proof = await apiFetch("/api/extension/proof", {
      method: "POST",
      body: JSON.stringify({
        number: next.next.number,
        slot: next.next.slot,
        account: result.account || "",
        proofText: result.proofText || "",
        nativeScheduledCount: result.nativeScheduledCount || 0,
        scanReliable: result.scanReliable !== false,
      }),
    });
    return { next, result, proof, scheduled: true };
  } finally {
    scheduleBusy = false;
  }
}

async function runAutopilotTick({ force = false } = {}) {
  const config = await getConfig();
  if (!config.token) return { skipped: true, reason: "Token pairing belum diset." };
  if (autopilotBusy) return { skipped: true, reason: "Autopilot masih berjalan." };
  autopilotBusy = true;
  try {
    const status = await apiFetch("/api/extension/status");
    if (!status.bridge?.autopilot && !force) {
      return { skipped: true, reason: "Autopilot bridge tidak aktif." };
    }
    const queue = status.queue || {};
    const target = Number(queue.targetScheduledCount || 25);
    if (Number(queue.nativeScheduledCount || 0) >= target) {
      return { skipped: true, reason: "Target native sudah cukup.", status };
    }
    const synced = await syncThreadsToBridge();
    const refreshed = await apiFetch("/api/extension/status");
    const refreshedQueue = refreshed.queue || {};
    if (Number(refreshedQueue.nativeScheduledCount || 0) >= Number(refreshedQueue.targetScheduledCount || target)) {
      return { synced, scheduled: false, reason: "Target cukup selepas sync." };
    }
    const scheduled = await scheduleNextApproved();
    await syncThreadsToBridge().catch(() => null);
    return { synced, scheduled };
  } catch (error) {
    await apiFetch("/api/extension/error", {
      method: "POST",
      body: JSON.stringify({ error: error.message }),
    }).catch(() => null);
    throw error;
  } finally {
    autopilotBusy = false;
  }
}

async function ensureAutopilotAlarm() {
  const config = await getConfig();
  await chrome.alarms.create(AUTOPILOT_ALARM_NAME, {
    periodInMinutes: config.autopilotTickMinutes || DEFAULT_CONFIG.autopilotTickMinutes,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const type = message?.type;
    const payload = message?.payload || {};
    if (type === "THREADSME_GET_CONFIG") return getConfig();
    if (type === "THREADSME_SAVE_CONFIG") return saveConfig(payload);
    if (type === "THREADSME_API_STATUS") return apiFetch("/api/extension/status");
    if (type === "THREADSME_API_NEXT") return apiFetch("/api/extension/next");
    if (type === "THREADSME_CONNECT_THREADS") {
      const tab = await getThreadsTab();
      return { tabId: tab.id, url: tab.url || "https://www.threads.com/?hl=en" };
    }
    if (type === "THREADSME_SCAN_THREADS") return sendToThreadsTab("THREADSME_SCAN_THREADS", payload);
    if (type === "THREADSME_SYNC_THREADS") {
      return syncThreadsToBridge();
    }
    if (type === "THREADSME_SCHEDULE_NEXT") {
      return scheduleNextApproved();
    }
    if (type === "THREADSME_AUTOPILOT_TICK") {
      return runAutopilotTick({ force: Boolean(payload.force) });
    }
    if (type === "THREADSME_EXTENSION_ERROR") {
      return apiFetch("/api/extension/error", {
        method: "POST",
        body: JSON.stringify({ error: payload.error || "Extension error" }),
      });
    }
    throw new Error("Command extension tidak dikenali.");
  })()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTOPILOT_ALARM_NAME) return;
  runAutopilotTick().catch(() => null);
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAutopilotAlarm().catch(() => null);
});

chrome.runtime.onStartup.addListener(() => {
  ensureAutopilotAlarm().catch(() => null);
});

ensureAutopilotAlarm().catch(() => null);
