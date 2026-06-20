const state = {
  posts: [],
  timezone: "Asia/Kuala_Lumpur",
  affiliateLink: "",
  selectedIndex: 0,
  scheduled: [],
  posted: [],
  failed: [],
  prepared: [],
  remaining: [],
  systemStatus: "Draf sedia",
  systemNote: "Menunggu confirmation untuk schedule di Threads.",
  storyImageName: "",
  storyImageSource: "",
  storyImageUrl: "",
  storyRuns: [],
  selectedCalendarDate: "",
  automationSummary: null,
  automationOnline: false,
  automationHealth: null,
  autoAudit: { summary: null, actions: [] },
  productAudit: { summary: null, items: [] },
  productIntel: null,
  auth: { authRequired: false, authenticated: false, setupRequired: false, csrfToken: "", sessionToken: "", hasPassword: false, localLocked: false },
  appStarted: false,
  aiHealth: { ok: false, hasKey: false, model: "" },
  publisher: {
    config: null,
    dueNumbers: [],
    preflight: null,
    lastEntries: [],
  },
  extensionBridge: {
    config: null,
    token: "",
  },
  shopeeCookie: { hasCookie: false, source: "none", file: "" },
};

const THREADSME_BROWSER_CONFIG = window.THREADSME_CONFIG || {};
const AI_SERVER_URL = String(THREADSME_BROWSER_CONFIG.apiUrl || "http://127.0.0.1:8788").replace(/\/+$/, "");
const AI_SERVER_LABEL = AI_SERVER_URL.replace(/^https?:\/\//i, "");
const THREADS_SCHEDULE_LIMIT = 25;
const DAILY_POSTING_TARGET = 25;
const DEFAULT_PRODUCT_IMAGE = "./assets/flexi-marble-sheet.webp";
const DEFAULT_PRODUCT_IMAGE_LABEL = "Gambar produk Flexi Marble Sheet";
const AUTH_REMEMBER_STORAGE_KEY = "threadsme.auth.rememberedCredentials";
const AUTH_LOCAL_LOCK_STORAGE_KEY = "threadsme.auth.localLocked";
const AUTH_SESSION_STORAGE_KEY = "threadsme.auth.sessionToken";

function normalizeApiError(error) {
  const rawMessage = String(error?.message || "");
  if (error instanceof TypeError || /failed to fetch|load failed|networkerror/i.test(rawMessage)) {
    return new Error(
      `Server API ThreadsMe belum berjalan di ${AI_SERVER_LABEL}. Saya dah hidupkan semula; refresh page atau tekan Masuk sekali lagi.`,
    );
  }
  return error instanceof Error ? error : new Error(rawMessage || "Request API ThreadsMe gagal.");
}

function describePublisherTokenInput(token) {
  const clean = String(token || "").trim();
  if (!clean) return { hasInput: false, warning: "" };
  if (/^[a-f0-9]{32}$/i.test(clean)) {
    return {
      hasInput: true,
      warning: "Token ini nampak seperti token pendek/pairing, bukan access token Threads Graph API. Tetapan boleh disimpan, tetapi live publish belum boleh dianggap ready.",
    };
  }
  if (clean.length < 50) {
    return {
      hasInput: true,
      warning: "Token ini terlalu pendek untuk access token Threads Graph API biasa. Tetapan boleh disimpan, tetapi semak semula token live.",
    };
  }
  return { hasInput: true, warning: "" };
}

function readStoredSessionToken() {
  try {
    return window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredSessionToken(token) {
  try {
    const clean = String(token || "").trim();
    if (clean) {
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, clean);
    } else {
      window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    }
  } catch {
    // Session storage is a convenience fallback for localhost/127.0.0.1 auth.
  }
}

async function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  const sessionToken = state.auth.sessionToken || readStoredSessionToken();
  if (sessionToken && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${sessionToken}`);
  }
  if (method !== "GET" && method !== "HEAD" && state.auth.csrfToken) {
    headers.set("x-threadsme-csrf", state.auth.csrfToken);
  }
  try {
    return await fetch(`${AI_SERVER_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch (error) {
    throw normalizeApiError(error);
  }
}

async function readOptionalJson(path, fallback = {}) {
  const response = await fetch(path, { cache: "no-store" }).catch(() => null);
  if (!response || !response.ok) return fallback;
  const contentType = response.headers.get("content-type") || "";
  if (!/json/i.test(contentType)) return fallback;
  try {
    return await response.json();
  } catch {
    return fallback;
  }
}

function cleanToastText(value, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function showToast(title, message = "", type = "info", options = {}) {
  const stack = els.toastStack || document.querySelector("#toastStack");
  if (!stack) return;
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

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Tutup notifikasi");
  close.textContent = "x";

  const removeToast = () => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 180);
  };
  close.addEventListener("click", removeToast);
  toast.append(marker, copy, close);
  stack.prepend(toast);

  while (stack.children.length > 5) {
    stack.lastElementChild?.remove();
  }

  const duration = Number(options.duration || (type === "error" ? 5600 : 3200));
  window.setTimeout(removeToast, duration);
}

function showErrorToast(error, title = "Tindakan gagal") {
  const message = error instanceof Error ? error.message : String(error || "Ralat tidak diketahui.");
  showToast(title, message, "error", { duration: 6200 });
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
  ).slice(0, 90);
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

let buttonToastBound = false;
function bindButtonClickToasts() {
  if (buttonToastBound) return;
  buttonToastBound = true;
  document.addEventListener(
    "click",
    (event) => {
      const action = getToastActionTarget(event.target);
      if (!action || action.closest(".toast-card")) return;
      if (action.disabled || action.getAttribute("aria-busy") === "true") return;
      const title = action.matches("a[href]")
        ? "Pautan diterima"
        : action.matches("input, select")
          ? "Pilihan diterima"
          : "Tindakan diterima";
      showToast(title, readableButtonLabel(action), "info", { duration: 1800 });
    },
    true,
  );
}

const els = {
  toastStack: document.querySelector("#toastStack"),
  authGate: document.querySelector("#authGate"),
  authTitle: document.querySelector("#authTitle"),
  authHelp: document.querySelector("#authHelp"),
  adminUsername: document.querySelector("#adminUsername"),
  adminPassword: document.querySelector("#adminPassword"),
  adminRememberMe: document.querySelector("#adminRememberMe"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authStatus: document.querySelector("#authStatus"),
  logoutButton: document.querySelector("#logoutButton"),
  logoutConfirmModal: document.querySelector("#logoutConfirmModal"),
  cancelLogoutButton: document.querySelector("#cancelLogoutButton"),
  confirmLogoutButton: document.querySelector("#confirmLogoutButton"),
  systemStatus: document.querySelector("#systemStatus"),
  systemNote: document.querySelector("#systemNote"),
  totalPosts: document.querySelector("#totalPosts"),
  passedPosts: document.querySelector("#passedPosts"),
  pendingPosts: document.querySelector("#pendingPosts"),
  failedPosts: document.querySelector("#failedPosts"),
  blockedPosts: document.querySelector("#blockedPosts"),
  dashboardPublisherMode: document.querySelector("#dashboardPublisherMode"),
  dashboardPublisherNote: document.querySelector("#dashboardPublisherNote"),
  automationHealthGrid: document.querySelector("#automationHealthGrid"),
  healthLastSync: document.querySelector("#healthLastSync"),
  actionCenterBadge: document.querySelector("#actionCenterBadge"),
  actionPageBadge: document.querySelector("#actionPageBadge"),
  actionPageNote: document.querySelector("#actionPageNote"),
  dashboardActionSummary: document.querySelector("#dashboardActionSummary"),
  actionPageSummary: document.querySelector("#actionPageSummary"),
  dashboardActionsList: document.querySelector("#dashboardActionsList"),
  actionPageList: document.querySelector("#actionPageList"),
  autoAuditGuide: document.querySelector("#autoAuditGuide"),
  runAutoAuditDashboardButton: document.querySelector("#runAutoAuditDashboardButton"),
  runAutoAuditPageButton: document.querySelector("#runAutoAuditPageButton"),
  openActionsButton: document.querySelector("#openActionsButton"),
  openAuditFromActionsButton: document.querySelector("#openAuditFromActionsButton"),
  downloadBackupButton: document.querySelector("#downloadBackupButton"),
  creditYear: document.querySelector("#creditYear"),
  queueList: document.querySelector("#queueList"),
  visibleCount: document.querySelector("#visibleCount"),
  previewTitle: document.querySelector("#previewTitle"),
  previewBadge: document.querySelector("#previewBadge"),
  previewSlot: document.querySelector("#previewSlot"),
  previewTimezone: document.querySelector("#previewTimezone"),
  previewLengths: document.querySelector("#previewLengths"),
  previewStatusText: document.querySelector("#previewStatusText"),
  statusTable: document.querySelector("#statusTable"),
  statusTableNote: document.querySelector("#statusTableNote"),
  scheduleCalendarNote: document.querySelector("#scheduleCalendarNote"),
  scheduleCalendarGrid: document.querySelector("#scheduleCalendarGrid"),
  selectedCalendarDate: document.querySelector("#selectedCalendarDate"),
  selectedCalendarSummary: document.querySelector("#selectedCalendarSummary"),
  selectedCalendarStatusBar: document.querySelector("#selectedCalendarStatusBar"),
  selectedCalendarList: document.querySelector("#selectedCalendarList"),
  threadStack: document.querySelector("#threadStack"),
  affiliateLink: document.querySelector("#affiliateLink"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  copyPromptButton: document.querySelector("#copyPromptButton"),
  copyThreadButton: document.querySelector("#copyThreadButton"),
  copyReply2Button: document.querySelector("#copyReply2Button"),
  aiStatus: document.querySelector("#aiStatus"),
  productTitle: document.querySelector("#productTitle"),
  productCategory: document.querySelector("#productCategory"),
  storyInput: document.querySelector("#storyInput"),
  storyImage: document.querySelector("#storyImage"),
  storyFileName: document.querySelector("#storyFileName"),
  storyTheme: document.querySelector("#storyTheme"),
  productImageUrl: document.querySelector("#productImageUrl"),
  productAffiliateLink: document.querySelector("#productAffiliateLink"),
  productIntelButton: document.querySelector("#productIntelButton"),
  productIntelNote: document.querySelector("#productIntelNote"),
  postsPerDay: document.querySelector("#postsPerDay"),
  imageNotes: document.querySelector("#imageNotes"),
  versionCount: document.querySelector("#versionCount"),
  generateStoryButton: document.querySelector("#generateStoryButton"),
  imagePreview: document.querySelector("#imagePreview"),
  storyOutput: document.querySelector("#storyOutput"),
  copyStoryButton: document.querySelector("#copyStoryButton"),
  clearStoryButton: document.querySelector("#clearStoryButton"),
  generatedStatusNote: document.querySelector("#generatedStatusNote"),
  generatedStatusList: document.querySelector("#generatedStatusList"),
  netizenPreviewNote: document.querySelector("#netizenPreviewNote"),
  netizenPreviewList: document.querySelector("#netizenPreviewList"),
  auditSummaryBadge: document.querySelector("#auditSummaryBadge"),
  auditIssueCount: document.querySelector("#auditIssueCount"),
  auditMetrics: document.querySelector("#auditMetrics"),
  auditIssueList: document.querySelector("#auditIssueList"),
  auditNumbers: document.querySelector("#auditNumbers"),
  auditProductTitle: document.querySelector("#auditProductTitle"),
  auditProductCategory: document.querySelector("#auditProductCategory"),
  auditAffiliateLink: document.querySelector("#auditAffiliateLink"),
  auditNotes: document.querySelector("#auditNotes"),
  auditCopyMeta: document.querySelector("#auditCopyMeta"),
  auditCopyPreview: document.querySelector("#auditCopyPreview"),
  auditActionStatus: document.querySelector("#auditActionStatus"),
  auditSaveMetadataButton: document.querySelector("#auditSaveMetadataButton"),
  auditRegenerateButton: document.querySelector("#auditRegenerateButton"),
  publisherModeBadge: document.querySelector("#publisherModeBadge"),
  publisherReadyText: document.querySelector("#publisherReadyText"),
  publisherDueText: document.querySelector("#publisherDueText"),
  publisherModeText: document.querySelector("#publisherModeText"),
  publisherTokenText: document.querySelector("#publisherTokenText"),
  publisherSelectedText: document.querySelector("#publisherSelectedText"),
  publisherHelpText: document.querySelector("#publisherHelpText"),
  publisherLogNote: document.querySelector("#publisherLogNote"),
  publisherLogList: document.querySelector("#publisherLogList"),
  extensionStatusBadge: document.querySelector("#extensionStatusBadge"),
  extensionBridgeStatusText: document.querySelector("#extensionBridgeStatusText"),
  extensionAccountText: document.querySelector("#extensionAccountText"),
  extensionNativeCountText: document.querySelector("#extensionNativeCountText"),
  extensionBridgeUrl: document.querySelector("#extensionBridgeUrl"),
  extensionTokenPreview: document.querySelector("#extensionTokenPreview"),
  extensionTokenFull: document.querySelector("#extensionTokenFull"),
  extensionHelpText: document.querySelector("#extensionHelpText"),
  downloadExtensionButton: document.querySelector("#downloadExtensionButton"),
  loadExtensionPairingButton: document.querySelector("#loadExtensionPairingButton"),
  copyExtensionTokenButton: document.querySelector("#copyExtensionTokenButton"),
  threadsUserId: document.querySelector("#threadsUserId"),
  threadsAccessToken: document.querySelector("#threadsAccessToken"),
  threadsEnabled: document.querySelector("#threadsEnabled"),
  threadsDryRun: document.querySelector("#threadsDryRun"),
  publishDelaySeconds: document.querySelector("#publishDelaySeconds"),
  maxDuePerSync: document.querySelector("#maxDuePerSync"),
  replyMode: document.querySelector("#replyMode"),
  savePublisherButton: document.querySelector("#savePublisherButton"),
  shopeeCookieStatus: document.querySelector("#shopeeCookieStatus"),
  shopeeCookieInput: document.querySelector("#shopeeCookieInput"),
  saveShopeeCookieButton: document.querySelector("#saveShopeeCookieButton"),
  clearShopeeCookieButton: document.querySelector("#clearShopeeCookieButton"),
  runPublisherButton: document.querySelector("#runPublisherButton"),
  publishSelectedButton: document.querySelector("#publishSelectedButton"),
  unblockNextWindow: document.querySelector("#unblockNextWindow"),
  unblockSummary: document.querySelector("#unblockSummary"),
  navItems: document.querySelectorAll("[data-view-target]"),
  pagePanels: document.querySelectorAll("[data-view]"),
};

function parseSlot(slot) {
  const [datePart, timePart] = slot.split(" ");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute));
}

function formatSlot(slot) {
  return parseSlot(slot).toLocaleString("ms-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSlotDayKey(slot) {
  return String(slot || "").slice(0, 10);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatCalendarDay(dayKey, mode = "long") {
  const date = parseSlot(`${dayKey} 00:00`);
  if (mode === "short") {
    return date.toLocaleString("ms-MY", { weekday: "short", day: "2-digit", month: "short" });
  }
  return date.toLocaleString("ms-MY", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatSlotTime(slot) {
  return parseSlot(slot).toLocaleTimeString("ms-MY", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLengths(post) {
  return [post.main.length, post.reply1.length, post.reply2.length];
}

function uniqueNumbers(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isInteger))).sort(
    (a, b) => a - b,
  );
}

function tokenizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9\u00c0-\u024f]+/i)
    .map((token) => token.trim())
    .filter(Boolean);
}

function applyStatusData(statusData = {}) {
  state.scheduled = uniqueNumbers(statusData.scheduled);
  state.posted = uniqueNumbers(statusData.posted);
  state.failed = uniqueNumbers(statusData.failed);
  state.prepared = uniqueNumbers(statusData.prepared);
  state.remaining = uniqueNumbers(statusData.remaining);
  state.systemStatus = statusData.systemStatus || state.systemStatus;
  state.systemNote = statusData.systemNote || state.systemNote;
  if (statusData.publisher) {
    state.publisher.config = statusData.publisher;
  }
}

function readRememberedAuth() {
  try {
    const raw = window.localStorage.getItem(AUTH_REMEMBER_STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return {
      remember: Boolean(data.remember),
      username: String(data.username || ""),
      password: String(data.password || ""),
    };
  } catch {
    return { remember: false, username: "", password: "" };
  }
}

function saveRememberedAuth(username, password) {
  try {
    window.localStorage.setItem(
      AUTH_REMEMBER_STORAGE_KEY,
      JSON.stringify({
        remember: true,
        username: String(username || ""),
        password: String(password || ""),
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Local browser storage can be unavailable in strict privacy modes.
  }
}

function clearRememberedAuth() {
  try {
    window.localStorage.removeItem(AUTH_REMEMBER_STORAGE_KEY);
  } catch {
    // Ignore local storage errors so login/logout still works.
  }
}

function readLocalAuthLocked() {
  try {
    return window.localStorage.getItem(AUTH_LOCAL_LOCK_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function setLocalAuthLocked(locked) {
  try {
    if (locked) {
      window.localStorage.setItem(AUTH_LOCAL_LOCK_STORAGE_KEY, "true");
    } else {
      window.localStorage.removeItem(AUTH_LOCAL_LOCK_STORAGE_KEY);
    }
  } catch {
    // Local sign-out state is a UI convenience only.
  }
}

function clearAuthCredentialFields() {
  if (els.adminUsername) els.adminUsername.value = "";
  if (els.adminPassword) els.adminPassword.value = "";
}

function hydrateRememberedAuthFields() {
  const remembered = readRememberedAuth();
  if (els.adminRememberMe) els.adminRememberMe.checked = remembered.remember;
  if (remembered.remember) {
    if (els.adminUsername) els.adminUsername.value = remembered.username;
    if (els.adminPassword) els.adminPassword.value = remembered.password;
    return;
  }
  clearAuthCredentialFields();
}

function renderAuthGate() {
  if (!els.authGate) return;
  const auth = state.auth;
  const needsGate = (auth.authRequired || auth.localLocked) && !auth.authenticated;
  els.authGate.hidden = !needsGate;
  document.body.classList.toggle("auth-locked", needsGate);
  if (els.logoutButton) {
    els.logoutButton.hidden = !auth.authenticated;
    els.logoutButton.textContent = auth.authRequired ? "Log keluar" : "Kunci skrin";
  }
  if (!needsGate) return;
  const setup = Boolean(auth.setupRequired);
  if (els.authTitle) els.authTitle.textContent = setup ? "Setup Admin ThreadsMe" : "Login ThreadsMe";
  if (els.authHelp) {
    els.authHelp.textContent = setup
      ? "Tetapkan username dan kata laluan admin pertama. Ia disimpan dalam folder private dan tidak di-commit."
      : "Masukkan username dan kata laluan admin untuk akses dashboard dan API automation.";
  }
  if (els.authSubmitButton) els.authSubmitButton.textContent = setup ? "Setup & masuk" : "Masuk";
  if (els.adminPassword) {
    els.adminPassword.autocomplete = setup ? "new-password" : "current-password";
  }
  hydrateRememberedAuthFields();
}

async function refreshAuthStatus() {
  if (!state.auth.sessionToken) state.auth.sessionToken = readStoredSessionToken();
  const response = await apiFetch("/api/auth/status", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Auth status gagal");
  const authRequired = Boolean(data.authRequired);
  const hasPassword = Boolean(data.hasPassword);
  const localLocked = !authRequired && hasPassword && readLocalAuthLocked();
  state.auth = {
    authRequired,
    authenticated: localLocked ? false : Boolean(data.authenticated),
    setupRequired: localLocked ? !hasPassword : Boolean(data.setupRequired),
    csrfToken: data.csrfToken || "",
    sessionToken: data.sessionToken || state.auth.sessionToken || "",
    hasPassword,
    localLocked,
  };
  if (state.auth.authenticated && state.auth.sessionToken) {
    writeStoredSessionToken(state.auth.sessionToken);
  } else if (authRequired) {
    writeStoredSessionToken("");
  }
  renderAuthGate();
  return state.auth;
}

async function submitAuth() {
  if (!els.adminPassword || !els.authSubmitButton) return;
  const username = els.adminUsername?.value.trim() || "";
  const password = els.adminPassword.value;
  const remember = Boolean(els.adminRememberMe?.checked);
  if (!password) {
    if (els.authStatus) els.authStatus.textContent = "Masukkan kata laluan admin.";
    showToast("Login belum lengkap", "Masukkan kata laluan admin dahulu.", "warn");
    return;
  }
  els.authSubmitButton.disabled = true;
  if (els.authStatus) els.authStatus.textContent = state.auth.setupRequired ? "Menyimpan setup admin..." : "Membuka sesi...";
  try {
    const endpoint = state.auth.setupRequired ? "/api/auth/setup" : "/api/auth/login";
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password, remember }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Login gagal");
    state.auth = {
      authRequired: Boolean(data.authRequired),
      authenticated: Boolean(data.authenticated),
      setupRequired: Boolean(data.setupRequired),
      csrfToken: data.csrfToken || "",
      sessionToken: data.sessionToken || "",
      hasPassword: Boolean(data.hasPassword),
      localLocked: false,
    };
    writeStoredSessionToken(state.auth.sessionToken);
    setLocalAuthLocked(false);
    if (remember) {
      saveRememberedAuth(username, password);
    } else {
      clearRememberedAuth();
      clearAuthCredentialFields();
    }
    if (els.authStatus) els.authStatus.textContent = remember ? "Akses disahkan. Login disimpan." : "Akses disahkan.";
    showToast("Login berjaya", remember ? "Akses disahkan dan login diingat." : "Akses disahkan.", "success");
    renderAuthGate();
    await startApplicationData();
  } catch (error) {
    if (els.authStatus) els.authStatus.textContent = error.message;
    showErrorToast(error, "Login gagal");
  } finally {
    els.authSubmitButton.disabled = false;
  }
}

function closeLogoutConfirm() {
  if (!els.logoutConfirmModal) return;
  els.logoutConfirmModal.hidden = true;
}

function requestLogoutConfirmation() {
  showToast("Pengesahan diperlukan", "Popup log keluar dibuka untuk semakan Akmal.", "warn");
  if (!els.logoutConfirmModal) {
    performLogout();
    return;
  }
  const isLocalLock = !state.auth.authRequired && state.auth.hasPassword;
  const title = document.querySelector("#logoutConfirmTitle");
  const body = els.logoutConfirmModal.querySelector(".confirm-card p:not(.eyebrow)");
  const confirmButton = els.confirmLogoutButton;
  if (title) title.textContent = isLocalLock ? "Kunci skrin ThreadsMe?" : "Log keluar ThreadsMe?";
  if (body) {
    body.textContent = isLocalLock
      ? "Dashboard akan dikunci pada browser ini. Automasi dan data siri tidak dipadam."
      : "Sesi admin akan ditamatkan. Automasi dan data siri tidak dipadam.";
  }
  if (confirmButton) confirmButton.textContent = isLocalLock ? "Ya, kunci skrin" : "Ya, log keluar";
  els.logoutConfirmModal.hidden = false;
  window.setTimeout(() => els.cancelLogoutButton?.focus(), 0);
}

async function performLogout() {
  closeLogoutConfirm();
  try {
    await apiFetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  } catch {
    // Logout should still clear the UI state even if the server is temporarily unavailable.
  }
  const useLocalLock = !state.auth.authRequired && state.auth.hasPassword;
  setLocalAuthLocked(useLocalLock);
  state.auth = {
    ...state.auth,
    authenticated: !useLocalLock,
    setupRequired: useLocalLock ? false : !state.auth.hasPassword,
    csrfToken: "",
    sessionToken: "",
    localLocked: useLocalLock,
  };
  writeStoredSessionToken("");
  if (useLocalLock) {
    state.appStarted = false;
  }
  renderAuthGate();
  hydrateRememberedAuthFields();
  showToast(useLocalLock ? "Skrin dikunci" : "Log keluar berjaya", "Sesi dashboard ditamatkan dengan selamat.", "success");
}

function bindAuthGate() {
  els.authSubmitButton?.addEventListener("click", submitAuth);
  els.adminUsername?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAuth();
  });
  els.adminPassword?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAuth();
  });
  els.adminRememberMe?.addEventListener("change", () => {
    if (!els.adminRememberMe.checked) {
      clearRememberedAuth();
      clearAuthCredentialFields();
    }
  });
  els.logoutButton?.addEventListener("click", requestLogoutConfirmation);
  els.cancelLogoutButton?.addEventListener("click", closeLogoutConfirm);
  els.confirmLogoutButton?.addEventListener("click", performLogout);
  els.logoutConfirmModal?.addEventListener("click", (event) => {
    if (event.target === els.logoutConfirmModal) closeLogoutConfirm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.logoutConfirmModal && !els.logoutConfirmModal.hidden) {
      closeLogoutConfirm();
    }
  });
}

async function syncAutomationStatus() {
  try {
    const response = await apiFetch("/api/automation/sync", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Automation sync failed");
    applyStatusData(data.status || {});
    if (data.autoAudit) {
      state.autoAudit = {
        summary: data.autoAudit.summary || null,
        actions: Array.isArray(data.autoAudit.actions) ? data.autoAudit.actions : [],
      };
    }
    state.automationSummary = data.summary || null;
    state.automationOnline = true;
    return true;
  } catch {
    state.automationSummary = null;
    state.automationOnline = false;
    return false;
  }
}

async function loadScheduleData() {
  let data = null;
  try {
    const response = await apiFetch("/api/system-data", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "System data failed");
    data = payload.schedule || {};
    applyStatusData(payload.status || {});
    state.automationOnline = true;
  } catch {
    data = await readOptionalJson("./threads_flexi_marble_schedule.json", {
      posts: [],
      timezone: state.timezone,
      affiliate_link: state.affiliateLink,
    });
  }
  state.posts = Array.isArray(data.posts) ? data.posts : [];
  state.timezone = data.timezone || state.timezone;
  state.affiliateLink = data.affiliate_link || state.affiliateLink;
  if (state.selectedIndex >= state.posts.length) {
    state.selectedIndex = Math.max(0, state.posts.length - 1);
  }
  return data;
}

async function refreshSystemData({ includeStories = true } = {}) {
  await loadScheduleData();
  const synced = await syncAutomationStatus();
  if (!synced) {
    const statusData = await readOptionalJson("./status.json", {});
    applyStatusData(statusData);
  }
  if (includeStories) await loadStoryRuns();
  await loadProductAudit();
  await loadAutoAudit();
  await loadAutomationHealth();
  await loadPublisherStatus();
  await loadShopeeCookieStatus();
  render();
}

async function loadProductAudit() {
  if (!els.auditIssueList && !els.auditSummaryBadge) return;
  try {
    const response = await apiFetch("/api/product-audit", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Audit produk gagal");
    state.productAudit = {
      summary: data.summary || null,
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch (error) {
    state.productAudit = {
      summary: null,
      items: [],
      error: error.message,
    };
  }
}

async function loadAutomationHealth() {
  if (!els.automationHealthGrid) return;
  try {
    const response = await apiFetch("/api/automation-health", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Automation health gagal");
    state.automationHealth = data;
    if (data.extension) state.extensionBridge.config = data.extension;
  } catch (error) {
    state.automationHealth = { ok: false, error: error.message };
  }
}

async function loadAutoAudit() {
  if (!els.dashboardActionsList && !els.actionPageList) return;
  try {
    const response = await apiFetch("/api/auto-audit", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Auto audit gagal");
    state.autoAudit = {
      summary: data.summary || null,
      actions: Array.isArray(data.actions) ? data.actions : [],
    };
  } catch (error) {
    state.autoAudit = {
      summary: null,
      actions: [],
      error: error.message,
    };
  }
}

function getStatus(post, index) {
  const number = index + 1;
  const hasIssue = getLengths(post).some((length) => length > 300);
  if (post.qualityStatus === "review") return "review";
  if (hasIssue) return "issue";
  if (state.failed.includes(number)) return "failed";
  if (state.posted.includes(number)) return "passed";
  if (state.scheduled.includes(number)) return "pending";
  if (state.prepared.includes(number)) return "prepared";
  if (state.remaining.includes(number)) return "blocked";
  return "blocked";
}

function statusLabel(status) {
  return {
    issue: "Ada isu",
    review: "Auto Guard",
    failed: "Gagal",
    passed: "Lulus",
    pending: "Pending",
    blocked: "Blocked",
    prepared: "Disediakan",
    draft: "Pending",
  }[status];
}

function statusDetail(status) {
  return {
    issue: "Aksara melebihi had Threads.",
    review: "Quality Gate tahan siri ini sementara ThreadsMe cuba baiki secara automatik. Edit hanya pilihan.",
    failed: "Posting ditanda gagal dan perlu semakan manual.",
    passed: "ThreadsMe ada bukti siri ini sudah dipublish melalui API/manual proof atau native schedule sudah lepas masa.",
    pending: "Masih dalam queue automasi. Jika Publisher belum live, status ini belum bermaksud scheduled dalam akaun Threads.",
    blocked: "Menunggu slot automasi. Bila scheduled slot kosong, ThreadsMe akan tukar siri ini kepada Pending secara automatik.",
    prepared: "Draf sudah ready. ThreadsMe akan naikkan ke Pending apabila slot automasi kosong.",
  }[status];
}

function selectPost(index, options = {}) {
  state.selectedIndex = Math.max(0, Math.min(index, state.posts.length - 1));
  if (options.syncCalendar !== false) {
    state.selectedCalendarDate = getSlotDayKey(state.posts[state.selectedIndex]?.slot);
  }
  render();
}

function getCalendarDays() {
  const dayMap = new Map();
  state.posts.forEach((post, index) => {
    const key = getSlotDayKey(post.slot);
    if (!key) return;
    if (!dayMap.has(key)) {
        dayMap.set(key, {
          key,
          posts: [],
          counts: { passed: 0, pending: 0, failed: 0, blocked: 0, prepared: 0, review: 0, issue: 0 },
        });
    }
    const day = dayMap.get(key);
    const status = getStatus(post, index);
    day.posts.push({ post, index, status });
    day.counts[status] = (day.counts[status] || 0) + 1;
  });

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      posts: day.posts.sort((a, b) => parseSlot(a.post.slot).getTime() - parseSlot(b.post.slot).getTime()),
    }))
    .sort((a, b) => parseSlot(`${a.key} 00:00`).getTime() - parseSlot(`${b.key} 00:00`).getTime());
}

function calendarHealth(day) {
  const total = day.posts.length;
  const failedOrIssue = (day.counts.failed || 0) + (day.counts.issue || 0) + (day.counts.review || 0);
  if (total === DAILY_POSTING_TARGET && failedOrIssue === 0) {
    return { label: `Cukup ${DAILY_POSTING_TARGET}`, className: "healthy" };
  }
  if (total < DAILY_POSTING_TARGET) {
    return { label: `Kurang ${DAILY_POSTING_TARGET - total}`, className: "warning" };
  }
  if (total > DAILY_POSTING_TARGET) {
    return { label: `Lebih ${total - DAILY_POSTING_TARGET}`, className: "warning" };
  }
  return { label: "Perlu semak", className: "issue" };
}

function ensureSelectedCalendarDate(days) {
  if (!days.length) {
    state.selectedCalendarDate = "";
    return;
  }
  const hasCurrentDay = days.some((day) => day.key === state.selectedCalendarDate);
  if (!state.selectedCalendarDate) {
    const todayKey = formatDateKey(new Date());
    const focusDay = days.find((day) => day.key === todayKey) || days.find((day) => day.key > todayKey) || days[0];
    state.selectedCalendarDate = focusDay.key;
    if (focusDay.posts[0]) state.selectedIndex = focusDay.posts[0].index;
    return;
  }
  if (!hasCurrentDay) {
    const selectedPostDay = getSlotDayKey(state.posts[state.selectedIndex]?.slot);
    state.selectedCalendarDate = selectedPostDay || days[0].key;
  }
}

function getUnblockPlan() {
  const now = Date.now();
  const blockedNumbers = Array.from(new Set([...state.remaining, ...state.prepared])).sort((a, b) => a - b);
  const scheduledEntries = state.posts
    .map((post, index) => ({ number: index + 1, slot: post.slot, time: parseSlot(post.slot).getTime() }))
    .filter((entry) => state.scheduled.includes(entry.number))
    .sort((a, b) => a.time - b.time);
  const futureScheduled = scheduledEntries.filter((entry) => entry.time > now);
  const releasedSlots = scheduledEntries.length - futureScheduled.length;
  const possibleOpenSlots = Math.max(0, THREADS_SCHEDULE_LIMIT - futureScheduled.length);
  const readyNow = Math.min(possibleOpenSlots, blockedNumbers.length);
  const firstBlocked = blockedNumbers[0];
  const lastReadyNow = readyNow ? blockedNumbers[readyNow - 1] : null;
  const nextRelease = futureScheduled[0] || null;
  const allBlockedRelease = blockedNumbers.length
    ? scheduledEntries[Math.min(blockedNumbers.length, scheduledEntries.length) - 1]
    : null;

  return {
    blockedNumbers,
    releasedSlots,
    possibleOpenSlots,
    readyNow,
    firstBlocked,
    lastReadyNow,
    nextRelease,
    allBlockedRelease,
  };
}

function getStatusCounts() {
  return state.posts.reduce(
    (counts, post, index) => {
      const status = getStatus(post, index);
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    { passed: 0, pending: 0, failed: 0, blocked: 0, prepared: 0, review: 0, issue: 0 },
  );
}

function getFilteredPosts() {
  const term = els.searchInput.value.trim().toLowerCase();
  const filter = els.statusFilter.value;
  return state.posts
    .map((post, index) => ({ post, index, status: getStatus(post, index) }))
    .filter(({ post, status }) => {
      const haystack = [post.slot, post.productTitle, post.productCategory, post.main, post.reply1, post.reply2].join(" ").toLowerCase();
      const termMatch = !term || haystack.includes(term);
      const statusMatch = filter === "all" || status === filter;
      return termMatch && statusMatch;
    });
}

function renderMetrics() {
  els.systemStatus.textContent = state.systemStatus;
  els.systemNote.textContent = state.systemNote;
  els.totalPosts.textContent = state.posts.length;
  els.passedPosts.textContent = state.posted.length;
  els.pendingPosts.textContent = state.scheduled.length;
  els.failedPosts.textContent = state.failed.length;
  els.blockedPosts.textContent = state.remaining.length + state.prepared.length;
}

function makeTextElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? "").replace(/\u2014/g, " - ");
  return element;
}

function makeStatusBadge(status, label = statusLabel(status)) {
  const badge = document.createElement("mark");
  badge.className = `mini-status ${status}`;
  badge.textContent = label;
  return badge;
}

function appendChildren(parent, children) {
  children.filter(Boolean).forEach((child) => parent.append(child));
  return parent;
}

function renderQueue() {
  const visible = getFilteredPosts();
  els.visibleCount.textContent = `${visible.length} dipaparkan`;
  if (!visible.length) {
    els.queueList.replaceChildren(
      makeEmptyState("Tiada siri ditemui", "Ubah carian atau tapis status lain untuk lihat queue yang sudah dijana."),
    );
    return;
  }
  els.queueList.replaceChildren(
    ...visible.map(({ post, index, status }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `queue-item${index === state.selectedIndex ? " active" : ""}`;
      const title = makeTextElement("strong", "", `Siri ${index + 1} - ${formatSlot(post.slot)}`);
      const snippet = document.createElement("span");
      const previewText = String(post.main || "").replace(/\u2014/g, " - ");
      snippet.append(
        makeStatusBadge(status),
        document.createTextNode(` ${previewText.slice(0, 92)}${previewText.length > 92 ? "..." : ""}`),
      );
      button.append(title, snippet);
      button.addEventListener("click", () => {
        selectPost(index);
      });
      return button;
    }),
  );
}

function focusSelectedQueueItem() {
  const activeItem = els.queueList?.querySelector(".queue-item.active");
  if (!activeItem) return;
  activeItem.scrollIntoView({ block: "center", behavior: "smooth" });
}

function makePostCard(label, text) {
  const article = document.createElement("article");
  article.className = "thread-post";
  const length = text.length;
  const header = document.createElement("header");
  header.append(makeTextElement("strong", "", label), makeTextElement("span", "", `${length}/300 | target 250-295`));
  const copy = document.createElement("p");
  copy.textContent = text;
  article.append(header, copy);
  return article;
}

function renderPreview() {
  const post = state.posts[state.selectedIndex];
  if (!post) return;

  const lengths = getLengths(post);
  const status = getStatus(post, state.selectedIndex);
  els.previewTitle.textContent = `Siri ${state.selectedIndex + 1}`;
  els.previewBadge.textContent = statusLabel(status);
  els.previewBadge.className = `badge ${status}`;
  els.previewSlot.textContent = formatSlot(post.slot);
  els.previewTimezone.textContent = state.timezone;
  els.previewLengths.textContent = `${lengths.join(" / ")} | target 250-295`;
  els.previewStatusText.textContent = statusDetail(status);
  const affiliateUrl = post.affiliateLink || state.affiliateLink;
  if (affiliateUrl) {
    els.affiliateLink.href = affiliateUrl;
    els.affiliateLink.textContent = "Buka pautan Shopee";
    els.affiliateLink.removeAttribute("aria-disabled");
    els.affiliateLink.removeAttribute("tabindex");
    els.affiliateLink.classList.remove("is-disabled");
  } else {
    els.affiliateLink.removeAttribute("href");
    els.affiliateLink.textContent = "Tiada pautan Shopee";
    els.affiliateLink.setAttribute("aria-disabled", "true");
    els.affiliateLink.setAttribute("tabindex", "-1");
    els.affiliateLink.classList.add("is-disabled");
  }

  els.threadStack.replaceChildren(
    makePostCard("POST UTAMA", post.main),
    makePostCard("REPLY 1", post.reply1),
    makePostCard("REPLY 2", post.reply2),
  );
  renderNetizenPreview();
}

function renderNetizenPreview() {
  if (!els.netizenPreviewList || !els.netizenPreviewNote) return;
  const post = state.posts[state.selectedIndex];
  if (!post) {
    els.netizenPreviewNote.textContent = "Tiada siri";
    els.netizenPreviewList.replaceChildren(makeEmptyState("Belum ada preview", "Pilih siri dalam Jadual Threads dahulu."));
    return;
  }

  const checks = [];
  const lengths = getLengths(post);
  const hasAffiliate = Boolean((post.reply2 || "").includes(post.affiliateLink || state.affiliateLink || "https://"));
  const productTitle = String(post.productTitle || "").trim();
  const combined = [post.main, post.reply1, post.reply2].join(" ").toLowerCase();
  const productTokens = tokenizeText(productTitle).filter((token) => token.length > 3);
  const relevanceHit = !productTokens.length || productTokens.some((token) => combined.includes(token));

  checks.push({
    label: "Relevansi produk",
    tone: productTitle && relevanceHit ? "passed" : "review",
    detail: productTitle ? `Produk: ${productTitle}` : "Tajuk produk belum disimpan untuk siri ini.",
  });
  checks.push({
    label: "Had aksara",
    tone: lengths.every((length) => length <= 300) ? "passed" : "failed",
    detail: lengths.join(" / "),
  });
  checks.push({
    label: "CTA affiliate",
    tone: hasAffiliate ? "passed" : "review",
    detail: hasAffiliate ? "Reply 2 ada link affiliate." : "Reply 2 perlu ada link affiliate tepat.",
  });
  checks.push({
    label: "Rasa Threads",
    tone: /aku|rasa|rumah|kerja|penat|hari|bila|kadang|sekarang/.test(combined) ? "passed" : "review",
    detail: "Semak sama ada ayat terasa personal, bukan sekadar iklan.",
  });

  const reviewCount = checks.filter((item) => item.tone !== "passed").length;
  els.netizenPreviewNote.textContent = reviewCount ? `${reviewCount} perkara auto guard` : "Nampak natural untuk Threads";
  els.netizenPreviewList.replaceChildren(
    ...checks.map((item) => {
      const card = document.createElement("article");
      card.className = "netizen-card";
      card.append(makeTextElement("strong", "", item.label), makeTextElement("span", "", item.detail), makeStatusBadge(item.tone, statusLabel(item.tone)));
      return card;
    }),
  );
}

function renderStatusTable() {
  const rows = state.posts.map((post, index) => {
    const status = getStatus(post, index);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `status-row ${status}${index === state.selectedIndex ? " active" : ""}`;
    row.append(
      makeTextElement("span", "status-number", `#${index + 1}`),
      makeTextElement("span", "status-time", formatSlot(post.slot)),
      makeStatusBadge(status),
    );
    row.addEventListener("click", () => {
      selectPost(index);
    });
    return row;
  });
  if (!rows.length) {
    els.statusTable.replaceChildren(
      makeEmptyState("Belum ada status", "Jana story produk dahulu untuk bina jadual dan status posting."),
    );
    els.statusTableNote.textContent = "Menunggu jadual";
    return;
  }
  els.statusTable.replaceChildren(...rows);
  const pendingCount = state.scheduled.length;
  const automationText = state.automationOnline ? "Auto sync 60s aktif" : "Auto server offline";
  els.statusTableNote.textContent = `${automationText} | Pending aktif ${pendingCount}/${THREADS_SCHEDULE_LIMIT}`;
}

function renderScheduleCalendar() {
  if (!els.scheduleCalendarGrid || !els.selectedCalendarList) return;
  const days = getCalendarDays();
  ensureSelectedCalendarDate(days);

  if (!days.length) {
    els.scheduleCalendarNote.textContent = "Belum ada jadual";
    els.scheduleCalendarGrid.replaceChildren(
      makeEmptyState("Kalendar masih kosong", "Auto cipta story untuk bina slot 25 posting sehari."),
    );
    els.selectedCalendarDate.textContent = "Tiada hari";
    els.selectedCalendarSummary.textContent = "Jana story dahulu untuk bina kalendar posting.";
    els.selectedCalendarStatusBar.replaceChildren();
    els.selectedCalendarList.replaceChildren(
      makeEmptyState("Tiada slot untuk dipaparkan", "Slot harian akan muncul selepas story berjaya dijadualkan."),
    );
    return;
  }

  const completeDays = days.filter((day) => day.posts.length === DAILY_POSTING_TARGET).length;
  els.scheduleCalendarNote.textContent = `${completeDays}/${days.length} hari cukup ${DAILY_POSTING_TARGET} posting`;

  const cards = days.map((day) => {
    const health = calendarHealth(day);
    const isActive = day.key === state.selectedCalendarDate;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day-card ${health.className}${isActive ? " active" : ""}`;
    const healthMark = document.createElement("mark");
    healthMark.textContent = health.label;
    button.append(
      makeTextElement("span", "", formatCalendarDay(day.key, "short")),
      makeTextElement("strong", "", `${day.posts.length}/${DAILY_POSTING_TARGET}`),
      healthMark,
      makeTextElement(
        "small",
        "",
        `Lulus ${day.counts.passed || 0} | Pending ${day.counts.pending || 0} | Blocked ${(day.counts.blocked || 0) + (day.counts.prepared || 0)} | Auto Guard ${day.counts.review || 0}`,
      ),
    );
    button.addEventListener("click", () => {
      state.selectedCalendarDate = day.key;
      if (day.posts[0]) state.selectedIndex = day.posts[0].index;
      render();
    });
    return button;
  });
  els.scheduleCalendarGrid.replaceChildren(...cards);

  const selectedDay = days.find((day) => day.key === state.selectedCalendarDate) || days[0];
  const selectedHealth = calendarHealth(selectedDay);
  const blockedCount = (selectedDay.counts.blocked || 0) + (selectedDay.counts.prepared || 0);
  els.selectedCalendarDate.textContent = formatCalendarDay(selectedDay.key);
  els.selectedCalendarSummary.textContent = `${selectedDay.posts.length}/${DAILY_POSTING_TARGET} slot - ${selectedHealth.label}`;

  const summaryItems = [
    ["Lulus", selectedDay.counts.passed || 0, "passed"],
    ["Pending", selectedDay.counts.pending || 0, "pending"],
    ["Blocked", blockedCount, "blocked"],
    ["Auto Guard", selectedDay.counts.review || 0, "review"],
    ["Gagal", selectedDay.counts.failed || 0, "failed"],
    ["Isu", selectedDay.counts.issue || 0, "issue"],
  ].map(([label, value, status]) => {
    const item = document.createElement("span");
    item.className = `calendar-status-pill ${status}`;
    item.textContent = `${label} ${value}`;
    return item;
  });
  els.selectedCalendarStatusBar.replaceChildren(...summaryItems);

  const rows = selectedDay.posts.map(({ post, index, status }) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `calendar-slot-row ${status}${index === state.selectedIndex ? " active" : ""}`;

    const time = document.createElement("span");
    time.className = "calendar-slot-time";
    time.textContent = formatSlotTime(post.slot);

    const body = document.createElement("span");
    body.className = "calendar-slot-copy";
    const title = document.createElement("strong");
    title.textContent = `Siri ${index + 1}`;
    const snippet = document.createElement("small");
    snippet.textContent = post.main;
    body.append(title, snippet);

    const badge = document.createElement("mark");
    badge.className = `mini-status ${status}`;
    badge.textContent = statusLabel(status);

    row.append(time, body, badge);
    row.addEventListener("click", () => {
      state.selectedCalendarDate = selectedDay.key;
      selectPost(index, { syncCalendar: false });
    });
    return row;
  });
  els.selectedCalendarList.replaceChildren(...rows);
}

function renderUnblockAdvice() {
  if (!els.unblockNextWindow || !els.unblockSummary) return;
  const plan = getUnblockPlan();
  const promoted = state.automationSummary?.promoted || [];
  const postedNow = state.automationSummary?.postedNow || [];

  if (promoted.length) {
    const rangeText = promoted.length === 1 ? `Siri ${promoted[0]}` : `Siri ${promoted[0]}-${promoted[promoted.length - 1]}`;
    const postedText = postedNow.length
      ? ` Slot lama turut ditanda Lulus: ${postedNow.length === 1 ? `Siri ${postedNow[0]}` : `Siri ${postedNow[0]}-${postedNow[postedNow.length - 1]}`}.`
      : "";
    els.unblockNextWindow.textContent = "Auto Pending selesai";
    els.unblockSummary.textContent = `${rangeText} sudah ditukar automatik daripada Blocked kepada Pending kerana slot schedule kosong.${postedText} ThreadsMe ulang semakan setiap 60 saat.`;
    return;
  }

  if (!plan.blockedNumbers.length) {
    els.unblockNextWindow.textContent = "Tiada blocked";
    els.unblockSummary.textContent = "Semua siri sudah berada dalam queue automasi yang jelas. Tiada unblock manual diperlukan sekarang.";
    return;
  }

  if (plan.readyNow > 0) {
    const rangeText =
      plan.readyNow === 1 ? `Siri ${plan.firstBlocked}` : `Siri ${plan.firstBlocked}-${plan.lastReadyNow}`;
    const fullBatchText = plan.allBlockedRelease
      ? ` Untuk semua ${plan.blockedNumbers.length} baki, ThreadsMe akan terus promote secara automatik selepas slot sehingga ${formatSlot(plan.allBlockedRelease.slot)} selesai.`
      : "";
    els.unblockNextWindow.textContent = `${plan.readyNow} slot automasi kosong`;
    els.unblockSummary.textContent = `${rangeText} layak naik daripada Blocked kepada Pending. ThreadsMe akan sync automatik melalui server setiap 60 saat.${fullBatchText}`;
    return;
  }

  if (plan.nextRelease) {
    els.unblockNextWindow.textContent = `Slot seterusnya: ${formatSlot(plan.nextRelease.slot)}`;
    els.unblockSummary.textContent = `Siri ${plan.firstBlocked} akan naik ke Pending selepas satu scheduled slot selesai. Untuk semua ${plan.blockedNumbers.length} baki, ThreadsMe akan bergerak ikut slot seterusnya sehingga ${formatSlot(plan.allBlockedRelease.slot)} jika jadual berjalan seperti biasa.`;
    return;
  }

  els.unblockNextWindow.textContent = "Perlu semakan manual";
  els.unblockSummary.textContent = "ThreadsMe tidak jumpa slot scheduled masa depan untuk dikitar secara automatik. Semak status queue atau tambah jadual baharu.";
}

function renderAutomationHealth() {
  if (!els.automationHealthGrid) return;
  const health = state.automationHealth || {};
  const queue = health.queue || {};
  const publisher = health.publisher || state.publisher.config || {};
  const preflight = health.publisherPreflight || state.publisher.preflight || {};
  const audit = health.audit || state.productAudit.summary || {};
  const autoAudit = health.autoAudit || state.autoAudit.summary || {};
  const extension = health.extension || state.extensionBridge.config || {};
  const extensionOnline =
    Boolean(extension.lastSyncAt) &&
    Boolean(extension.threadsConnected) &&
    (extension.lastNativeScheduledCount || 0) >= Math.min(extension.targetScheduledCount || THREADS_SCHEDULE_LIMIT, THREADS_SCHEDULE_LIMIT);
  const cards = [
    {
      label: "AI Server",
      value: health.ok === false ? "Offline" : state.automationOnline ? "Online" : "Semak",
      detail: health.error || `Endpoint API ${AI_SERVER_LABEL}`,
      tone: health.ok === false ? "bad" : state.automationOnline ? "good" : "warn",
    },
    {
      label: "DeepSeek",
      value: health.deepseek?.hasKey || state.aiHealth.hasKey ? "Key OK" : "Key tiada",
      detail: health.deepseek?.model || state.aiHealth.model || "deepseek-v4-flash",
      tone: health.deepseek?.hasKey || state.aiHealth.hasKey ? "good" : "warn",
    },
    {
      label: "Shopee Intel",
      value: health.shopee?.hasCookie ? "Cookie OK" : "Tanpa cookie",
      detail: health.shopee?.productIntelCache
        ? `${health.shopee.productIntelCache.entries || 0} cache produk`
        : health.shopee?.hasCookie
          ? "Boleh cuba endpoint login"
          : "Fallback metadata + DeepSeek",
      tone: health.shopee?.hasCookie ? "good" : "warn",
    },
    {
      label: "Pending aktif",
      value: `${queue.pending ?? state.scheduled.length}/${queue.limit || THREADS_SCHEDULE_LIMIT}`,
      detail: "Queue scheduled aktif",
      tone: (queue.pending ?? state.scheduled.length) >= THREADS_SCHEDULE_LIMIT ? "good" : "warn",
    },
    {
      label: "Blocked",
      value: String(queue.blocked ?? state.remaining.length + state.prepared.length),
      detail: "Auto promote bila slot kosong",
      tone: (queue.blocked ?? 0) ? "warn" : "good",
    },
    {
      label: "Quality Gate",
      value: `${audit.reviewCount || 0} semak`,
      detail: `${audit.missingProductTitleCount || 0} kosong, ${audit.unverifiedProductCount || 0} belum sah, ${audit.targetLengthIssueCount || 0} length`,
      tone: (audit.reviewCount || audit.missingProductTitleCount || audit.unverifiedProductCount || audit.targetLengthIssueCount) ? "warn" : "good",
    },
    {
      label: "Auto Audit",
      value: `${autoAudit.autoPassed || 0} auto`,
      detail: `${autoAudit.autoGuarded || 0} diguard, edit pilihan`,
      tone: autoAudit.regenerateReady ? "warn" : "good",
    },
    {
      label: "Preflight",
      value: preflight.enabled === false ? "Off" : preflight.aiEnabled === false ? "Local" : "DeepSeek",
      detail: preflight.lastAt
        ? `${preflight.lastStatus || "semak"} | score min ${preflight.minScore || 82}`
        : `Final QA sebelum publish | score min ${preflight.minScore || 82}`,
      tone: preflight.blockedCount || preflight.waitingAiCount ? "warn" : "good",
    },
    {
      label: "Extension",
      value: extensionOnline ? "Online penuh" : extension.lastSyncAt ? `${extension.lastNativeScheduledCount || 0}/${extension.targetScheduledCount || THREADS_SCHEDULE_LIMIT}` : "Belum connect",
      detail: extension.lastSyncAt ? `Akaun: ${extension.threadsConnected ? extension.lastAccount || "connected" : "belum login"}` : "Connect akaun Threads melalui extension",
      tone: extensionOnline ? "good" : "warn",
    },
    {
      label: "Publisher",
      value: publisher.liveReady ? "Live sedia" : publisher.dryRun === false ? "Belum lengkap" : "Mod selamat",
      detail: publisher.hasToken ? "Token disimpan" : "Token belum ada",
      tone: publisher.liveReady ? "good" : "warn",
    },
  ];

  els.automationHealthGrid.replaceChildren(
    ...cards.map((card) => {
      const article = document.createElement("article");
      article.className = `health-card ${card.tone}`;
      article.append(
        makeTextElement("span", "", card.label),
        makeTextElement("strong", "", card.value),
        makeTextElement("small", "", card.detail),
      );
      return article;
    }),
  );
  if (els.healthLastSync) {
    els.healthLastSync.textContent = `Sync ${new Date().toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit" })}`;
  }
}

function renderActionCenter() {
  const summary = state.autoAudit.summary || {};
  const actions = state.autoAudit.actions || [];
  const issueCount = summary.issueCount || actions.length || 0;
  const badgeText = state.autoAudit.error ? "Auto audit offline" : issueCount ? `${issueCount} isu dipantau` : "Stabil";
  const noteText = summary.lastAutoAuditAt ? `Auto audit terakhir ${summary.lastAutoAuditAt}` : "Auto audit berjalan bersama sync 60 saat";

  [els.actionCenterBadge, els.actionPageBadge].forEach((badge) => {
    if (!badge) return;
    badge.textContent = badgeText;
    badge.className = issueCount ? "warn" : "ready";
  });
  if (els.actionPageNote) els.actionPageNote.textContent = noteText;

  renderActionSummary(els.dashboardActionSummary, summary);
  renderActionSummary(els.actionPageSummary, summary);
  renderActionList(els.dashboardActionsList, actions.slice(0, 3), true);
  renderActionList(els.actionPageList, actions, false);
  renderAutoAuditGuide(summary);
}

function renderActionSummary(container, summary) {
  if (!container) return;
  const cards = [
    ["Autopilot", summary.autoPassed || 0, "Lulus Quality Gate"],
    ["Auto isi", summary.autoFilled || 0, "Daripada Shopee/DeepSeek"],
    ["Guarded", summary.autoGuarded || 0, "Ditahan senyap jika risiko"],
    ["Auto baiki", summary.regenerateReady || 0, "Regenerate automatik"],
    ["Edit pilihan", summary.humanRequired || 0, "Hanya bila Akmal mahu"],
  ];
  container.replaceChildren(
    ...cards.map(([label, value, detail]) => {
      const item = document.createElement("article");
      item.className = "action-summary-card";
      item.append(
        makeTextElement("span", "", label),
        makeTextElement("strong", "", String(value)),
        makeTextElement("small", "", detail),
      );
      return item;
    }),
  );
}

function renderActionList(container, actions, compact = false) {
  if (!container) return;
  if (state.autoAudit.error) {
    container.replaceChildren(makeEmptyState("Auto audit offline", state.autoAudit.error));
    return;
  }
  if (!actions.length) {
    renderAutopilotFlow(container, compact);
    return;
  }

  container.replaceChildren(
    ...actions.map((action) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `action-card ${action.priority || "medium"}${compact ? " compact" : ""}`;
      const body = document.createElement("span");
      body.className = "action-card-body";
      body.append(
        makeTextElement("strong", "", action.title || "Semak tindakan"),
        makeTextElement("small", "", action.detail || action.nextStep || ""),
        makeTextElement("em", "", action.nextStep || ""),
      );
      button.append(
        makeTextElement("span", "action-number", action.number ? `#${action.number}` : "Auto"),
        body,
        makeStatusBadge(action.mode === "user_required" ? "review" : "issue", action.cta || "Semak"),
      );
      button.addEventListener("click", () => openActionTarget(action));
      return button;
    }),
  );
}

function buildAutopilotFlowItems() {
  const summary = state.autoAudit.summary || {};
  const health = state.automationHealth || {};
  const queue = health.queue || {};
  const publisher = health.publisher || state.publisher.config || {};
  const preflight = health.publisherPreflight || state.publisher.preflight || {};
  const extension = health.extension || state.extensionBridge.config || {};
  const deepseekReady = Boolean(health.deepseek?.hasKey || state.aiHealth.hasKey);
  const pending = queue.pending ?? state.scheduled.length;
  const limit = queue.limit || THREADS_SCHEDULE_LIMIT;
  const nativeCount = extension.lastNativeScheduledCount || 0;
  const nativeTarget = extension.targetScheduledCount || THREADS_SCHEDULE_LIMIT;
  const extensionReady = Boolean(extension.lastSyncAt && extension.threadsConnected && nativeCount >= Math.min(nativeTarget, THREADS_SCHEDULE_LIMIT));
  const publisherReady = Boolean(publisher.liveReady);
  const preflightDeepSeek = preflight.enabled === false ? false : preflight.aiEnabled !== false;

  return [
    {
      step: "01",
      title: "Product Intel + DeepSeek",
      detail: deepseekReady
        ? `${summary.autoFilled || 0} siri sudah auto isi/sahkan produk. DeepSeek digunakan bila link/gambar perlukan inferens.`
        : "DeepSeek key belum dikesan. ThreadsMe masih guna metadata tempatan, tapi inferens produk akan lebih lemah.",
      status: deepseekReady ? "passed" : "review",
      badge: deepseekReady ? "DeepSeek OK" : "Key tiada",
    },
    {
      step: "02",
      title: "Quality Gate story",
      detail: `${summary.autoPassed || 0} siri lulus. ${summary.autoGuarded || 0} diguard senyap jika produk/link/ayat tak cukup selamat.`,
      status: (summary.autoGuarded || 0) ? "pending" : "passed",
      badge: (summary.autoGuarded || 0) ? "Guard aktif" : "Lulus",
    },
    {
      step: "03",
      title: "Auto regenerate",
      detail: (summary.regenerateReady || 0)
        ? `${summary.regenerateReady} siri dikenal pasti untuk auto-baiki copywriting dengan DeepSeek.`
        : "Tiada siri kritikal menunggu regenerate. Flow kekal autopilot.",
      status: (summary.regenerateReady || 0) ? "pending" : "passed",
      badge: (summary.regenerateReady || 0) ? "Auto baiki" : "Stabil",
    },
    {
      step: "04",
      title: "Queue 25 Pending",
      detail: `${pending}/${limit} Pending aktif. Baki Blocked/Prepared akan naik sendiri bila slot kosong.`,
      status: pending >= limit ? "passed" : "pending",
      badge: pending >= limit ? "25 aktif" : "Isi slot",
    },
    {
      step: "05",
      title: "Threads Extension sync",
      detail: extension.lastSyncAt
        ? `${nativeCount}/${nativeTarget} scheduled native dikesan. Akaun: ${extension.threadsConnected ? extension.lastAccount || "connected" : "belum login"}.`
        : "Extension belum sync. Bila extension hidup, ThreadsMe akan tally scheduled sebenar dan isi slot kosong.",
      status: extensionReady ? "passed" : "pending",
      badge: extensionReady ? "Online" : "Sync",
    },
    {
      step: "06",
      title: "Publisher Preflight",
      detail: preflightDeepSeek
        ? `Final QA DeepSeek aktif sebelum publish. Mode publisher: ${publisherReady ? "live sedia" : "mod selamat/dry-run"}.`
        : `Final QA berjalan secara tempatan. Mode publisher: ${publisherReady ? "live sedia" : "mod selamat/dry-run"}.`,
      status: publisherReady ? "passed" : "pending",
      badge: publisherReady ? "Live" : preflightDeepSeek ? "DeepSeek QA" : "Local QA",
    },
  ];
}

function renderAutopilotFlow(container, compact = false) {
  const items = buildAutopilotFlowItems();
  const visible = compact ? items.slice(0, 3) : items;
  container.replaceChildren(
    ...visible.map((item) => {
      const article = document.createElement("article");
      article.className = `action-card flow ${item.status}${compact ? " compact" : ""}`;
      const body = document.createElement("span");
      body.className = "action-card-body";
      body.append(
        makeTextElement("strong", "", item.title),
        makeTextElement("small", "", item.detail),
        makeTextElement("em", "", "Automatik - tiada tindakan manual diperlukan kecuali Akmal mahu edit."),
      );
      article.append(
        makeTextElement("span", "action-number", item.step),
        body,
        makeStatusBadge(item.status, item.badge),
      );
      return article;
    }),
  );
}

function renderAutoAuditGuide(summary) {
  if (!els.autoAuditGuide) return;
  const health = state.automationHealth || {};
  const extension = health.extension || state.extensionBridge.config || {};
  const items = [
    ["Objektif", summary.objective || "Pastikan copywriting tepat dan bermanfaat untuk netizen Malaysia."],
    ["Mode", summary.mode || "automasi stabil"],
    ["DeepSeek API", health.deepseek?.hasKey || state.aiHealth.hasKey ? `Aktif - ${health.deepseek?.model || state.aiHealth.model || "deepseek-v4-flash"}` : "Belum dikesan"],
    ["Auto isi produk", `${summary.autoFilled || 0} siri`],
    ["Auto regenerate", `${summary.regenerateReady || 0} siri dipantau`],
    ["Auto guard", `${summary.verifyNeeded || summary.unverifiedProductCount || 0} siri confidence rendah`],
    ["Threads native", extension.lastSyncAt ? `${extension.lastNativeScheduledCount || 0}/${extension.targetScheduledCount || THREADS_SCHEDULE_LIMIT} scheduled` : "Belum sync extension"],
    ["Semak terakhir", summary.lastAutoAuditAt || "Belum ada rekod"],
  ];
  els.autoAuditGuide.replaceChildren(
    ...items.map(([label, value]) => {
      const row = document.createElement("div");
      row.append(makeTextElement("span", "", label), makeTextElement("strong", "", value));
      return row;
    }),
  );
}

function openActionTarget(action) {
  if (action?.number) {
    els.auditNumbers.value = String(action.number);
    state.selectedIndex = Math.max(0, action.number - 1);
  }
  showView(action?.targetView || "audit");
  render();
}

function renderProductAudit() {
  if (!els.auditIssueList || !els.auditMetrics) return;
  const summary = state.productAudit.summary || {};
  const items = state.productAudit.items || [];
  const totalIssues =
    (summary.missingProductTitleCount || 0) +
    (summary.unverifiedProductCount || 0) +
    (summary.reviewCount || 0) +
    (summary.overLimitCount || 0);

  if (els.auditSummaryBadge) {
    els.auditSummaryBadge.textContent = state.productAudit.error ? "Audit offline" : totalIssues ? `${totalIssues} isu` : "Audit bersih";
    els.auditSummaryBadge.className = totalIssues ? "warn" : "ready";
  }
  if (els.auditIssueCount) {
    els.auditIssueCount.textContent = state.productAudit.error || `${items.length} dipaparkan`;
  }

  const metricItems = [
    ["Total siri", summary.totalPosts || state.posts.length || 0],
    ["Generated", summary.generatedCount || 0],
    ["Tiada tajuk", summary.missingProductTitleCount || 0],
    ["Confidence rendah", summary.unverifiedProductCount || 0],
    ["Auto Guard", summary.reviewCount || 0],
  ];
  els.auditMetrics.replaceChildren(
    ...metricItems.map(([label, value]) => {
      const item = document.createElement("article");
      item.className = "audit-metric";
      item.append(makeTextElement("span", "", label), makeTextElement("strong", "", String(value)));
      return item;
    }),
  );

  if (!items.length) {
    els.auditIssueList.replaceChildren(
      makeEmptyState(
        state.productAudit.error ? "Audit belum tersedia" : "Tiada isu besar",
        state.productAudit.error || "Quality Gate tidak jumpa batch lama yang perlu dibaiki sekarang.",
      ),
    );
    renderAuditCopyPreview(null);
    return;
  }

  if (!String(els.auditNumbers?.value || "").trim()) {
    populateAuditForm(items[0]);
  }

  els.auditIssueList.replaceChildren(
    ...items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `audit-issue-row${item.number === state.selectedIndex + 1 ? " active" : ""}`;
      button.append(
        makeTextElement("strong", "", `#${item.number}`),
        appendChildren(document.createElement("span"), [
          document.createTextNode(item.productTitle || item.issue || "Perlu audit"),
          makeTextElement("small", "", item.snippet || item.slot || ""),
        ]),
        makeStatusBadge(item.qualityStatus === "review" ? "review" : "issue", item.issue || "Semak"),
      );
      button.addEventListener("click", () => {
        populateAuditForm(item);
        render();
      });
      return button;
    }),
  );

  const selectedNumber = Number(String(els.auditNumbers?.value || "").match(/\d+/)?.[0] || 0);
  if (selectedNumber) {
    const selectedItem = items.find((item) => item.number === selectedNumber);
    if (selectedItem) renderAuditCopyPreview(selectedItem);
  }
}

function populateAuditForm(item) {
  if (!item) return;
  els.auditNumbers.value = String(item.number);
  els.auditProductTitle.value = item.productTitle || "";
  els.auditProductCategory.value = item.productCategory || "";
  els.auditAffiliateLink.value = item.affiliateLink || state.affiliateLink || "";
  state.selectedIndex = Math.max(0, item.number - 1);
  state.selectedCalendarDate = getSlotDayKey(state.posts[state.selectedIndex]?.slot);
  renderAuditCopyPreview(item);
}

function renderAuditCopyPreview(item) {
  if (!els.auditCopyPreview || !els.auditCopyMeta) return;
  if (!item) {
    els.auditCopyMeta.textContent = "Pilih satu siri";
    els.auditCopyPreview.replaceChildren(
      makeEmptyState(
        "Belum pilih siri",
        "Klik mana-mana isu di sebelah kiri untuk baca POST UTAMA, REPLY 1 dan REPLY 2 sebelum regenerate.",
      ),
    );
    return;
  }

  const threadParts = [
    ["POST UTAMA", item.main],
    ["REPLY 1", item.reply1],
    ["REPLY 2", item.reply2],
  ];
  els.auditCopyMeta.textContent = `Siri ${item.number} - ${item.slot || "Tiada jadual"}`;
  els.auditCopyPreview.replaceChildren(
    ...threadParts.map(([label, text]) => {
      const copy = String(text || "").trim();
      const article = document.createElement("article");
      article.className = copy.length > 300 ? "audit-copy-card over-limit" : "audit-copy-card";
      const header = document.createElement("header");
      header.append(
        makeTextElement("strong", "", label),
        makeTextElement("small", "", `${copy.length}/300 aksara`),
      );
      article.append(
        header,
        makeTextElement("p", "", copy || "Tiada ayat untuk bahagian ini."),
      );
      return article;
    }),
  );
}

function threadText(post) {
  return `[POST UTAMA]\n${post.main}\n\n[REPLY 1]\n${post.reply1}\n\n[REPLY 2]\n${post.reply2}`;
}

function makeEmptyState(title, body) {
  const empty = document.createElement("div");
  empty.className = "generated-empty empty-state";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const copy = document.createElement("span");
  copy.textContent = body;
  empty.append(heading, copy);
  return empty;
}

function storyText(versions) {
  return versions
    .map((version, index) => {
      const label = version.label || `Versi ${index + 1}`;
      return `${label}\n\n[POST UTAMA]\n${version.main}\n\n[REPLY 1]\n${version.reply1}\n\n[REPLY 2]\n${version.reply2}`;
    })
    .join("\n\n---\n\n");
}

function generatedStatusLabel(status) {
  return {
    passed: "Lulus",
    pending: "Pending",
    blocked: "Blocked",
    review: "Auto Audit",
    failed: "Gagal",
  }[status] || "Pending";
}

function generatedStatusClass(status) {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  if (status === "review") return "review";
  return "pending";
}

function setAiStatus(text, tone = "neutral") {
  if (!els.aiStatus) return;
  els.aiStatus.textContent = text;
  els.aiStatus.className = tone;
}

async function checkAiServer() {
  if (!els.aiStatus) return;
  try {
    const response = await apiFetch("/api/health", { cache: "no-store" });
    const data = await response.json();
    state.aiHealth = { ok: Boolean(data.ok), hasKey: Boolean(data.hasKey), model: data.model || "" };
    if (data.ok && data.hasKey) {
      setAiStatus(`DeepSeek sedia - ${data.model}`, "ready");
    } else {
      setAiStatus("Server AI sedia, API key tiada", "warn");
    }
  } catch {
    state.aiHealth = { ok: false, hasKey: false, model: "" };
    setAiStatus("Server AI offline", "warn");
  }
}

async function loadStoryRuns() {
  if (!els.generatedStatusList) return;
  try {
    const response = await apiFetch("/api/story-runs", { cache: "no-store" });
    const data = await response.json();
    state.storyRuns = Array.isArray(data.runs) ? data.runs : [];
  } catch {
    state.storyRuns = [];
  }
  renderGeneratedStatus();
}

function applyPublisherData(data = {}) {
  state.publisher = {
    config: data.config || state.publisher.config || null,
    dueNumbers: uniqueNumbers(data.dueNumbers),
    preflight: data.preflight || state.publisher.preflight || null,
    lastEntries: Array.isArray(data.lastEntries) ? data.lastEntries : [],
    saveNotice: state.publisher.saveNotice || "",
    statusError: "",
  };
}

async function loadPublisherStatus() {
  if (!els.publisherLogList) return;
  try {
    const response = await apiFetch("/api/threads-publisher/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Publisher status failed");
    applyPublisherData(data);
  } catch (error) {
    const previous = state.publisher || {};
    state.publisher = {
      config: previous.config || { enabled: false, dryRun: true, hasToken: false, liveReady: false },
      dueNumbers: [],
      preflight: previous.preflight || null,
      lastEntries: previous.lastEntries || [],
      saveNotice: previous.saveNotice || "",
      statusError: error.message,
    };
  }
}

async function loadShopeeCookieStatus() {
  if (!els.shopeeCookieStatus) return;
  try {
    const response = await apiFetch("/api/shopee-cookie/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Status Shopee gagal");
    state.shopeeCookie = {
      hasCookie: Boolean(data.hasCookie),
      source: data.source || "none",
      file: data.file || "",
    };
  } catch (error) {
    state.shopeeCookie = { hasCookie: false, source: "error", file: "", error: error.message };
  }
}

async function saveShopeeCookie(cookie) {
  const response = await apiFetch("/api/shopee-cookie/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cookie }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Gagal simpan cookie Shopee");
  state.shopeeCookie = {
    hasCookie: Boolean(data.hasCookie),
    source: data.source || "none",
    file: data.file || "",
  };
  return state.shopeeCookie;
}

async function downloadRuntimeBackup() {
  if (!els.downloadBackupButton) return;
  els.downloadBackupButton.disabled = true;
  els.downloadBackupButton.textContent = "Backup...";
  try {
    const response = await apiFetch("/api/runtime-backup/snapshot", { method: "POST", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Backup gagal");
    const blob = new Blob([JSON.stringify(data.backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `threadsme-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    els.downloadBackupButton.textContent = "Backup selesai";
    showToast("Backup runtime siap", "Fail backup JSON sudah dimuat turun.", "success");
    window.setTimeout(() => {
      els.downloadBackupButton.textContent = "Backup runtime";
    }, 1600);
  } catch (error) {
    els.downloadBackupButton.textContent = error.message;
    showErrorToast(error, "Backup gagal");
    window.setTimeout(() => {
      els.downloadBackupButton.textContent = "Backup runtime";
    }, 2200);
  } finally {
    els.downloadBackupButton.disabled = false;
  }
}

function isPublisherFormFocused() {
  const active = document.activeElement;
  return [
    els.threadsUserId,
    els.threadsAccessToken,
    els.threadsEnabled,
    els.threadsDryRun,
    els.publishDelaySeconds,
    els.maxDuePerSync,
    els.replyMode,
    els.shopeeCookieInput,
  ].includes(active);
}

function renderPublisher() {
  if (!els.publisherLogList) return;
  const config = state.publisher.config || { enabled: false, dryRun: true, hasToken: false, liveReady: false };
  const selectedNumber = state.selectedIndex + 1;
  const selectedPost = state.posts[state.selectedIndex];
  const selectedStatus = selectedPost ? getStatus(selectedPost, state.selectedIndex) : "-";
  const mode = config.liveReady ? "Live sedia" : config.dryRun ? "Mod selamat" : "Belum lengkap";
  const preflight = state.publisher.preflight || {};
  const tokenWarning = config.tokenWarning || "";

  els.publisherModeBadge.textContent = mode;
  els.publisherModeBadge.className = config.liveReady ? "live" : config.dryRun ? "dry" : "warn";
  els.publisherReadyText.textContent = config.liveReady
    ? "Sedia publish live"
    : config.dryRun
      ? "Mod selamat aktif"
      : "Token/User ID belum lengkap";
  els.publisherDueText.textContent = state.publisher.dueNumbers.length
    ? `${state.publisher.dueNumbers.length} due: ${state.publisher.dueNumbers.join(", ")}`
    : "0 due";
  els.publisherModeText.textContent = mode;
  els.publisherTokenText.textContent = config.hasToken
    ? tokenWarning
      ? "Ada, token pendek"
      : "Ada"
    : "Tiada";
  els.publisherSelectedText.textContent = selectedPost ? `Siri ${selectedNumber} (${statusLabel(selectedStatus)})` : "-";
  const publisherHelp = state.publisher.statusError
    ? `${state.publisher.statusError} Tetapan terakhir pada skrin dikekalkan. Jika sesi tamat, login semula dan simpan sekali lagi.`
    : state.publisher.saveNotice
      ? state.publisher.saveNotice
      : tokenWarning
        ? tokenWarning
        : config.liveReady
    ? preflight.lastAt
      ? `Live aktif. Preflight terakhir: ${preflight.lastStatus || "semak"} untuk Siri ${preflight.lastNumber || "-"} - ${preflight.lastNote || "DeepSeek final QA aktif."}`
      : "Live aktif. Setiap siri due mesti lulus Publisher Preflight DeepSeek sebelum Threads API dipanggil."
    : "Mod selamat aktif. Tiada post public dihantar sehingga User ID dan token Threads lengkap.";
  els.publisherHelpText.textContent = publisherHelp;

  if (els.dashboardPublisherMode && els.dashboardPublisherNote) {
    els.dashboardPublisherMode.textContent = mode;
    els.dashboardPublisherNote.textContent = config.liveReady
      ? "Automasi live boleh publish siri due yang sudah Pending."
      : "Live Threads API dikunci sehingga User ID dan token disahkan.";
  }

  if (!isPublisherFormFocused()) {
    els.threadsUserId.value = config.threadsUserId || "";
    els.threadsAccessToken.value = "";
    els.threadsAccessToken.placeholder = config.hasToken ? "Token sudah disimpan. Paste token baru jika mahu update." : "Paste access token Threads";
    els.threadsEnabled.checked = Boolean(config.enabled);
    els.threadsDryRun.checked = config.dryRun !== false;
    els.publishDelaySeconds.value = String(config.publishDelaySeconds || 30);
    els.maxDuePerSync.value = String(config.maxDuePerSync || 1);
    els.replyMode.value = config.replyMode || "chain";
  }

  if (els.shopeeCookieStatus) {
    const shopee = state.shopeeCookie || {};
    els.shopeeCookieStatus.textContent = shopee.error
      ? "Gagal semak"
      : shopee.hasCookie
        ? shopee.source === "env"
          ? "Cookie dari env"
          : "Cookie disimpan"
        : "Tiada cookie";
    els.shopeeCookieStatus.className = shopee.hasCookie ? "ready" : "warn";
  }

  renderExtensionBridge();

  const entries = state.publisher.lastEntries || [];
  els.publisherLogNote.textContent = entries.length ? `${entries.length} log terakhir` : "Tiada log";
  if (!entries.length) {
    els.publisherLogList.replaceChildren(
      makeEmptyState("Log publisher kosong", "Mod selamat atau publish live akan direkodkan di sini selepas dijalankan."),
    );
    return;
  }

  const rows = entries.map((entry) => {
    const row = document.createElement("div");
    row.className = `publisher-log-row ${entry.status || "dry_run"}`;
    const label = entry.status === "published"
      ? "Lulus"
      : entry.status === "failed"
        ? "Gagal"
        : entry.status === "preflight_blocked"
          ? "Preflight tahan"
          : entry.status === "preflight_waiting"
            ? "Tunggu AI"
            : "Mod selamat";
    const modeText = entry.mode === "dry-run" ? "mod selamat" : entry.mode || "mod selamat";
    const details = makeTextElement("span", "", `${label} - ${modeText}`);
    details.append(makeTextElement("small", "", entry.finishedAt || entry.createdAt || ""));
    row.append(
      makeTextElement("strong", "", `Siri ${entry.number || "-"}`),
      details,
      makeStatusBadge(
        entry.status === "failed" || entry.status === "preflight_blocked"
          ? "failed"
          : entry.status === "published"
            ? "passed"
            : "pending",
        label,
      ),
    );
    if (entry.error) {
      const error = document.createElement("em");
      error.textContent = entry.error;
      row.append(error);
    }
    return row;
  });
  els.publisherLogList.replaceChildren(...rows);
}

function renderExtensionBridge() {
  if (!els.extensionStatusBadge) return;
  const extension = state.extensionBridge.config || {};
  const nativeCount = Number(extension.lastNativeScheduledCount || 0);
  const target = Number(extension.targetScheduledCount || THREADS_SCHEDULE_LIMIT);
  const ready = Boolean(extension.lastSyncAt);
  const accountReady = Boolean(extension.threadsConnected);
  const allOnline = ready && accountReady && nativeCount >= target;
  els.extensionStatusBadge.textContent = allOnline ? "Semua sistem online" : ready ? "Extension sync" : "Belum connect";
  els.extensionStatusBadge.className = allOnline ? "live" : ready ? "warn" : "dry";
  els.extensionBridgeStatusText.textContent = ready ? "Online" : "Pairing belum sync";
  els.extensionAccountText.textContent = accountReady ? extension.lastAccount || "Connected" : "Connect dahulu";
  els.extensionNativeCountText.textContent = `${nativeCount}/${target}`;
  els.extensionBridgeUrl.textContent = extension.bridgeUrl || AI_SERVER_URL;
  els.extensionTokenPreview.textContent = state.extensionBridge.token
    ? `${state.extensionBridge.token.slice(0, 6)}...${state.extensionBridge.token.slice(-4)}`
    : extension.tokenPreview || "Klik dapatkan token";
  if (els.extensionTokenFull) {
    els.extensionTokenFull.value = state.extensionBridge.token || "";
    els.extensionTokenFull.hidden = !state.extensionBridge.token;
  }
  els.extensionHelpText.textContent = extension.lastSyncAt
    ? allOnline
      ? `Sync terakhir ${extension.lastSyncAt}. ThreadsMe API, extension, dan akaun Threads sudah online.`
      : `Sync terakhir ${extension.lastSyncAt}. Jika akaun belum dikesan atau count kurang, buka Threads dan tekan Sync dalam extension.`
    : "Load folder threadsme-extension di Chrome, connect akaun Threads, kemudian paste token pairing dan tekan Sync.";
}

async function updateGeneratedStatus(versionId, status) {
  const response = await apiFetch("/api/story-runs/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId, status }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Status update failed");
  state.storyRuns = Array.isArray(data.runs) ? data.runs : [];
  if (data.status) applyStatusData(data.status);
  await loadScheduleData();
  await loadProductAudit();
  await loadAutomationHealth();
  renderGeneratedStatus();
  render();
}

function renderGeneratedStatus() {
  if (!els.generatedStatusList) return;
  const versions = state.storyRuns.flatMap((run) =>
    (run.versions || []).map((version) => ({
      ...version,
      runId: run.id,
      productName: run.productName || "Story dijana",
      imageUrl: run.imageUrl || "",
      affiliateLink: run.affiliateLink || "",
      postsPerDay: run.postsPerDay || "-",
      createdAt: run.createdAt || "",
      scheduleNumber: version.scheduleNumber || null,
      slot: version.slot || "",
    })),
  );

  els.generatedStatusNote.textContent = versions.length
    ? `${versions.length} output dipantau`
    : "Belum ada output baharu";

  if (!versions.length) {
    els.generatedStatusList.replaceChildren(
      makeEmptyState("Belum ada story dijana", "Upload atau paste gambar produk, kemudian biarkan ThreadsMe cipta dan jadualkan siri Threads."),
    );
    return;
  }

  const rows = versions
    .slice()
    .reverse()
    .map((version) => {
      const row = document.createElement("div");
      const status = version.status || "pending";
      const scheduleText = version.slot
        ? ` - Siri ${version.scheduleNumber || "-"} - ${formatSlot(version.slot)}`
        : " - Belum dijadualkan";
      row.className = "generated-row";
      const title = makeTextElement("strong", "", version.label || "Versi");
      const product = makeTextElement("span", "", version.productName);
      product.append(
        makeTextElement("span", "generated-meta", `${version.createdAt} - ${version.postsPerDay} posting/hari${scheduleText}`),
      );
      const statusBadge = makeStatusBadge(generatedStatusClass(status), generatedStatusLabel(status));
      const linkSlot = document.createElement(version.affiliateLink ? "a" : "span");
      if (version.affiliateLink) {
        linkSlot.href = version.affiliateLink;
        linkSlot.target = "_blank";
        linkSlot.rel = "noreferrer";
      } else {
        linkSlot.className = "disabled-link";
      }
      linkSlot.textContent = version.affiliateLink ? "Pautan affiliate" : "Tiada pautan affiliate";
      const actions = makeTextElement("span", "generated-actions", "");
      const openButton = document.createElement("button");
      openButton.type = "button";
      if (version.scheduleNumber) {
        openButton.dataset.openSchedule = String(version.scheduleNumber);
        openButton.textContent = "Buka siri";
      } else {
        openButton.disabled = true;
        openButton.textContent = "Tiada jadual";
      }
      actions.append(openButton);
      ["passed", "pending", "review", "failed"].forEach((nextStatus) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.status = nextStatus;
        button.disabled = !version.scheduleNumber;
        button.textContent = generatedStatusLabel(nextStatus);
        actions.append(button);
      });
      row.append(title, product, statusBadge, linkSlot, actions);
      row.querySelectorAll("button[data-status]").forEach((button) => {
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await updateGeneratedStatus(version.id, button.dataset.status);
          } finally {
            button.disabled = false;
          }
        });
      });
      row.querySelector("button[data-open-schedule]")?.addEventListener("click", () => {
        const number = Number(version.scheduleNumber);
        if (Number.isInteger(number) && number > 0) {
          state.selectedIndex = number - 1;
          state.selectedCalendarDate = getSlotDayKey(state.posts[state.selectedIndex]?.slot);
          els.statusFilter.value = "all";
          els.searchInput.value = "";
          showView("schedule");
          render();
        }
      });
      return row;
    });
  els.generatedStatusList.replaceChildren(...rows);
}

function showPreviewImage(src, label) {
  els.imagePreview.replaceChildren();
  if (!src) {
    const image = document.createElement("img");
    image.alt = DEFAULT_PRODUCT_IMAGE_LABEL;
    image.src = DEFAULT_PRODUCT_IMAGE;
    const caption = document.createElement("span");
    caption.className = "preview-caption";
    caption.textContent = "Gambar produk semasa";
    els.imagePreview.append(image, caption);
    return;
  }

  const image = document.createElement("img");
  image.alt = label || "Gambar produk";
  image.src = src;
  els.imagePreview.append(image);
}

function resetImageState() {
  state.storyImageName = "";
  state.storyImageSource = "";
  state.storyImageUrl = "";
  if (els.storyFileName) els.storyFileName.textContent = "Belum dipilih";
  showPreviewImage("", "");
}

async function runProductIntel(options = {}) {
  if (!els.productIntelButton) return;
  els.productIntelButton.disabled = true;
  els.productIntelButton.textContent = "Menyemak...";
  if (els.productIntelNote) {
    els.productIntelNote.textContent = options.fromGenerate
      ? "Tajuk kosong. ThreadsMe cuba auto kenal pasti produk daripada Shopee dahulu."
      : "ThreadsMe sedang cuba kenal pasti produk daripada link dan nota.";
  }
  try {
    const response = await apiFetch("/api/product-intel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        affiliateLink: els.productAffiliateLink.value.trim(),
        imageUrl: els.productImageUrl.value.trim(),
        sourceText: els.storyInput.value.trim(),
        imageNotes: els.imageNotes.value.trim(),
        productTitle: els.productTitle.value.trim(),
        productCategory: els.productCategory.value.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Semakan produk gagal");
    state.productIntel = data.productTitle
      ? {
          productTitle: data.productTitle,
          productCategory: data.productCategory || "",
          linkVerified: Boolean(data.linkVerified),
          autoResolvable: Boolean(data.autoResolvable),
          evidenceLevel: data.evidenceLevel || "",
          confidence: Number(data.confidence || 0),
          source: data.source || "",
        }
      : null;
    if (data.productTitle && !els.productTitle.value.trim()) {
      els.productTitle.value = data.productTitle;
    }
    if (data.productCategory && !els.productCategory.value.trim()) {
      els.productCategory.value = data.productCategory;
    }
    const confidence = Number.isFinite(Number(data.confidence)) ? `${data.confidence}%` : "rendah";
    const warningText = data.warnings?.length ? ` Nota: ${data.warnings[0]}` : "";
    if (els.productIntelNote) {
      els.productIntelNote.textContent = data.productTitle
        ? `${data.linkVerified ? "Produk link-verified" : "Produk disahkan AI"} ditemui (${confidence}). ${data.note || "Autopilot akan teruskan. Edit hanya jika mahu."}${warningText}`
        : `${data.note || "ThreadsMe belum dapat kenal produk dengan yakin. Autopilot akan guard siri ini."}${warningText}`;
    }
    return data;
  } catch (error) {
    if (els.productIntelNote) {
      els.productIntelNote.textContent = `Semakan produk gagal: ${error.message}. Autopilot akan guard output yang belum cukup yakin.`;
    }
    return null;
  } finally {
    els.productIntelButton.disabled = false;
    els.productIntelButton.textContent = "Auto semak produk Shopee";
  }
}

function getCurrentProductVerification(productTitle) {
  const currentTitle = String(productTitle || "").trim();
  if (!currentTitle) {
    return {
      productVerified: false,
      productIntelEvidence: "missing_title",
      productIntelConfidence: 0,
      productIntelSource: "",
    };
  }
  const intel = state.productIntel;
  if (intel?.productTitle && intel.productTitle === currentTitle) {
    const autopilotVerified = Boolean(intel.linkVerified || intel.autoResolvable || Number(intel.confidence || 0) >= 62);
    return {
      productVerified: autopilotVerified,
      productIntelEvidence: intel.evidenceLevel || (autopilotVerified ? "ai_verified" : "story_inferred"),
      productIntelConfidence: Number(intel.confidence || 0),
      productIntelSource: intel.source || "Product Intel",
    };
  }
  return {
    productVerified: true,
    productIntelEvidence: "manual_input",
    productIntelConfidence: 100,
    productIntelSource: "Jana Story manual",
  };
}

function bindStoryGenerator() {
  if (!els.generateStoryButton) return;

  els.productIntelButton?.addEventListener("click", () => {
    runProductIntel();
  });

  els.productTitle?.addEventListener("input", () => {
    state.productIntel = null;
  });

  els.productAffiliateLink?.addEventListener("input", () => {
    state.productIntel = null;
  });

  els.storyImage.addEventListener("change", () => {
    const file = els.storyImage.files?.[0];
    state.storyImageName = file ? file.name : "";
    if (els.storyFileName) els.storyFileName.textContent = file ? file.name : "Belum dipilih";
    if (!file) {
      resetImageState();
      return;
    }
    state.storyImageSource = "upload";
    state.storyImageUrl = "";
    showPreviewImage(URL.createObjectURL(file), file.name);
  });

  els.productImageUrl.addEventListener("input", () => {
    state.productIntel = null;
    const imageUrl = els.productImageUrl.value.trim();
    state.storyImageUrl = imageUrl;
    if (imageUrl) {
      state.storyImageSource = "url";
      state.storyImageName = imageUrl.split("/").pop() || "image-url";
      showPreviewImage(imageUrl, "Link gambar produk");
    } else if (!els.storyImage.files?.[0]) {
      resetImageState();
    }
  });

  els.postsPerDay.addEventListener("change", () => {
    if (els.versionCount) els.versionCount.value = els.postsPerDay.value;
  });

  els.imagePreview.addEventListener("paste", (event) => {
    const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith("image/"));
    if (!item) return;
    event.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    state.storyImageName = file.name || "pasted-product-image.png";
    state.storyImageSource = "paste";
    state.storyImageUrl = "";
    if (els.storyFileName) els.storyFileName.textContent = "Imej clipboard";
    els.productImageUrl.value = "";
    showPreviewImage(URL.createObjectURL(file), state.storyImageName);
  });

  els.generateStoryButton.addEventListener("click", async () => {
    let productTitle = els.productTitle.value.trim();
    let productCategory = els.productCategory.value.trim();
    const sourceText = els.storyInput.value.trim();
    const imageNotes = els.imageNotes.value.trim();

    if (!productTitle) {
      setAiStatus("Auto semak produk Shopee", "ready");
      const intel = await runProductIntel({ fromGenerate: true });
      productTitle = els.productTitle.value.trim();
      productCategory = els.productCategory.value.trim();
      if (!productTitle || !intel?.autoResolvable) {
        els.storyOutput.value =
          "Autopilot guard: ThreadsMe belum cukup yakin tentang produk daripada link/gambar. Siri tidak dijadualkan supaya story tidak lari daripada produk sebenar. Gunakan Edit hanya kalau Akmal mahu override.";
        setAiStatus("Autopilot guard aktif", "warn");
        showToast("Story ditahan", "Produk belum cukup yakin. ThreadsMe tidak jadualkan untuk elak story lari.", "warn");
        return;
      }
    }

    els.generateStoryButton.disabled = true;
    els.generateStoryButton.setAttribute("aria-busy", "true");
    els.generateStoryButton.textContent = "AI sedang cipta & jadual...";
    els.storyOutput.value = "";
    setAiStatus(sourceText || imageNotes ? "DeepSeek sedang jana dan jadualkan" : "DeepSeek sedang cari angle dan jadualkan", "ready");

    try {
      const verification = getCurrentProductVerification(productTitle);
      const response = await apiFetch("/api/generate-story", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceText,
          productTitle,
          productCategory,
          ...verification,
          imageNotes,
          imageName: state.storyImageName,
          imageSource: state.storyImageSource,
          imageUrl: els.productImageUrl.value.trim(),
          theme: els.storyTheme.value,
          versions: els.postsPerDay.value,
          postsPerDay: els.postsPerDay.value,
          affiliateLink: els.productAffiliateLink.value.trim() || state.affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3",
        }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Jana gagal");
      els.storyOutput.value = storyText(data.versions || []);
      if (data.run) {
        const firstScheduled = data.run.schedule?.items?.[0]?.number;
        await refreshSystemData();
        if (firstScheduled) {
          state.selectedIndex = firstScheduled - 1;
          state.selectedCalendarDate = getSlotDayKey(state.posts[state.selectedIndex]?.slot);
          els.statusFilter.value = "all";
          els.searchInput.value = "";
          render();
          showView("schedule");
          window.setTimeout(focusSelectedQueueItem, 250);
        }
      }
      const scheduleCount = data.run?.schedule?.items?.length || 0;
      if (data.fallback) {
        setAiStatus(scheduleCount ? `${scheduleCount} story fallback masuk jadual` : "Fallback tempatan sedia", "warn");
        showToast("Story fallback siap", scheduleCount ? `${scheduleCount} siri masuk Jadual Threads.` : "Fallback tempatan sedia untuk semakan.", "warn");
      } else {
        setAiStatus(scheduleCount ? `${scheduleCount} story masuk Jadual Threads` : "DeepSeek sedia", "ready");
        showToast("Story berjaya dijana", scheduleCount ? `${scheduleCount} siri masuk Jadual Threads.` : "Output DeepSeek sudah sedia.", "success");
      }
    } catch (error) {
      const offline = /failed to fetch|networkerror|load failed/i.test(error.message);
      els.storyOutput.value = offline
        ? "Gagal generate: Server AI ThreadsMe belum hidup. Sila tunggu sebentar dan cuba semula, atau jalankan npm run ai dalam folder ThreadsMe."
        : `Gagal generate: ${error.message}`;
      setAiStatus(offline ? "Server AI offline" : "Jana gagal", "warn");
      showErrorToast(error, offline ? "Server AI offline" : "Jana story gagal");
    } finally {
      els.generateStoryButton.disabled = false;
      els.generateStoryButton.removeAttribute("aria-busy");
      els.generateStoryButton.textContent = "Auto cipta & jadualkan";
    }
  });

  els.copyStoryButton.addEventListener("click", async () => {
    await copyText(els.storyOutput.value);
    els.copyStoryButton.textContent = "Disalin";
    showToast("Output disalin", "Story Threads sudah masuk clipboard.", "success");
    window.setTimeout(() => {
      els.copyStoryButton.textContent = "Salin output";
    }, 1200);
  });

  els.clearStoryButton.addEventListener("click", () => {
    els.storyInput.value = "";
    els.productTitle.value = "";
    els.productCategory.value = "";
    els.imageNotes.value = "";
    els.storyOutput.value = "";
    els.storyImage.value = "";
    els.productImageUrl.value = "";
    els.productAffiliateLink.value = state.affiliateLink || "https://s.shopee.com.my/7VDqSOoKf3";
    if (els.versionCount) els.versionCount.value = els.postsPerDay.value;
    resetImageState();
    showToast("Borang dikosongkan", "Input Jana Story sudah reset.", "success");
  });
}

async function savePublisherConfig() {
  if (!els.savePublisherButton) return;
  const threadsUserId = els.threadsUserId.value.trim();
  const accessToken = els.threadsAccessToken.value.trim();
  const tokenCheck = describePublisherTokenInput(accessToken);
  if ((accessToken || els.threadsEnabled.checked) && !threadsUserId) {
    showToast("Tetapan belum lengkap", "Threads User ID wajib diisi dahulu.", "warn");
    throw new Error("Threads User ID wajib diisi sebelum simpan token atau aktifkan publisher worker.");
  }
  const liveRequested = els.threadsEnabled.checked && !els.threadsDryRun.checked;
  if (liveRequested) {
    const ok = window.confirm(
      "Anda sedang aktifkan Threads live publisher. Bila token sah dan slot due, ThreadsMe boleh hantar post public ke Threads. Teruskan?",
    );
    if (!ok) return;
  }

  els.savePublisherButton.disabled = true;
  els.savePublisherButton.textContent = "Menyimpan...";
  if (els.publisherHelpText) els.publisherHelpText.textContent = "Menyimpan tetapan API...";
  try {
    const response = await apiFetch("/api/threads-publisher/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadsUserId,
        accessToken,
        enabled: els.threadsEnabled.checked,
        dryRun: els.threadsDryRun.checked,
        replyMode: els.replyMode.value,
        publishDelaySeconds: els.publishDelaySeconds.value,
        maxDuePerSync: els.maxDuePerSync.value,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Gagal simpan publisher");
    applyPublisherData(data);
    if (data.config) state.publisher.config = data.config;
    const savedConfig = state.publisher.config || {};
    state.publisher.saveNotice = tokenCheck.warning
      ? `Tetapan disimpan, tetapi ${tokenCheck.warning}`
      : savedConfig.hasToken
        ? "Tetapan API disimpan. Token disimpan secara private dan input dikosongkan untuk keselamatan."
        : "Tetapan API disimpan. Tiada token baru disimpan.";
    els.threadsAccessToken.value = "";
    await refreshSystemData();
    state.publisher.saveNotice = state.publisher.statusError || state.publisher.saveNotice
      ? state.publisher.saveNotice
      : "Tetapan API disimpan.";
    renderPublisher();
    showToast(
      tokenCheck.warning ? "Tetapan disimpan, token pendek" : "Tetapan API disimpan",
      tokenCheck.warning || "Konfigurasi publisher dikemas kini.",
      tokenCheck.warning ? "warn" : "success",
    );
  } catch (error) {
    if (els.publisherHelpText) {
      els.publisherHelpText.textContent = /sesi admin|unauthorized|csrf|forbidden/i.test(error.message)
        ? "Sesi admin tamat atau token keselamatan borang tidak sah. Login semula, kemudian simpan sekali lagi."
        : error.message;
    }
    showErrorToast(error, "Simpan API gagal");
    throw error;
  } finally {
    els.savePublisherButton.disabled = false;
    els.savePublisherButton.textContent = "Simpan tetapan";
  }
}

async function runPublisherDue() {
  if (!els.runPublisherButton) return;
  els.runPublisherButton.disabled = true;
  els.runPublisherButton.textContent = "Menjalankan...";
  try {
    const response = await apiFetch("/api/threads-publisher/run-due", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Run due gagal");
    applyPublisherData(data);
    await refreshSystemData();
    showToast("Run due selesai", data.publisher?.skippedReason || "Publisher due sudah disemak.", "success");
  } finally {
    els.runPublisherButton.disabled = false;
    els.runPublisherButton.textContent = "Run due sekarang";
  }
}

async function publishSelectedSeries() {
  if (!els.publishSelectedButton) return;
  const number = state.selectedIndex + 1;
  const config = state.publisher.config || {};
  if (!config.dryRun) {
    const ok = window.confirm(`Publish Siri ${number} live ke Threads sekarang? Tindakan ini boleh jadi public.`);
    if (!ok) return;
  }

  els.publishSelectedButton.disabled = true;
  els.publishSelectedButton.textContent = config.dryRun ? "Semak selamat..." : "Menerbitkan...";
  try {
    const response = await apiFetch("/api/threads-publisher/publish-one", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number, force: true }),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || data.result?.error || "Publish gagal");
    applyPublisherData(data);
    if (data.result?.status) applyStatusData(data.result.status);
    await refreshSystemData();
    showToast("Publish siri selesai", `Siri ${number} sudah diproses oleh publisher.`, "success");
  } finally {
    els.publishSelectedButton.disabled = false;
    els.publishSelectedButton.textContent = "Publish siri dipilih";
  }
}

async function loadExtensionPairing() {
  if (!els.loadExtensionPairingButton) return;
  els.loadExtensionPairingButton.disabled = true;
  els.loadExtensionPairingButton.textContent = "Mengambil token...";
  try {
    const response = await apiFetch("/api/extension/pairing", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) throw new Error("Sesi admin diperlukan. Login semula di ThreadsMe, kemudian tekan Dapatkan pairing.");
    if (!response.ok || !data.ok) throw new Error(data.error || "Pairing extension gagal");
    state.extensionBridge.config = data.bridge || state.extensionBridge.config;
    state.extensionBridge.token = data.bridge?.token || "";
    renderExtensionBridge();
    if (els.extensionHelpText) {
      els.extensionHelpText.textContent = "Token pairing sudah sedia. Klik Salin token, atau pilih kotak token penuh dan tekan Ctrl+C jika browser block clipboard.";
    }
    if (els.extensionTokenFull && state.extensionBridge.token) {
      els.extensionTokenFull.hidden = false;
      els.extensionTokenFull.focus();
      els.extensionTokenFull.select();
    }
    showToast("Token pairing sedia", "Token penuh sudah dipaparkan dan dipilih untuk disalin.", "success");
    return state.extensionBridge.token;
  } finally {
    els.loadExtensionPairingButton.disabled = false;
    els.loadExtensionPairingButton.textContent = "Dapatkan pairing";
  }
}

async function copyExtensionToken() {
  if (els.copyExtensionTokenButton) {
    els.copyExtensionTokenButton.disabled = true;
    els.copyExtensionTokenButton.textContent = "Menyalin...";
  }
  if (!state.extensionBridge.token) {
    await loadExtensionPairing();
  }
  if (!state.extensionBridge.token) throw new Error("Token pairing belum tersedia. Tekan Dapatkan pairing dahulu.");
  try {
    await copyText(state.extensionBridge.token);
    if (els.extensionHelpText) {
      els.extensionHelpText.textContent = "Token pairing sudah disalin. Paste ke ruang Token Pairing dalam popup extension.";
    }
    showToast("Token pairing disalin", "Paste token ini dalam popup ThreadsMe Extension.", "success");
  } catch {
    if (els.extensionTokenFull) {
      els.extensionTokenFull.hidden = false;
      els.extensionTokenFull.focus();
      els.extensionTokenFull.select();
    }
    if (els.extensionHelpText) {
      els.extensionHelpText.textContent = "Browser block auto-copy. Kotak token penuh sudah dipilih; tekan Ctrl+C, kemudian paste dalam popup extension.";
    }
    showToast("Copy manual diperlukan", "Kotak token penuh sudah dipilih. Tekan Ctrl+C.", "warn");
  } finally {
    if (els.copyExtensionTokenButton) {
      els.copyExtensionTokenButton.disabled = false;
      els.copyExtensionTokenButton.textContent = "Token sedia";
      window.setTimeout(() => {
        els.copyExtensionTokenButton.textContent = "Salin token";
      }, 1600);
    }
  }
}

async function downloadExtensionPackage() {
  if (!els.downloadExtensionButton) return;
  els.downloadExtensionButton.disabled = true;
  els.downloadExtensionButton.textContent = "Memuat turun...";
  try {
    const response = await apiFetch("/api/extension/download/prepare", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok || !data.download?.url) {
      throw new Error(data.error || "Link muat turun extension gagal disediakan.");
    }
    const downloadUrl = new URL(data.download.url, AI_SERVER_URL).href;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = data.download.fileName || "threadsme-extension.zip";
    document.body.append(link);
    link.click();
    window.setTimeout(() => link.remove(), 1200);
    if (els.extensionHelpText) {
      els.extensionHelpText.textContent = "Extension zip sudah dimuat turun. Extract zip, buka chrome://extensions, aktifkan Developer mode, kemudian Load unpacked folder hasil extract.";
    }
    showToast("Extension dimuat turun", "Zip terkini ThreadsMe Extension sudah dihantar ke browser.", "success");
  } finally {
    els.downloadExtensionButton.disabled = false;
    els.downloadExtensionButton.textContent = "Muat turun extension";
  }
}

function bindPublisherControls() {
  if (!els.savePublisherButton) return;
  els.savePublisherButton.addEventListener("click", () => {
    savePublisherConfig().catch((error) => {
      if (!els.publisherHelpText.textContent || /menyimpan/i.test(els.publisherHelpText.textContent)) {
        els.publisherHelpText.textContent = error.message;
      }
    });
  });
  els.runPublisherButton.addEventListener("click", () => {
    runPublisherDue().catch((error) => {
      els.publisherHelpText.textContent = error.message;
      showErrorToast(error, "Run due gagal");
    });
  });
  els.publishSelectedButton.addEventListener("click", () => {
    publishSelectedSeries().catch((error) => {
      els.publisherHelpText.textContent = error.message;
      showErrorToast(error, "Publish siri gagal");
    });
  });
  els.downloadExtensionButton?.addEventListener("click", () => {
    downloadExtensionPackage().catch((error) => {
      if (els.extensionHelpText) els.extensionHelpText.textContent = error.message;
      showErrorToast(error, "Muat turun extension gagal");
    });
  });
  els.loadExtensionPairingButton?.addEventListener("click", () => {
    loadExtensionPairing().catch((error) => {
      if (els.extensionHelpText) els.extensionHelpText.textContent = error.message;
      showErrorToast(error, "Dapatkan pairing gagal");
    });
  });
  els.copyExtensionTokenButton?.addEventListener("click", () => {
    copyExtensionToken().catch((error) => {
      if (els.extensionHelpText) els.extensionHelpText.textContent = error.message;
      showErrorToast(error, "Salin token gagal");
    });
  });
  els.saveShopeeCookieButton?.addEventListener("click", async () => {
    els.saveShopeeCookieButton.disabled = true;
    els.saveShopeeCookieButton.textContent = "Menyimpan...";
    try {
      await saveShopeeCookie(els.shopeeCookieInput.value);
      els.shopeeCookieInput.value = "";
      renderPublisher();
      showToast("Cookie Shopee disimpan", "Product Intel boleh cuba baca detail produk dengan sesi private.", "success");
    } catch (error) {
      if (els.shopeeCookieStatus) els.shopeeCookieStatus.textContent = error.message;
      showErrorToast(error, "Simpan cookie gagal");
    } finally {
      els.saveShopeeCookieButton.disabled = false;
      els.saveShopeeCookieButton.textContent = "Simpan cookie";
    }
  });
  els.clearShopeeCookieButton?.addEventListener("click", async () => {
    els.clearShopeeCookieButton.disabled = true;
    els.clearShopeeCookieButton.textContent = "Mengosongkan...";
    try {
      await saveShopeeCookie("");
      els.shopeeCookieInput.value = "";
      renderPublisher();
      showToast("Cookie Shopee dikosongkan", "Product Intel kembali kepada mod tanpa cookie.", "success");
    } catch (error) {
      if (els.shopeeCookieStatus) els.shopeeCookieStatus.textContent = error.message;
      showErrorToast(error, "Clear cookie gagal");
    } finally {
      els.clearShopeeCookieButton.disabled = false;
      els.clearShopeeCookieButton.textContent = "Clear cookie";
    }
  });
}

async function saveProductAuditMetadata() {
  if (!els.auditSaveMetadataButton) return;
  els.auditSaveMetadataButton.disabled = true;
  els.auditActionStatus.textContent = "Menyimpan metadata...";
  try {
    const response = await apiFetch("/api/product-audit/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        numbers: els.auditNumbers.value.trim(),
        productTitle: els.auditProductTitle.value.trim(),
        productCategory: els.auditProductCategory.value.trim(),
        affiliateLink: els.auditAffiliateLink.value.trim(),
        note: els.auditNotes.value.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Audit metadata gagal");
    state.productAudit = { summary: data.summary || null, items: Array.isArray(data.items) ? data.items : [] };
    els.auditActionStatus.textContent = `${data.updatedNumbers?.length || 0} siri dikemas kini`;
    await refreshSystemData();
    showToast("Audit produk dikemas kini", `${data.updatedNumbers?.length || 0} siri disimpan.`, "success");
  } finally {
    els.auditSaveMetadataButton.disabled = false;
  }
}

async function regenerateProductAuditStories() {
  if (!els.auditRegenerateButton) return;
  els.auditRegenerateButton.disabled = true;
  els.auditActionStatus.textContent = "Menjana semula story...";
  try {
    const response = await apiFetch("/api/product-audit/regenerate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        numbers: els.auditNumbers.value.trim(),
        productTitle: els.auditProductTitle.value.trim(),
        productCategory: els.auditProductCategory.value.trim(),
        affiliateLink: els.auditAffiliateLink.value.trim(),
        note: els.auditNotes.value.trim(),
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Regenerate audit gagal");
    state.productAudit = { summary: data.summary || null, items: Array.isArray(data.items) ? data.items : [] };
    els.auditActionStatus.textContent = `${data.updatedNumbers?.length || 0} siri regenerated`;
    await refreshSystemData();
    showToast("Story audit dijana semula", `${data.updatedNumbers?.length || 0} siri regenerated.`, "success");
  } finally {
    els.auditRegenerateButton.disabled = false;
  }
}

async function runAutoAuditNow(sourceButton) {
  const buttons = [els.runAutoAuditDashboardButton, els.runAutoAuditPageButton].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  });
  if (sourceButton) sourceButton.textContent = "Auto audit berjalan...";
  try {
    const response = await apiFetch("/api/auto-audit/run", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Auto audit gagal");
    state.autoAudit = {
      summary: data.summary || null,
      actions: Array.isArray(data.actions) ? data.actions : [],
    };
    if (data.productAudit) {
      state.productAudit = {
        summary: data.productAudit.summary || null,
        items: Array.isArray(data.productAudit.items) ? data.productAudit.items : [],
      };
    }
    applyStatusData(data.status || {});
    await loadAutomationHealth();
    render();
    showToast("Auto audit selesai", `${data.summary?.autoFilled || data.summary?.autoFilledCount || 0} auto isi, ${data.summary?.regenerate || data.summary?.regenerateCount || 0} perlu regenerate.`, "success");
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    });
    if (els.runAutoAuditDashboardButton) els.runAutoAuditDashboardButton.textContent = "Semak auto audit sekarang";
    if (els.runAutoAuditPageButton) els.runAutoAuditPageButton.textContent = "Semak auto audit sekarang";
  }
}

function bindAuditControls() {
  if (!els.auditSaveMetadataButton) return;
  els.auditSaveMetadataButton.addEventListener("click", () => {
    saveProductAuditMetadata().catch((error) => {
      els.auditActionStatus.textContent = error.message;
      showErrorToast(error, "Simpan audit gagal");
    });
  });
  els.auditRegenerateButton.addEventListener("click", () => {
    regenerateProductAuditStories().catch((error) => {
      els.auditActionStatus.textContent = error.message;
      showErrorToast(error, "Regenerate gagal");
    });
  });
  els.runAutoAuditDashboardButton?.addEventListener("click", () => {
    runAutoAuditNow(els.runAutoAuditDashboardButton).catch((error) => {
      if (els.actionCenterBadge) els.actionCenterBadge.textContent = error.message;
      showErrorToast(error, "Auto audit gagal");
    });
  });
  els.runAutoAuditPageButton?.addEventListener("click", () => {
    runAutoAuditNow(els.runAutoAuditPageButton).catch((error) => {
      if (els.actionPageBadge) els.actionPageBadge.textContent = error.message;
      showErrorToast(error, "Auto audit gagal");
    });
  });
  els.openActionsButton?.addEventListener("click", () => {
    showView("actions");
    showToast("Pusat tindakan dibuka", "Semakan autopilot dipaparkan.", "info");
  });
  els.openAuditFromActionsButton?.addEventListener("click", () => {
    showView("audit");
    showToast("Audit produk dibuka", "Senarai Quality Gate dipaparkan.", "info");
  });
  els.downloadBackupButton?.addEventListener("click", () => {
    downloadRuntimeBackup();
  });
}

async function copyText(text) {
  const value = String(text || "");
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.inset = "0 auto auto 0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Browser block clipboard. Pilih token penuh dan tekan Ctrl+C.");
    return true;
  }
}

function bindActions() {
  bindButtonClickToasts();
  bindNavigation();
  els.searchInput.addEventListener("input", renderQueue);
  els.statusFilter.addEventListener("change", renderQueue);
  bindStoryGenerator();
  bindPublisherControls();
  bindAuditControls();

  els.copyPromptButton.addEventListener("click", async () => {
    await copyText("Ya, jadualkan");
    els.copyPromptButton.textContent = "Disalin";
    showToast("Teks confirmation disalin", "Ayat “Ya, jadualkan” sudah masuk clipboard.", "success");
    window.setTimeout(() => {
      els.copyPromptButton.textContent = "Salin teks confirmation";
    }, 1200);
  });

  els.copyThreadButton.addEventListener("click", async () => {
    await copyText(threadText(state.posts[state.selectedIndex]));
    els.copyThreadButton.textContent = "Disalin";
    showToast("Siri disalin", `Siri ${state.selectedIndex + 1} sudah masuk clipboard.`, "success");
    window.setTimeout(() => {
      els.copyThreadButton.textContent = "Salin siri ini";
    }, 1200);
  });

  els.copyReply2Button.addEventListener("click", async () => {
    await copyText(state.posts[state.selectedIndex].reply2);
    els.copyReply2Button.textContent = "Disalin";
    showToast("CTA reply disalin", "Reply CTA affiliate sudah masuk clipboard.", "success");
    window.setTimeout(() => {
      els.copyReply2Button.textContent = "Salin CTA reply";
    }, 1200);
  });
}

function showView(viewName) {
  els.pagePanels.forEach((panel) => {
    const isActive = panel.dataset.view === viewName;
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
    if (isActive) {
      requestAnimationFrame(() => {
        panel.querySelectorAll(".reveal").forEach((element) => element.classList.add("is-visible"));
      });
    }
  });

  els.navItems.forEach((button) => {
    const isActive = button.dataset.viewTarget === viewName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
  window.setTimeout(animateActiveView, 80);
}

function bindNavigation() {
  els.navItems.forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.viewTarget;
      if (nextView && window.location.hash !== `#${nextView}`) {
        history.replaceState(null, "", `#${nextView}`);
      }
      showView(nextView);
      showToast("Menu dibuka", readableButtonLabel(button), "info", { duration: 1600 });
    });
  });

  window.addEventListener("hashchange", () => {
    const viewName = window.location.hash.replace("#", "");
    if (viewName && Array.from(els.pagePanels).some((panel) => panel.dataset.view === viewName)) {
      showView(viewName);
    }
  });
}

function render() {
  renderMetrics();
  renderScheduleCalendar();
  renderQueue();
  renderPreview();
  renderStatusTable();
  renderUnblockAdvice();
  renderAutomationHealth();
  renderActionCenter();
  renderProductAudit();
  renderNetizenPreview();
  renderPublisher();
}

function bindRevealMotion() {
  const elements = Array.from(document.querySelectorAll(".reveal"));
  if (!elements.length) return;

  if (!("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  elements.forEach((element) => observer.observe(element));
}

function animateActiveView() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  if (reduceMotion || !gsap) return;

  const activePanel = document.querySelector(".page-panel.active");
  if (!activePanel) return;

  const revealItems = Array.from(activePanel.querySelectorAll(".reveal"));
  if (revealItems.length) {
    gsap.fromTo(
      revealItems,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.72,
        stagger: 0.055,
        ease: "power3.out",
        overwrite: true,
      },
    );
  }

  const stackItems = Array.from(
    activePanel.querySelectorAll(
      ".metrics-grid article, .automation-rail article, .health-card, .action-card, .calendar-day-card, .audit-panel, .publisher-panel",
    ),
  );
  if (stackItems.length) {
    gsap.fromTo(
      stackItems,
      { autoAlpha: 0, y: 14, scale: 0.985 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.58,
        stagger: 0.035,
        ease: "power2.out",
        overwrite: true,
      },
    );
  }
}

function bindTasteMotion() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  if (reduceMotion || !gsap) return;

  if (window.ScrollTrigger) {
    gsap.registerPlugin(window.ScrollTrigger);
    gsap.utils.toArray(".story-lab, .health-panel, .action-center-panel, .calendar-panel, .preview-panel, .audit-panel, .publisher-panel").forEach((element) => {
      if (element.dataset.tasteScrollBound === "true") return;
      element.dataset.tasteScrollBound = "true";
      gsap.fromTo(
        element,
        { autoAlpha: 0.86, scale: 0.985 },
        {
          autoAlpha: 1,
          scale: 1,
          ease: "none",
          scrollTrigger: {
            trigger: element,
            start: "top 92%",
            end: "bottom 42%",
            scrub: true,
          },
        },
      );
    });
  }

  document
    .querySelectorAll(".nav-item, .metrics-grid article, .health-card, .action-card, .queue-item, .calendar-day-card, .audit-panel, .publisher-panel")
    .forEach((element) => {
      if (element.dataset.tasteBound === "true") return;
      element.dataset.tasteBound = "true";
      element.addEventListener("mouseenter", () => {
        gsap.to(element, { y: -3, scale: 1.005, duration: 0.26, ease: "power2.out", overwrite: true });
      });
      element.addEventListener("mouseleave", () => {
        gsap.to(element, { y: 0, scale: 1, duration: 0.32, ease: "power2.out", overwrite: true });
      });
    });

  animateActiveView();
}

async function startApplicationData() {
  if (state.appStarted) return;
  state.appStarted = true;
  const initialView = window.location.hash.replace("#", "");
  if (initialView && Array.from(els.pagePanels).some((panel) => panel.dataset.view === initialView)) {
    showView(initialView);
  }
  checkAiServer();
  await refreshSystemData();
  bindRevealMotion();
  bindTasteMotion();
  window.setInterval(async () => {
    if (!state.auth.authenticated) return;
    await refreshSystemData();
    bindTasteMotion();
  }, 60_000);
}

async function boot() {
  if (els.creditYear) els.creditYear.textContent = String(new Date().getFullYear());
  bindActions();
  bindAuthGate();
  state.auth.sessionToken = readStoredSessionToken();
  try {
    await refreshAuthStatus();
  } catch (error) {
    state.auth = {
      authRequired: true,
      authenticated: false,
      setupRequired: false,
      csrfToken: "",
      sessionToken: "",
      hasPassword: false,
      localLocked: true,
    };
    renderAuthGate();
    if (els.authStatus) els.authStatus.textContent = `Auth server gagal: ${error.message}`;
    return;
  }
  if (state.auth.authenticated) {
    await startApplicationData();
  }
}

boot().catch((error) => {
  const main = document.createElement("main");
  main.className = "app-shell";
  const panel = document.createElement("section");
  panel.className = "note-panel";
  panel.append(makeTextElement("h1", "", "ThreadsMe failed to load"), makeTextElement("p", "", error.message));
  main.append(panel);
  document.body.replaceChildren(main);
});
