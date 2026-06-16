const DEFAULT_CONFIG = {
  bridgeUrl: "http://127.0.0.1:8788",
  token: "",
  humanDelayMs: 1800,
};

async function getConfig() {
  const saved = await chrome.storage.local.get(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG, ...saved };
}

function normalizeBridgeUrl(value) {
  const url = new URL(String(value || DEFAULT_CONFIG.bridgeUrl).trim());
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!["http:", "https:"].includes(url.protocol) || !allowedHosts.has(url.hostname)) {
    throw new Error("Bridge URL mesti localhost atau 127.0.0.1 untuk elak token pairing bocor.");
  }
  return url.origin.replace(/\/+$/g, "");
}

async function saveConfig(input = {}) {
  const next = {
    bridgeUrl: normalizeBridgeUrl(input.bridgeUrl || DEFAULT_CONFIG.bridgeUrl),
    token: String(input.token || "").trim(),
    humanDelayMs: Math.max(700, Math.min(Number(input.humanDelayMs || DEFAULT_CONFIG.humanDelayMs), 8000)),
  };
  await chrome.storage.local.set(next);
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
  try {
    return await chrome.tabs.sendMessage(tab.id, { type, payload });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/content.js"] });
    return chrome.tabs.sendMessage(tab.id, { type, payload });
  }
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
      const scan = await sendToThreadsTab("THREADSME_SCAN_THREADS", payload);
      const synced = await apiFetch("/api/extension/sync", {
        method: "POST",
        body: JSON.stringify(scan),
      });
      return { scan, synced };
    }
    if (type === "THREADSME_SCHEDULE_NEXT") {
      const next = await apiFetch("/api/extension/next");
      if (!next.needsScheduling || !next.next) return next;
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
        }),
      });
      return { next, result, proof };
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
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
