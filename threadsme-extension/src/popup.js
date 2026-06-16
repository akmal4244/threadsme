const els = {
  bridgeUrl: document.querySelector("#bridgeUrl"),
  token: document.querySelector("#token"),
  humanDelayMs: document.querySelector("#humanDelayMs"),
  saveConfig: document.querySelector("#saveConfig"),
  connectThreads: document.querySelector("#connectThreads"),
  testConnection: document.querySelector("#testConnection"),
  scanThreads: document.querySelector("#scanThreads"),
  syncThreads: document.querySelector("#syncThreads"),
  scheduleNext: document.querySelector("#scheduleNext"),
  fillToTarget: document.querySelector("#fillToTarget"),
  statusBadge: document.querySelector("#statusBadge"),
  statusTitle: document.querySelector("#statusTitle"),
  statusText: document.querySelector("#statusText"),
  log: document.querySelector("#log"),
};

function log(message, data = null) {
  const line = `[${new Date().toLocaleTimeString("ms-MY")}] ${message}`;
  const extra = data ? `\n${JSON.stringify(data, null, 2)}` : "";
  els.log.textContent = `${line}${extra}\n\n${els.log.textContent}`.slice(0, 5000);
}

function setStatus(title, text, badge = "Sedia") {
  els.statusTitle.textContent = title;
  els.statusText.textContent = text;
  els.statusBadge.textContent = badge;
}

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

async function withBusy(button, label, task) {
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    const result = await task();
    if (!result?.ok) throw new Error(result?.error || "Command gagal");
    return result;
  } catch (error) {
    setStatus("Ralat", error.message, "Gagal");
    log(`Gagal: ${error.message}`);
    if (els.token.value.trim()) {
      await send("THREADSME_EXTENSION_ERROR", { error: error.message }).catch(() => null);
    }
    return { ok: false, error: error.message };
  } finally {
    button.disabled = false;
    button.textContent = old;
  }
}

async function loadConfig() {
  const config = await send("THREADSME_GET_CONFIG");
  els.bridgeUrl.value = config.bridgeUrl || "http://127.0.0.1:8788";
  els.token.value = config.token || "";
  els.humanDelayMs.value = String(config.humanDelayMs || 1800);
}

async function saveConfig() {
  const result = await send("THREADSME_SAVE_CONFIG", {
    bridgeUrl: els.bridgeUrl.value,
    token: els.token.value,
    humanDelayMs: els.humanDelayMs.value,
  });
  if (!result.ok) throw new Error(result.error || "Gagal simpan config");
  setStatus("Pairing disimpan", "Extension boleh bercakap dengan ThreadsMe API.", "OK");
  log("Pairing disimpan");
}

async function testConnection() {
  const result = await send("THREADSME_API_STATUS");
  const queue = result.queue || {};
  const bridge = result.bridge || {};
  const fullyOnline =
    bridge.threadsConnected &&
    (queue.nativeScheduledCount || 0) >= (queue.targetScheduledCount || 25);
  setStatus(
    fullyOnline ? "Semua sistem online" : "ThreadsMe connected",
    `Native ${queue.nativeScheduledCount || 0}/${queue.targetScheduledCount || 25}. Akaun ${bridge.threadsConnected ? "connected" : "belum sync"}. Next siri ${queue.nextNumber || "-"} disediakan.`,
    fullyOnline ? "Online penuh" : "Online",
  );
  log("Status ThreadsMe", result.queue);
}

async function connectThreads() {
  const result = await send("THREADSME_CONNECT_THREADS");
  setStatus("Threads dibuka", "Login akaun Threads di tab Chrome jika belum, kemudian tekan Scan Threads.", "Connect");
  log("Tab Threads", result);
}

async function scanThreads() {
  const result = await send("THREADSME_SCAN_THREADS");
  setStatus(
    result.threadsConnected ? "Akaun Threads connected" : "Threads belum login",
    result.threadsConnected
      ? `${result.nativeScheduledCount || 0} scheduled dikesan dalam akaun Chrome.`
      : "Sila login Threads dalam Chrome, kemudian scan semula.",
    result.threadsConnected ? "Connected" : "Login dulu",
  );
  log("Scan Threads", result);
}

async function syncThreads() {
  const result = await send("THREADSME_SYNC_THREADS");
  const count = result.scan?.nativeScheduledCount ?? result.synced?.nativeScheduledCount ?? 0;
  const target = result.synced?.queue?.targetScheduledCount || 25;
  const connected = Boolean(result.scan?.threadsConnected);
  const allOnline = connected && count >= target;
  setStatus(
    allOnline ? "Semua sistem online" : "Sync selesai",
    connected
      ? `${count}/${target} scheduled native dihantar balik ke ThreadsMe.`
      : "ThreadsMe sync diterima, tapi akaun Threads belum dikesan login.",
    allOnline ? "Online penuh" : "Synced",
  );
  log("Sync ThreadsMe", result.synced?.queue || result);
}

async function scheduleNext() {
  const result = await send("THREADSME_SCHEDULE_NEXT");
  if (!result.next?.needsScheduling && !result.needsScheduling) {
    setStatus("Tiada slot perlu diisi", result.reason || result.next?.reason || "Target sudah cukup.", "Cukup");
    log("Schedule next tidak diperlukan", result);
    return;
  }
  setStatus("Scheduled", `Siri ${result.next?.next?.number || result.proof?.proof?.number || "-"} dihantar ke Threads.`, "Proof");
  log("Schedule next selesai", result.proof || result);
}

async function fillToTarget() {
  let guard = 0;
  while (guard < 25) {
    guard += 1;
    const status = await send("THREADSME_API_STATUS");
    const queue = status.queue || {};
    if ((queue.nativeScheduledCount || 0) >= (queue.targetScheduledCount || 25)) {
      setStatus("Target cukup", `Threads native ${queue.nativeScheduledCount}/${queue.targetScheduledCount}.`, "Cukup");
      log("Fill berhenti kerana target cukup", queue);
      return;
    }
    await scheduleNext();
    await new Promise((resolve) => setTimeout(resolve, Number(els.humanDelayMs.value || 1800) + 2200));
    await syncThreads();
  }
  setStatus("Had guard dicapai", "Extension berhenti selepas 25 percubaan untuk elak duplicate.", "Semak");
}

els.saveConfig.addEventListener("click", () => withBusy(els.saveConfig, "Menyimpan...", saveConfig));
els.connectThreads.addEventListener("click", () => withBusy(els.connectThreads, "Membuka...", connectThreads));
els.testConnection.addEventListener("click", () => withBusy(els.testConnection, "Semak...", testConnection));
els.scanThreads.addEventListener("click", () => withBusy(els.scanThreads, "Scan...", scanThreads));
els.syncThreads.addEventListener("click", () => withBusy(els.syncThreads, "Sync...", syncThreads));
els.scheduleNext.addEventListener("click", () => withBusy(els.scheduleNext, "Schedule...", scheduleNext));
els.fillToTarget.addEventListener("click", () => withBusy(els.fillToTarget, "Isi slot...", fillToTarget));

loadConfig().catch((error) => {
  setStatus("Config gagal dimuat", error.message, "Gagal");
  log(error.message);
});
