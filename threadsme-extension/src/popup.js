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
  scheduleStatusBadge: document.querySelector("#scheduleStatusBadge"),
  nativeCountText: document.querySelector("#nativeCountText"),
  nextNumberText: document.querySelector("#nextNumberText"),
  scheduleHelp: document.querySelector("#scheduleHelp"),
  toastStack: document.querySelector("#toastStack"),
  log: document.querySelector("#log"),
};

function cleanToastText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function showToast(title, message = "", type = "info") {
  if (!els.toastStack) return;
  const toast = document.createElement("article");
  toast.className = `toast-card ${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const marker = document.createElement("span");
  marker.className = "toast-marker";
  marker.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = cleanToastText(title, "Notifikasi");
  copy.append(heading);
  const detail = cleanToastText(message);
  if (detail) {
    const paragraph = document.createElement("p");
    paragraph.textContent = detail;
    copy.append(paragraph);
  }

  toast.append(marker, copy);
  els.toastStack.prepend(toast);
  while (els.toastStack.children.length > 3) {
    els.toastStack.lastElementChild?.remove();
  }
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 160);
  }, type === "error" ? 4400 : 2600);
}

function errorMessage(error, fallback = "Command gagal") {
  return String(error?.message || error?.error || error || fallback).trim() || fallback;
}

function readableButtonLabel(button) {
  return cleanToastText(
    button.dataset.toast
      || button.getAttribute("aria-label")
      || button.labels?.[0]?.textContent
      || button.selectedOptions?.[0]?.textContent
      || button.getAttribute("placeholder")
      || button.textContent,
    "Butang ditekan",
  ).slice(0, 80);
}

function getToastActionTarget(target) {
  const element = target?.closest?.(
    "button, a[href], [role='button'], input[type='checkbox'], input[type='radio'], select, summary",
  );
  if (element) return element;
  const label = target?.closest?.("label");
  const control = label?.control;
  if (control?.matches?.("input[type='checkbox'], input[type='radio'], select")) return control;
  return null;
}

document.addEventListener(
  "click",
  (event) => {
    const action = getToastActionTarget(event.target);
    if (!action || action.closest(".toast-card") || action.disabled) return;
    const title = action.matches("a[href]")
      ? "Pautan diterima"
      : action.matches("input, select")
        ? "Pilihan diterima"
        : "Tindakan diterima";
    showToast(title, readableButtonLabel(action), "info");
  },
  true,
);

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

function updateSchedulePanel(queue = {}, bridge = {}) {
  const target = Number(queue.targetScheduledCount || 25);
  const native = Number(queue.nativeScheduledCount || 0);
  const next = queue.nextNumber || "-";
  const connected = Boolean(bridge.threadsConnected);
  els.nativeCountText.textContent = `${native}/${target}`;
  els.nextNumberText.textContent = String(next);
  els.scheduleStatusBadge.textContent = native >= target ? "Cukup" : connected ? "Online" : "Belum sync";
  els.scheduleHelp.textContent = native >= target
    ? "Slot Threads native sudah cukup. Autopilot akan pantau semula bila slot kosong."
    : `Masih perlu ${Math.max(0, target - native)} slot. Tekan Isi sampai 25 untuk jadualkan baki approved secara automatik.`;
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
    if (result?.ok === false) throw new Error(errorMessage(result, "Command gagal"));
    showToast("Tindakan berjaya", old, "success");
    return result || { ok: true };
  } catch (error) {
    const message = errorMessage(error);
    setStatus("Ralat", message, "Gagal");
    log(`Gagal: ${message}`);
    showToast("Tindakan gagal", message, "error");
    if (els.token.value.trim()) {
      await send("THREADSME_EXTENSION_ERROR", { error: message }).catch(() => null);
    }
    return { ok: false, error: message };
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
  if (config.token) {
    setStatus("Pairing tersimpan", `Token ${String(config.token).length} aksara sudah ada. Tekan Test connection untuk semak bridge.`, "Sedia");
    send("THREADSME_API_STATUS")
      .then((status) => {
        if (status?.ok === false) return;
        updateSchedulePanel(status.queue || {}, status.bridge || {});
      })
      .catch(() => null);
  }
}

async function saveConfig() {
  const token = els.token.value.trim();
  if (!token) throw new Error("Token pairing kosong. Dapatkan token di ThreadsMe, salin, kemudian paste di sini.");
  if (token.length < 40) throw new Error("Token pairing nampak terlalu pendek. Salin token penuh daripada kotak Token pairing penuh di ThreadsMe.");
  const result = await send("THREADSME_SAVE_CONFIG", {
    bridgeUrl: els.bridgeUrl.value,
    token,
    humanDelayMs: els.humanDelayMs.value,
  });
  if (!result.ok) throw new Error(result.error || "Gagal simpan config");
  const status = await send("THREADSME_API_STATUS");
  if (!status.ok) throw new Error(errorMessage(status, "Pairing disimpan, tetapi test connection gagal."));
  const queue = status.queue || {};
  setStatus(
    "Pairing berjaya",
    `Bridge connected. Native ${queue.nativeScheduledCount || 0}/${queue.targetScheduledCount || 25}. Next siri ${queue.nextNumber || "-"}.`,
    "OK",
  );
  updateSchedulePanel(queue, status.bridge || {});
  log("Pairing disimpan dan disemak", {
    nativeScheduledCount: queue.nativeScheduledCount || 0,
    targetScheduledCount: queue.targetScheduledCount || 25,
    nextNumber: queue.nextNumber || null,
  });
  return { ok: true, config: result, status };
}

async function testConnection() {
  const result = await send("THREADSME_API_STATUS");
  if (result?.ok === false) throw new Error(errorMessage(result, "Test connection gagal."));
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
  updateSchedulePanel(queue, bridge);
  log("Status ThreadsMe", result.queue);
  return result;
}

async function connectThreads() {
  const result = await send("THREADSME_CONNECT_THREADS");
  if (result?.ok === false) throw new Error(errorMessage(result, "Connect Threads gagal."));
  setStatus("Threads dibuka", "Login akaun Threads di tab Chrome jika belum, kemudian tekan Scan Threads.", "Connect");
  log("Tab Threads", result);
  return result;
}

async function scanThreads() {
  const result = await send("THREADSME_SCAN_THREADS");
  if (result?.ok === false) throw new Error(errorMessage(result, "Scan Threads gagal."));
  setStatus(
    result.threadsConnected ? "Akaun Threads connected" : "Threads belum login",
    result.threadsConnected
      ? `${result.nativeScheduledCount || 0} scheduled dikesan dalam akaun Chrome.`
      : "Sila login Threads dalam Chrome, kemudian scan semula.",
    result.threadsConnected ? "Connected" : "Login dulu",
  );
  updateSchedulePanel(
    { nativeScheduledCount: result.nativeScheduledCount || 0, targetScheduledCount: 25 },
    { threadsConnected: result.threadsConnected },
  );
  log("Scan Threads", result);
  return result;
}

async function syncThreads() {
  const result = await send("THREADSME_SYNC_THREADS");
  if (result?.ok === false) throw new Error(errorMessage(result, "Sync ThreadsMe gagal."));
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
  updateSchedulePanel(result.synced?.queue || { nativeScheduledCount: count, targetScheduledCount: target }, { threadsConnected: connected });
  log("Sync ThreadsMe", result.synced?.queue || result);
  return result;
}

async function scheduleNext() {
  const result = await send("THREADSME_SCHEDULE_NEXT");
  if (result?.ok === false) throw new Error(errorMessage(result, "Schedule next gagal."));
  if (!result.next?.needsScheduling && !result.needsScheduling) {
    setStatus("Tiada slot perlu diisi", result.reason || result.next?.reason || "Target sudah cukup.", "Cukup");
    log("Schedule next tidak diperlukan", result);
    return result;
  }
  setStatus("Scheduled", `Siri ${result.next?.next?.number || result.proof?.proof?.number || "-"} dihantar ke Threads.`, "Proof");
  if (result.proof?.queue) updateSchedulePanel(result.proof.queue, { threadsConnected: true });
  log("Schedule next selesai", result.proof || result);
  return result;
}

async function fillToTarget() {
  let guard = 0;
  while (guard < 25) {
    guard += 1;
    const status = await send("THREADSME_API_STATUS");
    const queue = status.queue || {};
    if ((queue.nativeScheduledCount || 0) >= (queue.targetScheduledCount || 25)) {
      setStatus("Target cukup", `Threads native ${queue.nativeScheduledCount}/${queue.targetScheduledCount}.`, "Cukup");
      updateSchedulePanel(queue, { threadsConnected: true });
      log("Fill berhenti kerana target cukup", queue);
      return { ok: true, queue };
    }
    const scheduled = await scheduleNext();
    if (!scheduled.scheduled && !scheduled.proof) {
      setStatus("Autopilot berhenti", scheduled.reason || scheduled.next?.reason || "Tiada siri sesuai untuk dijadualkan.", "Guard");
      log("Fill berhenti kerana tiada schedule dibuat", scheduled);
      return { ok: true, stopped: true, reason: scheduled.reason || scheduled.next?.reason || "" };
    }
    await new Promise((resolve) => setTimeout(resolve, Number(els.humanDelayMs.value || 1800) + 2200));
    await syncThreads();
  }
  setStatus("Had guard dicapai", "Extension berhenti selepas 25 percubaan untuk elak duplicate.", "Semak");
  return { ok: true, guardReached: true };
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
