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
  publisher: {
    config: null,
    dueNumbers: [],
    lastEntries: [],
  },
};

const AI_SERVER_URL = "http://127.0.0.1:8788";
const THREADS_SCHEDULE_LIMIT = 25;
const DAILY_POSTING_TARGET = 25;
const DEFAULT_PRODUCT_IMAGE = "./assets/flexi-marble-sheet.png";
const DEFAULT_PRODUCT_IMAGE_LABEL = "Gambar produk Flexi Marble Sheet";

const els = {
  systemStatus: document.querySelector("#systemStatus"),
  systemNote: document.querySelector("#systemNote"),
  totalPosts: document.querySelector("#totalPosts"),
  passedPosts: document.querySelector("#passedPosts"),
  pendingPosts: document.querySelector("#pendingPosts"),
  failedPosts: document.querySelector("#failedPosts"),
  blockedPosts: document.querySelector("#blockedPosts"),
  dashboardPublisherMode: document.querySelector("#dashboardPublisherMode"),
  dashboardPublisherNote: document.querySelector("#dashboardPublisherNote"),
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

async function syncAutomationStatus() {
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/automation/sync`, {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Automation sync failed");
    applyStatusData(data.status || {});
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
    const response = await fetch(`${AI_SERVER_URL}/api/system-data`, { cache: "no-store" });
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
  await loadPublisherStatus();
  render();
}

function getStatus(post, index) {
  const number = index + 1;
  const hasIssue = getLengths(post).some((length) => length > 300);
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
    failed: "Posting ditanda gagal dan perlu semakan manual.",
    passed: "Slot posting sudah lepas atau thread ditanda sudah posted.",
    pending: "Sudah masuk queue automasi dan sedang menunggu masa posting.",
    blocked: "Menunggu slot automasi. Bila scheduled slot kosong, SMTA akan tukar siri ini kepada Pending secara automatik.",
    prepared: "Draf sudah ready. SMTA akan naikkan ke Pending apabila slot automasi kosong.",
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
        counts: { passed: 0, pending: 0, failed: 0, blocked: 0, prepared: 0, issue: 0 },
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
  const failedOrIssue = (day.counts.failed || 0) + (day.counts.issue || 0);
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
    { passed: 0, pending: 0, failed: 0, blocked: 0, prepared: 0, issue: 0 },
  );
}

function getFilteredPosts() {
  const term = els.searchInput.value.trim().toLowerCase();
  const filter = els.statusFilter.value;
  return state.posts
    .map((post, index) => ({ post, index, status: getStatus(post, index) }))
    .filter(({ post, status }) => {
      const haystack = [post.slot, post.main, post.reply1, post.reply2].join(" ").toLowerCase();
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
      button.innerHTML = `
        <strong>Siri ${index + 1} - ${formatSlot(post.slot)}</strong>
        <span><mark class="mini-status ${status}">${statusLabel(status)}</mark> ${post.main.slice(0, 92)}${post.main.length > 92 ? "..." : ""}</span>
      `;
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
  article.innerHTML = `
    <header>
      <strong>${label}</strong>
      <span>${length}/300</span>
    </header>
    <p></p>
  `;
  article.querySelector("p").textContent = text;
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
}

function renderStatusTable() {
  const rows = state.posts.map((post, index) => {
    const status = getStatus(post, index);
    const row = document.createElement("button");
    row.type = "button";
    row.className = `status-row ${status}${index === state.selectedIndex ? " active" : ""}`;
    row.innerHTML = `
      <span class="status-number">#${index + 1}</span>
      <span class="status-time">${formatSlot(post.slot)}</span>
      <span class="mini-status ${status}">${statusLabel(status)}</span>
    `;
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
    button.innerHTML = `
      <span>${formatCalendarDay(day.key, "short")}</span>
      <strong>${day.posts.length}/${DAILY_POSTING_TARGET}</strong>
      <mark>${health.label}</mark>
      <small>Lulus ${day.counts.passed || 0} | Pending ${day.counts.pending || 0} | Blocked ${(day.counts.blocked || 0) + (day.counts.prepared || 0)}</small>
    `;
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
    els.unblockSummary.textContent = `${rangeText} sudah ditukar automatik daripada Blocked kepada Pending kerana slot schedule kosong.${postedText} SMTA ulang semakan setiap 60 saat.`;
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
      ? ` Untuk semua ${plan.blockedNumbers.length} baki, SMTA akan terus promote secara automatik selepas slot sehingga ${formatSlot(plan.allBlockedRelease.slot)} selesai.`
      : "";
    els.unblockNextWindow.textContent = `${plan.readyNow} slot automasi kosong`;
    els.unblockSummary.textContent = `${rangeText} layak naik daripada Blocked kepada Pending. SMTA akan sync automatik melalui server setiap 60 saat.${fullBatchText}`;
    return;
  }

  if (plan.nextRelease) {
    els.unblockNextWindow.textContent = `Slot seterusnya: ${formatSlot(plan.nextRelease.slot)}`;
    els.unblockSummary.textContent = `Siri ${plan.firstBlocked} akan naik ke Pending selepas satu scheduled slot selesai. Untuk semua ${plan.blockedNumbers.length} baki, SMTA akan bergerak ikut slot seterusnya sehingga ${formatSlot(plan.allBlockedRelease.slot)} jika jadual berjalan seperti biasa.`;
    return;
  }

  els.unblockNextWindow.textContent = "Perlu semakan manual";
  els.unblockSummary.textContent = "SMTA tidak jumpa slot scheduled masa depan untuk dikitar secara automatik. Semak status queue atau tambah jadual baharu.";
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
    failed: "Gagal",
  }[status] || "Pending";
}

function generatedStatusClass(status) {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
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
    const response = await fetch(`${AI_SERVER_URL}/api/health`, { cache: "no-store" });
    const data = await response.json();
    if (data.ok && data.hasKey) {
      setAiStatus(`DeepSeek sedia - ${data.model}`, "ready");
    } else {
      setAiStatus("Server AI sedia, API key tiada", "warn");
    }
  } catch {
    setAiStatus("Server AI offline", "warn");
  }
}

async function loadStoryRuns() {
  if (!els.generatedStatusList) return;
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/story-runs`, { cache: "no-store" });
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
    const response = await fetch(`${AI_SERVER_URL}/api/threads-publisher/status`, { cache: "no-store" });
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
    row.innerHTML = `
      <strong>Siri ${entry.number || "-"}</strong>
      <span>
        ${label} - ${entry.mode || "dry-run"}
        <small>${entry.finishedAt || entry.createdAt || ""}</small>
      </span>
      <mark class="mini-status ${entry.status === "failed" ? "failed" : entry.status === "published" ? "passed" : "pending"}">${label}</mark>
    `;
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
  const response = await fetch(`${AI_SERVER_URL}/api/story-runs/status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ versionId, status }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "Status update failed");
  state.storyRuns = Array.isArray(data.runs) ? data.runs : [];
  if (data.status) applyStatusData(data.status);
  await loadScheduleData();
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
      makeEmptyState("Belum ada story dijana", "Upload atau paste gambar produk, kemudian biarkan SMTA cipta dan jadualkan siri Threads."),
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
      const openButton = version.scheduleNumber
        ? `<button type="button" data-open-schedule="${version.scheduleNumber}">Buka siri</button>`
        : `<button type="button" disabled>Tiada jadual</button>`;
      const statusDisabled = version.scheduleNumber ? "" : " disabled";
      row.className = "generated-row";
      row.innerHTML = `
        <strong>${version.label || "Versi"}</strong>
        <span>
          ${version.productName}
          <span class="generated-meta">${version.createdAt} - ${version.postsPerDay} posting/hari${scheduleText}</span>
        </span>
        <span class="mini-status ${generatedStatusClass(status)}">${generatedStatusLabel(status)}</span>
        <span class="generated-actions">
          ${openButton}
          <button type="button" data-status="passed"${statusDisabled}>Lulus</button>
          <button type="button" data-status="pending"${statusDisabled}>Pending</button>
          <button type="button" data-status="failed"${statusDisabled}>Gagal</button>
        </span>
      `;
      const linkSlot = document.createElement(version.affiliateLink ? "a" : "span");
      if (version.affiliateLink) {
        linkSlot.href = version.affiliateLink;
        linkSlot.target = "_blank";
        linkSlot.rel = "noreferrer";
      } else {
        linkSlot.className = "disabled-link";
      }
      linkSlot.textContent = version.affiliateLink ? "Pautan affiliate" : "Tiada pautan affiliate";
      row.insertBefore(linkSlot, row.querySelector(".generated-actions"));
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

function bindStoryGenerator() {
  if (!els.generateStoryButton) return;

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
    const productTitle = els.productTitle.value.trim();
    const productCategory = els.productCategory.value.trim();
    const sourceText = els.storyInput.value.trim();
    const imageNotes = els.imageNotes.value.trim();

    if (!productTitle) {
      els.storyOutput.value =
        "Sila isi Tajuk produk wajib dahulu. Contoh: Sambal Nyet Berapi by Khairulaming 180g. Ini elak AI reka story yang tak kena dengan produk.";
      setAiStatus("Tajuk produk wajib", "warn");
      els.productTitle.focus();
      return;
    }

    els.generateStoryButton.disabled = true;
    els.generateStoryButton.setAttribute("aria-busy", "true");
    els.generateStoryButton.textContent = "AI sedang cipta & jadual...";
    els.storyOutput.value = "";
    setAiStatus(sourceText || imageNotes ? "DeepSeek sedang jana dan jadualkan" : "DeepSeek sedang cari angle dan jadualkan", "ready");

    try {
      const response = await fetch(`${AI_SERVER_URL}/api/generate-story`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceText,
          productTitle,
          productCategory,
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
        ? "Gagal generate: Server AI SMTA belum hidup. Sila tunggu sebentar dan cuba semula, atau jalankan npm run ai dalam folder smta."
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
      "Anda sedang aktifkan Threads live publisher. Bila token sah dan slot due, SMTA boleh hantar post public ke Threads. Teruskan?",
    );
    if (!ok) return;
  }

  els.savePublisherButton.disabled = true;
  els.savePublisherButton.textContent = "Menyimpan...";
  try {
    const response = await fetch(`${AI_SERVER_URL}/api/threads-publisher/config`, {
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
    const response = await fetch(`${AI_SERVER_URL}/api/threads-publisher/run-due`, {
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
    const response = await fetch(`${AI_SERVER_URL}/api/threads-publisher/publish-one`, {
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
      showView(button.dataset.viewTarget);
    });
  });
}

function render() {
  renderMetrics();
  renderScheduleCalendar();
  renderQueue();
  renderPreview();
  renderStatusTable();
  renderUnblockAdvice();
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
    activePanel.querySelectorAll(".metrics-grid article, .automation-rail article, .calendar-day-card, .publisher-panel"),
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
    gsap.utils.toArray(".story-lab, .calendar-panel, .preview-panel, .publisher-panel").forEach((element) => {
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
    .querySelectorAll(".nav-item, .metrics-grid article, .queue-item, .calendar-day-card, .publisher-panel")
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

async function boot() {
  if (els.creditYear) els.creditYear.textContent = String(new Date().getFullYear());
  bindActions();
  checkAiServer();
  await refreshSystemData();
  bindRevealMotion();
  bindTasteMotion();
  window.setInterval(async () => {
    await refreshSystemData();
    bindTasteMotion();
  }, 60_000);
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="app-shell"><section class="note-panel"><h1>SMTA failed to load</h1><p>${error.message}</p></section></main>`;
});
