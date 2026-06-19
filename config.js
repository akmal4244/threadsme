(() => {
  const productionApi = "https://threadsme.akmalmarvis.com";
  const localApi = "http://127.0.0.1:8788";
  const params = new URLSearchParams(window.location.search);
  const override = params.get("api") || window.localStorage.getItem("THREADSME_API_MODE") || "";
  const host = window.location.hostname;
  const useProductionData = host === "threadsme.akmalmarvis.com";

  window.THREADSME_CONFIG = {
    apiUrl: override === "local"
      ? localApi
      : override === "production"
        ? productionApi
        : useProductionData
          ? productionApi
          : localApi,
    uiVersion: "0.10.3",
  };

  const uiStyles = document.createElement("style");
  uiStyles.textContent = '@import url("./assets/ui-enhancements.css?v=2");';
  document.head.append(uiStyles);
})();

(() => {
  "use strict";

  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const make = (tag, className = "", text = "") => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  };
  const storageGet = (key) => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  };
  const storageSet = (key, value) => {
    try { window.localStorage.setItem(key, value); } catch { /* optional */ }
  };

  function toast(message, tone = "info") {
    const notice = make("div", `tm-ui-notice ${tone}`, message);
    notice.setAttribute("role", tone === "error" ? "alert" : "status");
    document.body.append(notice);
    requestAnimationFrame(() => notice.classList.add("visible"));
    setTimeout(() => {
      notice.classList.remove("visible");
      setTimeout(() => notice.remove(), 220);
    }, tone === "error" ? 5200 : 3200);
  }

  function currentSessionToken() {
    try { return sessionStorage.getItem("threadsme.auth.sessionToken") || ""; } catch { return ""; }
  }

  function apiHeaders(csrf = "", json = false) {
    const headers = new Headers(json ? { "content-type": "application/json" } : {});
    const token = currentSessionToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    if (csrf) headers.set("x-threadsme-csrf", csrf);
    return headers;
  }

  async function refreshProductIntel(button) {
    const note = q("#productIntelNote");
    const title = q("#productTitle");
    const category = q("#productCategory");
    const original = button.textContent;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Refresh...";
    if (note) note.textContent = "Menyemak semula produk tanpa menggunakan cache lama.";
    try {
      const base = String(window.THREADSME_CONFIG?.apiUrl || location.origin).replace(/\/+$/, "");
      const authResponse = await fetch(`${base}/api/auth/status`, {
        credentials: "include",
        cache: "no-store",
        headers: apiHeaders(),
      });
      const auth = await authResponse.json().catch(() => ({}));
      if (!authResponse.ok || (auth.authRequired && !auth.authenticated)) throw new Error("Sesi admin tamat. Login semula dahulu.");
      const response = await fetch(`${base}/api/product-intel`, {
        method: "POST",
        credentials: "include",
        headers: apiHeaders(auth.csrfToken || "", true),
        body: JSON.stringify({
          affiliateLink: q("#productAffiliateLink")?.value.trim() || "",
          imageUrl: q("#productImageUrl")?.value.trim() || "",
          sourceText: q("#storyInput")?.value.trim() || "",
          imageNotes: q("#imageNotes")?.value.trim() || "",
          productTitle: "",
          productCategory: "",
          skipCache: true,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "Refresh Product Intel gagal.");
      const keepManual = Boolean(title?.value.trim());
      if (data.productTitle && !keepManual && title) title.value = data.productTitle;
      if (data.productCategory && !category?.value.trim() && category) category.value = data.productCategory;
      title?.dispatchEvent(new Event("input", { bubbles: true }));
      category?.dispatchEvent(new Event("input", { bubbles: true }));
      try {
        if (!keepManual && typeof state !== "undefined" && data.productTitle) {
          state.productIntel = {
            productTitle: data.productTitle,
            productCategory: data.productCategory || "",
            linkVerified: Boolean(data.linkVerified),
            autoResolvable: Boolean(data.autoResolvable),
            evidenceLevel: data.evidenceLevel || "",
            confidence: Number(data.confidence || 0),
            source: data.source || "Product Intel refresh",
          };
        }
      } catch { /* core state is optional */ }
      const confidence = Number.isFinite(Number(data.confidence)) ? `${Number(data.confidence)}%` : "confidence tidak diketahui";
      if (note) note.textContent = data.productTitle
        ? `Semakan baharu: ${data.productTitle} (${confidence}). ${keepManual ? "Tajuk manual dikekalkan." : "Medan produk dikemas kini."}`
        : "Semakan selesai, tetapi produk masih belum dapat dikenal pasti dengan yakin.";
      toast(data.productTitle ? "Product Intel berjaya direfresh tanpa cache." : "Produk masih perlukan semakan.", data.productTitle ? "success" : "warn");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh gagal.";
      if (note) note.textContent = message;
      toast(message, "error");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.textContent = original;
    }
  }

  function mobileNavigation() {
    const side = q(".side-menu");
    const shell = q(".system-shell");
    const navItems = qa(".nav-item[data-view-target]");
    if (!side || !shell || !navItems.length) return;
    side.id = "tmNavigationDrawer";
    side.classList.add("tm-navigation-drawer");

    const top = make("header", "tm-mobile-topbar");
    const menu = make("button", "tm-mobile-menu-button", "Menu");
    menu.type = "button";
    menu.id = "tmMobileMenuButton";
    menu.setAttribute("aria-label", "Buka menu ThreadsMe");
    menu.setAttribute("aria-controls", side.id);
    menu.setAttribute("aria-expanded", "false");
    const heading = make("div", "tm-mobile-title");
    heading.append(make("strong", "", "ThreadsMe"), make("span", "", "Papan operasi"));
    const pulse = make("span", "tm-mobile-pulse", "Pending 0/25");
    top.append(menu, heading, pulse);
    document.body.insertBefore(top, shell);

    const backdrop = make("button", "tm-nav-backdrop");
    backdrop.type = "button";
    backdrop.setAttribute("aria-label", "Tutup menu ThreadsMe");
    document.body.append(backdrop);

    const bottom = make("nav", "tm-bottom-nav");
    bottom.setAttribute("aria-label", "Navigasi pantas ThreadsMe");
    navItems.forEach((source) => {
      const button = make("button", "tm-bottom-nav-item");
      button.type = "button";
      button.dataset.viewTarget = source.dataset.viewTarget || "";
      const label = source.querySelector("strong")?.textContent?.trim() || "Menu";
      const marker = make("span", "", source.querySelector(":scope > span")?.textContent?.trim() || label.charAt(0));
      marker.setAttribute("aria-hidden", "true");
      button.append(marker, make("strong", "", label));
      button.addEventListener("click", () => {
        source.click();
        document.body.classList.remove("tm-nav-open");
        menu.setAttribute("aria-expanded", "false");
        requestAnimationFrame(() => scrollTo({ top: 0, behavior: "smooth" }));
      });
      bottom.append(button);
    });
    document.body.append(bottom);

    const update = () => {
      const active = q(".nav-item.active") || navItems[0];
      heading.querySelector("strong").textContent = active.querySelector("strong")?.textContent || "ThreadsMe";
      heading.querySelector("span").textContent = active.querySelector("small")?.textContent || "Papan operasi";
      qa(".tm-bottom-nav-item", bottom).forEach((button) => {
        const on = button.dataset.viewTarget === active.dataset.viewTarget;
        button.classList.toggle("active", on);
        if (on) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
      });
      pulse.textContent = `Pending ${q("#pendingPosts")?.textContent || "0"}/25 · Blocked ${q("#blockedPosts")?.textContent || "0"}`;
    };
    const close = () => {
      document.body.classList.remove("tm-nav-open");
      menu.setAttribute("aria-expanded", "false");
    };
    menu.addEventListener("click", () => {
      const open = !document.body.classList.contains("tm-nav-open");
      document.body.classList.toggle("tm-nav-open", open);
      menu.setAttribute("aria-expanded", String(open));
    });
    backdrop.addEventListener("click", close);
    addEventListener("resize", () => { if (innerWidth > 860) close(); });
    navItems.forEach((item) => new MutationObserver(update).observe(item, { attributes: true, attributeFilter: ["class"] }));
    [q("#pendingPosts"), q("#blockedPosts")].filter(Boolean).forEach((node) => new MutationObserver(update).observe(node, { childList: true, subtree: true }));
    update();
  }

  function storyGuide() {
    const page = q('[data-view="story"]');
    const lab = q(".story-lab", page || document);
    if (!page || !lab) return;
    ["storyInput", "productImageUrl", "storyTheme", "imageNotes"].forEach((id) => q(`#${id}`)?.closest("label")?.classList.add("tm-advanced-field"));
    qa(".field-stack > span:first-child").forEach((label) => {
      if (!/optional/i.test(label.textContent || "")) return;
      label.childNodes.forEach((node) => { if (node.nodeType === Node.TEXT_NODE) node.textContent = node.textContent.replace(/\s*optional\s*/i, " "); });
      label.append(make("small", "tm-field-badge", "Optional"));
    });

    const guide = make("section", "tm-workflow-guide reveal");
    guide.setAttribute("aria-label", "Panduan ringkas jana story");
    const head = make("div", "tm-workflow-heading");
    const copy = make("div");
    copy.append(make("p", "eyebrow", "Aliran mudah"), make("h2", "", "Tiga langkah untuk mula"), make("span", "", "Masukkan pautan, semak produk, kemudian jana dan jadualkan."));
    const toggle = make("button", "tm-secondary-button", "Guna mod ringkas");
    toggle.type = "button";
    head.append(copy, toggle);
    const steps = make("div", "tm-workflow-steps");
    [["1", "Pautan produk", "Masukkan link affiliate yang tepat.", "tmStepLink"], ["2", "Semak produk", "Product Intel sahkan tajuk dan kategori.", "tmStepProduct"], ["3", "Jana & jadual", "Pilih jumlah versi dan bina queue.", "tmStepGenerate"]].forEach(([number, title, detail, id]) => {
      const card = make("article", "tm-workflow-step");
      card.id = id;
      const body = make("div");
      body.append(make("strong", "", title), make("small", "", detail));
      card.append(make("span", "tm-step-number", number), body, make("mark", "", "Belum"));
      steps.append(card);
    });
    guide.append(head, steps);
    lab.before(guide);

    const setSimple = (on) => {
      document.body.classList.toggle("tm-simple-mode", on);
      toggle.textContent = on ? "Tunjuk pilihan lanjutan" : "Guna mod ringkas";
      toggle.setAttribute("aria-pressed", String(on));
      storageSet("threadsme.ui.simpleMode", on ? "true" : "false");
    };
    const update = () => {
      const states = [["tmStepLink", Boolean(q("#productAffiliateLink")?.value.trim()), "Pautan sedia"], ["tmStepProduct", Boolean(q("#productTitle")?.value.trim()), "Produk dikenal"], ["tmStepGenerate", Boolean(q("#storyOutput")?.value.trim()), "Story siap"]];
      states.forEach(([id, done, label]) => {
        const card = q(`#${id}`);
        card?.classList.toggle("complete", done);
        if (card) card.querySelector("mark").textContent = done ? label : id === "tmStepGenerate" ? "Langkah akhir" : "Belum";
      });
    };
    toggle.addEventListener("click", () => setSimple(!document.body.classList.contains("tm-simple-mode")));
    [q("#productAffiliateLink"), q("#productTitle"), q("#storyOutput")].filter(Boolean).forEach((node) => node.addEventListener("input", update));
    const generatedList = q("#generatedStatusList");
    if (generatedList) new MutationObserver(update).observe(generatedList, { childList: true, subtree: true });
    const generateButton = q("#generateStoryButton");
    if (generateButton) {
      generateButton.addEventListener("click", () => [300, 1200, 4000].forEach((delay) => setTimeout(update, delay)));
      new MutationObserver(update).observe(generateButton, { attributes: true, attributeFilter: ["aria-busy", "disabled"] });
    }
    setSimple(storageGet("threadsme.ui.simpleMode") !== "false");
    update();
  }

  function scheduleChips() {
    const select = q("#statusFilter");
    const control = q('[data-view="schedule"] .control-band');
    if (!select || !control) return;
    const chips = make("div", "tm-filter-chips");
    chips.setAttribute("aria-label", "Tapis status dengan pantas");
    const update = () => qa("button", chips).forEach((button) => {
      const on = button.dataset.value === select.value;
      button.classList.toggle("active", on);
      button.setAttribute("aria-pressed", String(on));
    });
    Array.from(select.options).forEach((option) => {
      const button = make("button", "tm-filter-chip", option.textContent || option.value);
      button.type = "button";
      button.dataset.value = option.value;
      button.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        update();
      });
      chips.append(button);
    });
    select.addEventListener("change", update);
    control.after(chips);
    update();
  }

  function productIntelButton() {
    const strip = q(".product-intel-strip");
    const primary = q("#productIntelButton");
    if (!strip || !primary) return;
    const actions = make("div", "tm-product-intel-actions");
    primary.before(actions);
    actions.append(primary);
    const refresh = make("button", "tm-secondary-button", "Semak tanpa cache");
    refresh.type = "button";
    refresh.id = "productIntelRefreshButton";
    refresh.addEventListener("click", () => refreshProductIntel(refresh));
    actions.append(refresh);
  }

  function init() {
    mobileNavigation();
    storyGuide();
    scheduleChips();
    productIntelButton();
    ["totalPosts", "passedPosts", "pendingPosts", "failedPosts", "blockedPosts"].forEach((id) => q(`#${id}`)?.closest("article")?.setAttribute("tabindex", "0"));
    document.documentElement.classList.add("tm-ui-ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
