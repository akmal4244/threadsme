(() => {
  if (window.__THREADSME_CONTENT_READY__) return;
  window.__THREADSME_CONTENT_READY__ = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const textOf = (element) => String(element?.innerText || element?.textContent || element?.getAttribute?.("aria-label") || "").trim();
  const allText = () => document.body.innerText.replace(/\s+/g, " ").trim();

  function accountLabel() {
    const meta = document.querySelector('meta[property="og:title"], meta[name="title"]')?.content || "";
    const profileLink = Array.from(document.querySelectorAll('a[href^="/@"], a[href*="/@"]')).map((item) => item.href).find(Boolean);
    return meta || profileLink || "Threads login Chrome";
  }

  function detectLoginState() {
    const text = allText().toLowerCase();
    const hasLoginPrompt = /\b(log in|sign in|continue with instagram|masuk)\b/i.test(text);
    const hasComposerSignal = /\b(new thread|start a thread|post|following|for you)\b/i.test(text);
    const hasProfileLink = Boolean(Array.from(document.querySelectorAll('a[href^="/@"], a[href*="/@"]')).find(visible));
    return {
      connected: Boolean(hasProfileLink || (hasComposerSignal && !hasLoginPrompt)),
      loginPromptDetected: hasLoginPrompt,
    };
  }

  function clickByText(patterns, { required = true } = {}) {
    const regexes = patterns.map((pattern) => (pattern instanceof RegExp ? pattern : new RegExp(pattern, "i")));
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, div[aria-label], span[aria-label]'))
      .filter(visible)
      .filter((element) => {
        const label = `${textOf(element)} ${element.getAttribute("aria-label") || ""}`.trim();
        return regexes.some((regex) => regex.test(label));
      });
    const button = candidates[0]?.closest?.('button, [role="button"], a') || candidates[0];
    if (!button) {
      if (required) throw new Error(`Butang tidak ditemui: ${patterns.join(", ")}`);
      return false;
    }
    button.click();
    return true;
  }

  function setTextboxValue(textbox, value) {
    textbox.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    textbox.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }

  function getTextboxes() {
    return Array.from(document.querySelectorAll('[contenteditable="true"][role="textbox"], div[contenteditable="true"], textarea'))
      .filter(visible);
  }

  async function ensureComposer() {
    let boxes = getTextboxes();
    if (boxes.length) return boxes[0];
    clickByText([/new thread/i, /start a thread/i, /^post$/i, /create/i, /cipta/i, /karang/i], { required: false });
    await sleep(1400);
    boxes = getTextboxes();
    if (!boxes.length) throw new Error("Composer Threads tidak ditemui. Buka halaman Threads dan pastikan akaun sudah login.");
    return boxes[0];
  }

  async function addReplyBox() {
    clickByText([/add to thread/i, /add another/i, /tambah/i, /balas/i], { required: true });
    await sleep(900);
    const boxes = getTextboxes();
    if (!boxes.length) throw new Error("Textbox reply tidak ditemui selepas Add to thread.");
    return boxes[boxes.length - 1];
  }

  async function fillThread(post, delayMs) {
    const parts = [post.main, post.reply1, post.reply2].map((part) => String(part || "").trim()).filter(Boolean);
    if (parts.length !== 3) throw new Error("Payload ThreadsMe mesti ada POST UTAMA, REPLY 1 dan REPLY 2.");
    const first = await ensureComposer();
    setTextboxValue(first, parts[0]);
    await sleep(delayMs);
    const second = await addReplyBox();
    setTextboxValue(second, parts[1]);
    await sleep(delayMs);
    const third = await addReplyBox();
    setTextboxValue(third, parts[2]);
    await sleep(Math.max(2200, delayMs));
  }

  function validatePreview(post) {
    const text = allText().toLowerCase();
    const must = Array.isArray(post.previewMustIncludeAny) ? post.previewMustIncludeAny : [];
    const block = Array.isArray(post.previewMustNotInclude) ? post.previewMustNotInclude : [];
    const hasRequired = !must.length || must.some((term) => text.includes(String(term).toLowerCase()));
    const hasBlocked = block.some((term) => text.includes(String(term).toLowerCase()));
    if (!hasRequired) {
      throw new Error(`Preview link belum nampak sepadan dengan produk ${post.expectedProductKind || ""}. Extension tahan untuk elak salah produk.`);
    }
    if (hasBlocked) {
      throw new Error("Preview/link nampak bercanggah dengan story. Extension tahan sebelum schedule.");
    }
  }

  async function openScheduler(slot, delayMs) {
    const clickedSchedule = clickByText([/schedule/i, /jadual/i], { required: false });
    if (!clickedSchedule) {
      clickByText([/more/i, /options/i, /lagi/i, /^•••$/, /^…$/], { required: true });
      await sleep(700);
      clickByText([/schedule/i, /jadual/i], { required: true });
    }
    await sleep(delayMs);

    const [datePart, timePart] = String(slot || "").split(" ");
    const [year, month, day] = String(datePart || "").split("-");
    const [hour, minute] = String(timePart || "").split(":");
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"], input[placeholder*="Date"], input[aria-label*="Date"], input[aria-label*="Tarikh"]')).filter(visible);
    const timeInputs = Array.from(document.querySelectorAll('input[type="time"], input[placeholder*="Time"], input[aria-label*="Time"], input[aria-label*="Masa"]')).filter(visible);
    if (dateInputs[0] && year && month && day) {
      dateInputs[0].value = `${year}-${month}-${day}`;
      dateInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      dateInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (timeInputs[0] && hour && minute) {
      timeInputs[0].value = `${hour}:${minute}`;
      timeInputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      timeInputs[0].dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(delayMs);
    clickByText([/^done$/i, /^set$/i, /selesai/i, /tetapkan/i, /save/i], { required: false });
    await sleep(delayMs);
  }

  async function submitSchedule(delayMs) {
    clickByText([/^schedule$/i, /^jadualkan$/i, /schedule thread/i], { required: true });
    await sleep(Math.max(2500, delayMs));
  }

  function scanScheduledDrafts() {
    const text = allText();
    const login = detectLoginState();
    const postingMatches = text.match(/Posting\s+\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(AM|PM)?/gi) || [];
    const scheduledKeywordCount = (text.match(/\bScheduled\b/gi) || []).length;
    const rows = Array.from(document.querySelectorAll('[role="dialog"] div, main div, article'))
      .filter(visible)
      .map((element) => textOf(element).replace(/\s+/g, " "))
      .filter((value) => /Posting|Scheduled|Dijadual/i.test(value))
      .slice(0, 80);
    const count = postingMatches.length || Math.min(rows.length, Math.max(0, scheduledKeywordCount));
    return {
      account: accountLabel(),
      threadsConnected: login.connected,
      loginPromptDetected: login.loginPromptDetected,
      nativeScheduledCount: count,
      scheduledItems: rows.map((value) => ({ text: value.slice(0, 900) })),
      scannedAt: new Date().toISOString(),
      url: location.href,
    };
  }

  async function schedulePost(payload) {
    const post = payload.post || {};
    const delayMs = Math.max(700, Math.min(Number(payload.delayMs || 1800), 8000));
    await fillThread(post, delayMs);
    validatePreview(post);
    await openScheduler(post.slot, delayMs);
    validatePreview(post);
    await submitSchedule(delayMs);
    const scan = scanScheduledDrafts();
    return {
      account: scan.account,
      nativeScheduledCount: scan.nativeScheduledCount,
      proofText: `${post.number} | ${post.slot} | ${post.main}`.slice(0, 500),
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
      if (message?.type === "THREADSME_SCAN_THREADS") return scanScheduledDrafts();
      if (message?.type === "THREADSME_SCHEDULE_POST") return schedulePost(message.payload || {});
      throw new Error("Command content ThreadsMe tidak dikenali.");
    })()
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
})();
