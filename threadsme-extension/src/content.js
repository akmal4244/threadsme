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
  const THREADSME_PART_LIMIT = 300;

  function normalizeComposerText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function accountLabel() {
    const meta = document.querySelector('meta[property="og:title"], meta[name="title"]')?.content || "";
    const profileLink = Array.from(document.querySelectorAll('a[href^="/@"], a[href*="/@"]'))
      .filter(visible)
      .map((item) => item.href)
      .find(Boolean);
    if (profileLink) return profileLink;
    if (meta && !/\b(log in|sign in|masuk)\b/i.test(meta)) return meta;
    const title = document.title || "";
    if (title && !/\b(log in|sign in|masuk)\b/i.test(title)) return title;
    return "Threads session Chrome aktif";
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

  function textboxValue(textbox) {
    if (!textbox) return "";
    if ("value" in textbox) return normalizeComposerText(textbox.value);
    return normalizeComposerText(textbox.innerText || textbox.textContent || "");
  }

  function dispatchTextboxInput(textbox, inputType = "insertText", data = null) {
    let inputEvent;
    try {
      inputEvent = new InputEvent("input", { bubbles: true, inputType, data });
    } catch {
      inputEvent = new Event("input", { bubbles: true });
    }
    textbox.dispatchEvent(inputEvent);
    textbox.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearTextboxValue(textbox) {
    textbox.focus();
    if ("value" in textbox) {
      textbox.value = "";
      dispatchTextboxInput(textbox, "deleteContentBackward", null);
      return;
    }

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textbox);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false, null);
    textbox.textContent = "";
    textbox.innerHTML = "";
    dispatchTextboxInput(textbox, "deleteContentBackward", null);
    selection.removeAllRanges();
  }

  function replaceContenteditableText(textbox, value) {
    textbox.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(textbox);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete", false, null);
    const inserted = document.execCommand("insertText", false, value);
    if (!inserted || textboxValue(textbox) !== normalizeComposerText(value)) {
      textbox.replaceChildren(document.createTextNode(value));
    }
    selection.removeAllRanges();
    dispatchTextboxInput(textbox, "insertText", null);
  }

  function insertTextboxValue(textbox, value) {
    textbox.focus();
    if ("value" in textbox) {
      textbox.value = value;
      dispatchTextboxInput(textbox, "insertText", value);
      return;
    }

    replaceContenteditableText(textbox, value);
  }

  async function setTextboxValue(textbox, value) {
    const clean = normalizeComposerText(value);
    if (clean.length > THREADSME_PART_LIMIT) {
      throw new Error(`Teks ThreadsMe melebihi ${THREADSME_PART_LIMIT} aksara (${clean.length}). Extension tahan supaya composer Threads tidak jadi negatif.`);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      clearTextboxValue(textbox);
      await sleep(120);
      insertTextboxValue(textbox, clean);
      await sleep(180);
      if (textboxValue(textbox) === clean) return;
    }

    const actual = textboxValue(textbox);
    clearTextboxValue(textbox);
    throw new Error(`Composer Threads tidak dapat dikosongkan dengan bersih. Expected ${clean.length} aksara, actual ${actual.length}. Tutup draf lama dan cuba semula.`);
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
    const overLimit = parts.find((part) => normalizeComposerText(part).length > THREADSME_PART_LIMIT);
    if (overLimit) {
      throw new Error(`Satu bahagian thread melebihi ${THREADSME_PART_LIMIT} aksara. Extension tahan sebelum isi composer.`);
    }

    const first = await ensureComposer();
    const existingBoxes = getTextboxes();
    if (existingBoxes.length > 3) {
      existingBoxes.forEach(clearTextboxValue);
      throw new Error("Composer Threads ada draf/box berlebihan. Extension sudah kosongkan draf untuk elak duplicate. Cuba schedule semula.");
    }
    await setTextboxValue(first, parts[0]);
    await sleep(delayMs);
    let boxes = getTextboxes();
    while (boxes.length < 2) {
      await addReplyBox();
      boxes = getTextboxes();
    }
    await setTextboxValue(boxes[1], parts[1]);
    await sleep(delayMs);
    boxes = getTextboxes();
    while (boxes.length < 3) {
      await addReplyBox();
      boxes = getTextboxes();
    }
    await setTextboxValue(boxes[2], parts[2]);
    await sleep(Math.max(2200, delayMs));

    boxes = getTextboxes();
    const filled = boxes.slice(0, 3).map(textboxValue);
    const expected = parts.map(normalizeComposerText);
    const mismatch = filled.find((value, index) => value !== expected[index]);
    const extraFilled = boxes.slice(3).map(textboxValue).filter(Boolean);
    if (mismatch || extraFilled.length) {
      boxes.forEach(clearTextboxValue);
      throw new Error("Composer Threads nampak tidak selari selepas isi. Extension kosongkan draf untuk elak duplicate/over-limit.");
    }
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

  function composerStillContains(parts) {
    const needles = parts
      .map((part) => normalizeComposerText(part).slice(0, 80))
      .filter((part) => part.length >= 24);
    if (!needles.length) return false;
    return getTextboxes().some((box) => {
      const value = textboxValue(box);
      return needles.some((needle) => value.includes(needle));
    });
  }

  async function waitForScheduleConfirmation(parts, delayMs) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await sleep(Math.max(900, Math.min(delayMs, 2200)));
      const bodyText = allText();
      const stillDraft = composerStillContains(parts);
      const hasPositiveSignal = /\b(scheduled|posting|dijadual|jadual)\b/i.test(bodyText);
      if (!stillDraft && (hasPositiveSignal || getTextboxes().length < 3)) return true;
    }
    throw new Error("Threads belum beri confirmation schedule. Extension tahan proof supaya status ThreadsMe tidak palsu.");
  }

  async function submitSchedule(delayMs, parts) {
    clickByText([/^schedule$/i, /^jadualkan$/i, /schedule thread/i], { required: true });
    await waitForScheduleConfirmation(parts, delayMs);
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
    const scanReliable = Boolean(count || rows.length || /\b(Scheduled posts|Scheduled|Posting|Dijadual|Draf)\b/i.test(text));
    return {
      account: accountLabel(),
      threadsConnected: login.connected,
      loginPromptDetected: login.loginPromptDetected,
      nativeScheduledCount: count,
      scheduledItems: rows.map((value) => ({ text: value.slice(0, 900) })),
      scanReliable,
      scanNote: scanReliable
        ? "Scheduled signal dikesan pada halaman semasa."
        : "Halaman semasa tidak menunjukkan senarai scheduled; kiraan scan mungkin tidak lengkap.",
      scannedAt: new Date().toISOString(),
      url: location.href,
    };
  }

  async function schedulePost(payload) {
    if (window.__THREADSME_SCHEDULE_BUSY__) {
      throw new Error("Schedule ThreadsMe sedang berjalan. Tunggu proses semasa selesai untuk elak teks duplicate.");
    }
    window.__THREADSME_SCHEDULE_BUSY__ = true;
    const post = payload.post || {};
    const delayMs = Math.max(700, Math.min(Number(payload.delayMs || 1800), 8000));
    const parts = [post.main, post.reply1, post.reply2].map((part) => String(part || "").trim()).filter(Boolean);
    try {
      await fillThread(post, delayMs);
      validatePreview(post);
      await openScheduler(post.slot, delayMs);
      validatePreview(post);
      await submitSchedule(delayMs, parts);
      const scan = scanScheduledDrafts();
      return {
        account: scan.account,
        nativeScheduledCount: scan.nativeScheduledCount,
        scanReliable: scan.scanReliable,
        proofText: `${post.number} | ${post.slot} | ${post.main}`.slice(0, 500),
      };
    } catch (error) {
      getTextboxes().forEach(clearTextboxValue);
      throw error;
    } finally {
      window.__THREADSME_SCHEDULE_BUSY__ = false;
    }
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
