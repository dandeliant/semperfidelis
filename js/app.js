/* ============================================================
   SEMPER FIDELIS — app logic
   ============================================================ */
(function () {
  "use strict";

  const LANGS = ["pl", "en", "ru", "de", "fr"];
  let lang = localStorage.getItem("sf-lang");
  if (!LANGS.includes(lang)) {
    const nav = (navigator.language || "pl").slice(0, 2).toLowerCase();
    lang = LANGS.includes(nav) ? nav : "pl";
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let activeTab = 0;

  /* ---------- rendering ---------- */

  function t() { return I18N[lang]; }

  function renderUI() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => {
      const key = el.dataset.i18n;
      if (t().ui[key] !== undefined) el.textContent = t().ui[key];
    });
    $$("[data-i18n-placeholder]").forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      if (t().ui[key] !== undefined) el.placeholder = t().ui[key];
    });
    $("#langCurrentLabel").textContent = lang.toUpperCase();
    $$("#langMenu li").forEach((li) => li.classList.toggle("active", li.dataset.lang === lang));
  }

  function renderVerse() {
    const verses = t().verses;
    const dayIndex = Math.floor(Date.now() / 86400000) % verses.length;
    const v = verses[dayIndex];
    $("#verseText").textContent = "„" + v.t + "”";
    $("#verseRef").textContent = v.r;
  }

  function renderPrayers() {
    const list = $("#prayerList");
    list.innerHTML = "";
    t().prayers.forEach((p, i) => {
      const item = document.createElement("div");
      item.className = "prayer-item reveal";
      item.innerHTML =
        '<button class="prayer-head" aria-expanded="false">' +
          '<span class="prayer-icon">' + p.icon + "</span>" +
          '<span class="prayer-name"></span>' +
          '<svg class="prayer-chev" width="16" height="16" viewBox="0 0 16 16">' +
            '<path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
        "</button>" +
        '<div class="prayer-body"><p class="prayer-text"></p></div>';
      item.querySelector(".prayer-name").textContent = p.name;
      item.querySelector(".prayer-text").textContent = p.text;

      const head = item.querySelector(".prayer-head");
      const body = item.querySelector(".prayer-body");
      head.addEventListener("click", () => {
        const isOpen = item.classList.contains("open");
        // close others for a calm, single-focus reading experience
        list.querySelectorAll(".prayer-item.open").forEach((o) => {
          o.classList.remove("open");
          o.querySelector(".prayer-body").style.maxHeight = "0px";
          o.querySelector(".prayer-head").setAttribute("aria-expanded", "false");
        });
        if (!isOpen) {
          item.classList.add("open");
          body.style.maxHeight = body.scrollHeight + "px";
          head.setAttribute("aria-expanded", "true");
        }
      });
      list.appendChild(item);
      if (i === 0) {
        item.classList.add("open");
        head.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + "px"; });
      }
    });
  }

  function renderSongs() {
    const grid = $("#songGrid");
    grid.innerHTML = "";
    t().songs.forEach((s) => {
      const card = document.createElement("article");
      card.className = "song-card reveal";
      card.innerHTML =
        '<h3 class="song-title"></h3>' +
        '<p class="song-meta"></p>' +
        '<p class="song-lyrics"></p>';
      card.querySelector(".song-title").textContent = s.title;
      card.querySelector(".song-meta").textContent = s.meta;
      card.querySelector(".song-lyrics").textContent = s.lyrics;
      grid.appendChild(card);
    });
  }

  function renderKnowledge() {
    const tabs = $("#knowledgeTabs");
    const panel = $("#knowledgePanel");
    tabs.innerHTML = "";
    if (activeTab >= t().knowledge.length) activeTab = 0;

    t().knowledge.forEach((k, i) => {
      const btn = document.createElement("button");
      btn.className = "tab-btn" + (i === activeTab ? " active" : "");
      btn.textContent = k.tab;
      btn.addEventListener("click", () => {
        activeTab = i;
        tabs.querySelectorAll(".tab-btn").forEach((b, j) => b.classList.toggle("active", j === i));
        renderKnowledgePanel();
      });
      tabs.appendChild(btn);
    });

    function renderKnowledgePanel() {
      const k = t().knowledge[activeTab];
      panel.innerHTML = "";
      panel.classList.remove("lang-fade");
      void panel.offsetWidth; // restart animation
      panel.classList.add("lang-fade");

      const intro = document.createElement("p");
      intro.className = "k-intro";
      intro.textContent = k.intro;
      panel.appendChild(intro);

      const grid = document.createElement("div");
      grid.className = "k-grid";
      k.cards.forEach((c) => {
        const card = document.createElement("div");
        card.className = "k-card";
        card.innerHTML = '<div class="k-card-icon"></div><h4></h4><p></p>';
        card.querySelector(".k-card-icon").textContent = c.icon;
        card.querySelector("h4").textContent = c.title;
        card.querySelector("p").textContent = c.text;
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    }
    renderKnowledgePanel();
  }

  function renderFacts() {
    const grid = $("#factsGrid");
    grid.innerHTML = "";
    t().facts.forEach((f, i) => {
      const card = document.createElement("article");
      card.className = "fact-card reveal";
      card.innerHTML =
        '<span class="fact-num">' + String(i + 1).padStart(2, "0") + "</span>" +
        '<div class="fact-icon"></div><h4></h4><p></p>';
      card.querySelector(".fact-icon").textContent = f.icon;
      card.querySelector("h4").textContent = f.title;
      card.querySelector("p").textContent = f.text;
      grid.appendChild(card);
    });
  }

  /* ---------- candles (localStorage, 7-day lifetime) ---------- */

  const CANDLE_KEY = "sf-candles";
  const CANDLE_TTL = 7 * 86400000;

  function loadCandles() {
    let list = [];
    try { list = JSON.parse(localStorage.getItem(CANDLE_KEY)) || []; } catch (e) { /* corrupted → reset */ }
    const now = Date.now();
    const fresh = list.filter((c) => now - c.ts < CANDLE_TTL);
    if (fresh.length !== list.length) saveCandles(fresh);
    return fresh;
  }
  function saveCandles(list) {
    localStorage.setItem(CANDLE_KEY, JSON.stringify(list));
  }

  function renderCandles() {
    const row = $("#candleRow");
    row.innerHTML = "";
    const candles = loadCandles();
    if (!candles.length) {
      const empty = document.createElement("p");
      empty.className = "candle-empty";
      empty.textContent = t().ui.candles_empty;
      row.appendChild(empty);
      return;
    }
    candles.forEach((c, i) => {
      const el = document.createElement("div");
      el.className = "candle";
      el.style.animationDelay = (i * 0.06) + "s";
      el.innerHTML = '<div class="flame"></div><div class="candle-wax"></div><div class="candle-label"></div>';
      el.querySelector(".flame").style.animationDelay = (Math.random() * -1.6).toFixed(2) + "s";
      el.querySelector(".candle-label").textContent = c.name;
      el.title = c.name;
      row.appendChild(el);
    });
  }

  $("#candleForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#candleIntention");
    const name = input.value.trim();
    if (!name) return;
    const candles = loadCandles();
    candles.push({ name: name, ts: Date.now() });
    saveCandles(candles.slice(-24)); // keep the chapel tidy
    input.value = "";
    renderCandles();
  });

  /* ---------- language switching ---------- */

  function setLang(next) {
    if (!LANGS.includes(next) || next === lang) { closeLangMenu(); return; }
    lang = next;
    localStorage.setItem("sf-lang", lang);
    document.querySelector("main").classList.remove("lang-fade");
    void document.querySelector("main").offsetWidth;
    document.querySelector("main").classList.add("lang-fade");
    renderAll();
    closeLangMenu();
  }

  const langSwitch = $("#langSwitch");
  function closeLangMenu() { langSwitch.classList.remove("open"); }

  $("#langCurrent").addEventListener("click", (e) => {
    e.stopPropagation();
    langSwitch.classList.toggle("open");
  });
  $$("#langMenu li").forEach((li) =>
    li.addEventListener("click", () => setLang(li.dataset.lang))
  );
  document.addEventListener("click", (e) => {
    if (!langSwitch.contains(e.target)) closeLangMenu();
  });

  /* ---------- nav behaviour ---------- */

  const nav = $("#nav");
  const navLinks = $("#navLinks");
  const burger = $("#burger");

  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 30);
  }, { passive: true });

  burger.addEventListener("click", () => navLinks.classList.toggle("open"));
  navLinks.addEventListener("click", (e) => {
    if (e.target.tagName === "A") navLinks.classList.remove("open");
  });

  /* ---------- scroll reveal ---------- */

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        en.target.classList.add("visible");
        observer.unobserve(en.target);
      }
    });
  }, { threshold: 0.12 });

  function observeReveals() {
    $$(".reveal:not(.visible)").forEach((el) => observer.observe(el));
  }

  /* ---------- floating light particles ---------- */

  function spawnParticles() {
    const host = $("#particles");
    const count = window.innerWidth < 700 ? 14 : 26;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "particle";
      const size = 3 + Math.random() * 7;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = Math.random() * 100 + "vw";
      p.style.setProperty("--sway", (Math.random() * 120 - 60) + "px");
      p.style.animationDuration = (14 + Math.random() * 18) + "s";
      p.style.animationDelay = (-Math.random() * 30) + "s";
      host.appendChild(p);
    }
  }

  /* ---------- boot ---------- */

  function renderAll() {
    renderUI();
    renderVerse();
    renderPrayers();
    renderSongs();
    renderKnowledge();
    renderFacts();
    renderCandles();
    // newly created .reveal elements inside already-visible viewport
    requestAnimationFrame(() => {
      observeReveals();
      // make re-rendered elements visible immediately if already on screen
      $$(".reveal").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add("visible");
      });
    });
  }

  spawnParticles();
  renderAll();

  /* ---------- PWA service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* offline mode unavailable */ });
    });
  }
})();
