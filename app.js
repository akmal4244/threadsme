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
  auth: { authRequired: false, authenticated: false, setupRequired: false, csrfToken: "" },
  appStarted: false,
  aiHealth: { ok: false, hasKey: false, model: "" },
  publisher: {
    config: null,
    dueNumbers: [],
    lastEntries: [],
  },
  shopeeCookie: { hasCookie: false, source: "none", file: "" },
};

const AI_SERVER_URL = "http://127.0.0.1:8788";
const THREADS_SCHEDULE_LIMIT = 25;
const DAILY_POSTING_TARGET = 25;
const DEFAULT_PRODUCT_IMAGE = "./assets/flexi-marble-sheet.webp";
const DEFAULT_PRODUCT_IMAGE_LABEL = "Gambar produk Flexi Marble Sheet";

function apiFetch(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (method !== "GET" && method !== "HEAD" && state.auth.csrfToken) {
    headers.set("x-threadsme-csrf", state.auth.csrfToken);
  }
  return fetch(`${AI_SERVER_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
}

const els = {
  authGate: document.querySelector("#authGate"),
  authTitle: document.querySelector("#authTitle"),
  authHelp: document.querySelector("#authHelp"),
  adminPassword: document.querySelector("#adminPassword"),
  authSubmitButton: document.querySelector("#authSubmitButton"),
  authStatus: document.querySelector("#authStatus"),
  logoutButton: document.querySelector("#logoutButton"),
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
  return new Date(year, month - 1, day, hour, minute);
}

function formatSlot(slot) {
  return parseSlot(slot).toLocaleString("ms-MY", {
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

function renderAuthGate() {
  if (!els.authGate) return;
  const auth = state.auth;
  const needsGate = auth.authRequired && !auth.authenticated;
  els.authGate.hidden = !needsGate;
  document.body.classList.toggle("auth-locked", needsGate);
  if (els.logoutButton) els.logoutButton.hidden = !auth.authRequired || !auth.authenticated;
  if (!needsGate) return;
  const setup = Boolean(auth.setupRequired);
  if (els.authTitle) els.authTitle.textContent = setup ? "Setup Admin ThreadsMe" : "Login ThreadsMe";
  if (els.authHelp) {
    els.authHelp.textContent = setup
      ? "Tetapkan kata laluan admin pertama. Ia disimpan dalam folder private dan tidak di-commit."
      : "Masukkan kata laluan admin untuk akses dashboard dan API automation.";
  }
  if (els.authSubmitButton) els.authSubmitButton.textContent = setup ? "Setup & masuk" : "Masuk";
  if (els.adminPassword) {
    els.adminPassword.autocomplete = setup ? "new-password" : "current-password";
  }
}

async function refreshAuthStatus() {
  const response = await apiFetch("/api/auth/status", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Auth status gagal");
  state.auth = {
    authRequired: Boolean(data.authRequired),
    authenticated: Boolean(data.authenticated),
    setupRequired: Boolean(data.setupRequired),
    csrfToken: data.csrfToken || "",
  };
  renderAuthGate();
  return state.auth;
}

async function submitAuth() {
  if (!els.adminPassword || !els.authSubmitButton) return;
  const password = els.adminPassword.value;
  if (!password) {
    if (els.authStatus) els.authStatus.textContent = "Masukkan kata laluan admin.";
    return;
  }
  els.authSubmitButton.disabled = true;
  if (els.authStatus) els.authStatus.textContent = state.auth.setupRequired ? "Menyimpan setup admin..." : "Login...";
  try {
    const endpoint = state.auth.setupRequired ? "/api/auth/setup" : "/api/auth/login";
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Login gagal");
    state.auth = {
      authRequired: Boolean(data.authRequired),
      authenticated: Boolean(data.authenticated),
      setupRequired: Boolean(data.setupRequired),
      csrfToken: data.csrfToken || "",
    };
    els.adminPassword.value = "";
    if (els.authStatus) els.authStatus.textContent = "Akses disahkan.";
    renderAuthGate();
    await startApplicationData();
  } catch (error) {
    if (els.authStatus) els.authStatus.textContent = error.message;
  } finally {
    els.authSubmitButton.disabled = false;
  }
}

async function logoutAdmin() {
  try {
    await apiFetch("/api/auth/logout", { method: "POST", cache: "no-store" });
  } catch {
    // Logout should still clear the UI state even if the server is temporarily unavailable.
  }
  state.auth = { authRequired: true, authenticated: false, setupRequired: false, csrfToken: "" };
  state.appStarted = false;
  renderAuthGate();
}

function bindAuthGate() {
  els.authSubmitButton?.addEventListener("click", submitAuth);
  els.adminPassword?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") submitAuth();
  });
  els.logoutButton?.addEventListener("click", logoutAdmin);
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
    const response = await fetch("./threads_flexi_marble_schedule.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Schedule file failed to load");
    data = await response.json();
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
    const statusResponse = await fetch("./status.json", { cache: "no-store" }).catch(() => null);
    const statusData = statusResponse && statusResponse.ok ? await statusResponse.json() : {};
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
  if (state.scheduled.includes(number)) {
    if (state.publisher.config?.liveReady) return "pending";
    return parseSlot(post.slot).getTime() <= Date.now() ? "passed" : "pending";
  }
  if (state.prepared.includes(number)) return "prepared";
  if (state.remaining.includes(number)) return "blocked";
  return "blocked";
}

function statusLabel(status) {
  return {
    issue: "Ada isu",
    review: "Perlu Semak",
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
    review: "Quality Gate tahan siri ini kerana relevansi produk, CTA atau format perlu disemak.",
    failed: "Posting ditanda gagal dan perlu semakan manual.",
    passed: "Slot posting sudah lepas atau thread ditanda sudah posted.",
    pending: "Sudah masuk queue automasi dan sedang menunggu masa posting.",
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
  element.textContent = text;
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
      snippet.append(
        makeStatusBadge(status),
        document.createTextNode(` ${post.main.slice(0, 92)}${post.main.length > 92 ? "..." : ""}`),
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
  header.append(makeTextElement("strong", "", label), makeTextElement("span", "", `${length}/300`));
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
  els.previewLengths.textContent = lengths.join(" / ");
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
  els.netizenPreviewNote.textContent = reviewCount ? `${reviewCount} perkara perlu semak` : "Nampak natural untuk Threads";
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
        `Lulus ${day.counts.passed || 0} | Pending ${day.counts.pending || 0} | Blocked ${(day.counts.blocked || 0) + (day.counts.prepared || 0)} | Semak ${day.counts.review || 0}`,
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
    ["Semak", selectedDay.counts.review || 0, "review"],
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
  const audit = health.audit || state.productAudit.summary || {};
  const autoAudit = health.autoAudit || state.autoAudit.summary || {};
  const cards = [
    {
      label: "AI Server",
      value: health.ok === false ? "Offline" : state.automationOnline ? "Online" : "Semak",
      detail: health.error || "Endpoint lokal 127.0.0.1:8788",
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
      detail: `${audit.missingProductTitleCount || 0} kosong, ${audit.unverifiedProductCount || 0} belum sah`,
      tone: (audit.reviewCount || audit.missingProductTitleCount || audit.unverifiedProductCount) ? "warn" : "good",
    },
    {
      label: "Auto Audit",
      value: `${autoAudit.autoPassed || 0} auto`,
      detail: `${autoAudit.autoGuarded || 0} diguard, edit pilihan`,
      tone: autoAudit.regenerateReady ? "warn" : "good",
    },
    {
      label: "Publisher",
      value: publisher.liveReady ? "Live ready" : publisher.dryRun === false ? "Belum lengkap" : "Dry-run",
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
    container.replaceChildren(
      makeEmptyState(
        "Tiada tindakan penting",
        "ThreadsMe sedang pantau story, produk, queue dan Quality Gate secara automatik.",
      ),
    );
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

function renderAutoAuditGuide(summary) {
  if (!els.autoAuditGuide) return;
  const items = [
    ["Objektif", summary.objective || "Pastikan copywriting tepat dan bermanfaat untuk netizen Malaysia."],
    ["Mode", summary.mode || "automasi stabil"],
    ["Auto isi produk", `${summary.autoFilled || 0} siri`],
    ["Auto guard", `${summary.verifyNeeded || summary.unverifiedProductCount || 0} siri confidence rendah`],
    ["Tajuk kosong", `${summary.missingProductTitleCount || 0} siri`],
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
    ["Perlu semak", summary.reviewCount || 0],
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
    review: "Perlu Semak",
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
    lastEntries: Array.isArray(data.lastEntries) ? data.lastEntries : [],
  };
}

async function loadPublisherStatus() {
  if (!els.publisherLogList) return;
  try {
    const response = await apiFetch("/api/threads-publisher/status", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Publisher status failed");
    applyPublisherData(data);
  } catch {
    state.publisher = {
      config: { enabled: false, dryRun: true, hasToken: false, liveReady: false },
      dueNumbers: [],
      lastEntries: [],
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
    window.setTimeout(() => {
      els.downloadBackupButton.textContent = "Backup runtime";
    }, 1600);
  } catch (error) {
    els.downloadBackupButton.textContent = error.message;
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
  const mode = config.liveReady ? "Live ready" : config.dryRun ? "Dry-run" : "Belum lengkap";

  els.publisherModeBadge.textContent = mode;
  els.publisherModeBadge.className = config.liveReady ? "live" : config.dryRun ? "dry" : "warn";
  els.publisherReadyText.textContent = config.liveReady
    ? "Sedia publish live"
    : config.dryRun
      ? "Dry-run aktif"
      : "Token/User ID belum lengkap";
  els.publisherDueText.textContent = state.publisher.dueNumbers.length
    ? `${state.publisher.dueNumbers.length} due: ${state.publisher.dueNumbers.join(", ")}`
    : "0 due";
  els.publisherModeText.textContent = mode;
  els.publisherTokenText.textContent = config.hasToken ? "Ada" : "Tiada";
  els.publisherSelectedText.textContent = selectedPost ? `Siri ${selectedNumber} (${statusLabel(selectedStatus)})` : "-";
  els.publisherHelpText.textContent = config.liveReady
    ? "Live aktif. Siri due akan dihantar melalui Threads API dan ditanda Lulus selepas berjaya."
    : "Dry-run aktif. Tiada post public dihantar sehingga User ID dan token Threads lengkap.";

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

  const entries = state.publisher.lastEntries || [];
  els.publisherLogNote.textContent = entries.length ? `${entries.length} log terakhir` : "Tiada log";
  if (!entries.length) {
    els.publisherLogList.replaceChildren(
      makeEmptyState("Log publisher kosong", "Dry-run atau publish live akan direkodkan di sini selepas dijalankan."),
    );
    return;
  }

  const rows = entries.map((entry) => {
    const row = document.createElement("div");
    row.className = `publisher-log-row ${entry.status || "dry_run"}`;
    const label = entry.status === "published" ? "Lulus" : entry.status === "failed" ? "Gagal" : "Dry-run";
    const details = makeTextElement("span", "", `${label} - ${entry.mode || "dry-run"}`);
    details.append(makeTextElement("small", "", entry.finishedAt || entry.createdAt || ""));
    row.append(
      makeTextElement("strong", "", `Siri ${entry.number || "-"}`),
      details,
      makeStatusBadge(entry.status === "failed" ? "failed" : entry.status === "published" ? "passed" : "pending", label),
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
      } else {
        setAiStatus(scheduleCount ? `${scheduleCount} story masuk Jadual Threads` : "DeepSeek sedia", "ready");
      }
    } catch (error) {
      const offline = /failed to fetch|networkerror|load failed/i.test(error.message);
      els.storyOutput.value = offline
        ? "Gagal generate: Server AI ThreadsMe belum hidup. Sila tunggu sebentar dan cuba semula, atau jalankan npm run ai dalam folder ThreadsMe."
        : `Gagal generate: ${error.message}`;
      setAiStatus(offline ? "Server AI offline" : "Jana gagal", "warn");
    } finally {
      els.generateStoryButton.disabled = false;
      els.generateStoryButton.removeAttribute("aria-busy");
      els.generateStoryButton.textContent = "Auto cipta & jadualkan";
    }
  });

  els.copyStoryButton.addEventListener("click", async () => {
    await copyText(els.storyOutput.value);
    els.copyStoryButton.textContent = "Disalin";
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
  });
}

async function savePublisherConfig() {
  if (!els.savePublisherButton) return;
  const liveRequested = els.threadsEnabled.checked && !els.threadsDryRun.checked;
  if (liveRequested) {
    const ok = window.confirm(
      "Anda sedang aktifkan Threads live publisher. Bila token sah dan slot due, ThreadsMe boleh hantar post public ke Threads. Teruskan?",
    );
    if (!ok) return;
  }

  els.savePublisherButton.disabled = true;
  els.savePublisherButton.textContent = "Menyimpan...";
  try {
    const response = await apiFetch("/api/threads-publisher/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadsUserId: els.threadsUserId.value.trim(),
        accessToken: els.threadsAccessToken.value.trim(),
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
    els.threadsAccessToken.value = "";
    await refreshSystemData();
  } finally {
    els.savePublisherButton.disabled = false;
    els.savePublisherButton.textContent = "Simpan tetapan";
  }
}

async function runPublisherDue() {
  if (!els.runPublisherButton) return;
  els.runPublisherButton.disabled = true;
  els.runPublisherButton.textContent = "Running...";
  try {
    const response = await apiFetch("/api/threads-publisher/run-due", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Run due gagal");
    applyPublisherData(data);
    await refreshSystemData();
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
  els.publishSelectedButton.textContent = config.dryRun ? "Dry-run..." : "Publishing...";
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
  } finally {
    els.publishSelectedButton.disabled = false;
    els.publishSelectedButton.textContent = "Publish siri dipilih";
  }
}

function bindPublisherControls() {
  if (!els.savePublisherButton) return;
  els.savePublisherButton.addEventListener("click", () => {
    savePublisherConfig().catch((error) => {
      els.publisherHelpText.textContent = error.message;
    });
  });
  els.runPublisherButton.addEventListener("click", () => {
    runPublisherDue().catch((error) => {
      els.publisherHelpText.textContent = error.message;
    });
  });
  els.publishSelectedButton.addEventListener("click", () => {
    publishSelectedSeries().catch((error) => {
      els.publisherHelpText.textContent = error.message;
    });
  });
  els.saveShopeeCookieButton?.addEventListener("click", async () => {
    els.saveShopeeCookieButton.disabled = true;
    els.saveShopeeCookieButton.textContent = "Menyimpan...";
    try {
      await saveShopeeCookie(els.shopeeCookieInput.value);
      els.shopeeCookieInput.value = "";
      renderPublisher();
    } catch (error) {
      if (els.shopeeCookieStatus) els.shopeeCookieStatus.textContent = error.message;
    } finally {
      els.saveShopeeCookieButton.disabled = false;
      els.saveShopeeCookieButton.textContent = "Simpan cookie";
    }
  });
  els.clearShopeeCookieButton?.addEventListener("click", async () => {
    els.clearShopeeCookieButton.disabled = true;
    els.clearShopeeCookieButton.textContent = "Clearing...";
    try {
      await saveShopeeCookie("");
      els.shopeeCookieInput.value = "";
      renderPublisher();
    } catch (error) {
      if (els.shopeeCookieStatus) els.shopeeCookieStatus.textContent = error.message;
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
  } finally {
    els.auditSaveMetadataButton.disabled = false;
  }
}

async function regenerateProductAuditStories() {
  if (!els.auditRegenerateButton) return;
  els.auditRegenerateButton.disabled = true;
  els.auditActionStatus.textContent = "Regenerate story...";
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
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
    });
    if (els.runAutoAuditDashboardButton) els.runAutoAuditDashboardButton.textContent = "Jalankan auto audit";
    if (els.runAutoAuditPageButton) els.runAutoAuditPageButton.textContent = "Run auto audit sekarang";
  }
}

function bindAuditControls() {
  if (!els.auditSaveMetadataButton) return;
  els.auditSaveMetadataButton.addEventListener("click", () => {
    saveProductAuditMetadata().catch((error) => {
      els.auditActionStatus.textContent = error.message;
    });
  });
  els.auditRegenerateButton.addEventListener("click", () => {
    regenerateProductAuditStories().catch((error) => {
      els.auditActionStatus.textContent = error.message;
    });
  });
  els.runAutoAuditDashboardButton?.addEventListener("click", () => {
    runAutoAuditNow(els.runAutoAuditDashboardButton).catch((error) => {
      if (els.actionCenterBadge) els.actionCenterBadge.textContent = error.message;
    });
  });
  els.runAutoAuditPageButton?.addEventListener("click", () => {
    runAutoAuditNow(els.runAutoAuditPageButton).catch((error) => {
      if (els.actionPageBadge) els.actionPageBadge.textContent = error.message;
    });
  });
  els.openActionsButton?.addEventListener("click", () => showView("actions"));
  els.openAuditFromActionsButton?.addEventListener("click", () => showView("audit"));
  els.downloadBackupButton?.addEventListener("click", () => {
    downloadRuntimeBackup();
  });
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function bindActions() {
  bindNavigation();
  els.searchInput.addEventListener("input", renderQueue);
  els.statusFilter.addEventListener("change", renderQueue);
  bindStoryGenerator();
  bindPublisherControls();
  bindAuditControls();

  els.copyPromptButton.addEventListener("click", async () => {
    await copyText("Ya, jadualkan");
    els.copyPromptButton.textContent = "Disalin";
    window.setTimeout(() => {
      els.copyPromptButton.textContent = "Salin teks confirmation";
    }, 1200);
  });

  els.copyThreadButton.addEventListener("click", async () => {
    await copyText(threadText(state.posts[state.selectedIndex]));
    els.copyThreadButton.textContent = "Disalin";
    window.setTimeout(() => {
      els.copyThreadButton.textContent = "Salin siri ini";
    }, 1200);
  });

  els.copyReply2Button.addEventListener("click", async () => {
    await copyText(state.posts[state.selectedIndex].reply2);
    els.copyReply2Button.textContent = "Disalin";
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
    if (state.auth.authRequired && !state.auth.authenticated) return;
    await refreshSystemData();
    bindTasteMotion();
  }, 60_000);
}

async function boot() {
  if (els.creditYear) els.creditYear.textContent = String(new Date().getFullYear());
  bindActions();
  bindAuthGate();
  try {
    await refreshAuthStatus();
  } catch (error) {
    state.auth = { authRequired: true, authenticated: false, setupRequired: false, csrfToken: "" };
    renderAuthGate();
    if (els.authStatus) els.authStatus.textContent = `Auth server gagal: ${error.message}`;
    return;
  }
  if (!state.auth.authRequired || state.auth.authenticated) {
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
