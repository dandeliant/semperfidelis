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

  /* ---------- text-to-speech (browser speech synthesis; Google voices on Chrome/Android) ---------- */

  const TTS_LANG = { pl: "pl-PL", en: "en-GB", ru: "ru-RU", de: "de-DE", fr: "fr-FR" };
  const TTS_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';

  let ttsVoices = [];
  if ("speechSynthesis" in window) {
    const loadVoices = () => { ttsVoices = speechSynthesis.getVoices(); };
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function pickVoice(bcp) {
    const prefix = bcp.slice(0, 2);
    const cands = ttsVoices.filter((v) => v.lang.replace("_", "-").toLowerCase().indexOf(prefix) === 0);
    return (
      cands.find((v) => /google/i.test(v.name) && v.lang.replace("_", "-") === bcp) ||
      cands.find((v) => /google/i.test(v.name)) ||
      cands.find((v) => v.lang.replace("_", "-") === bcp) ||
      cands[0] || null
    );
  }

  // split long texts into sentence-sized chunks (Chrome cuts off long utterances)
  function chunkText(text) {
    const parts = text.split(/\n+/).reduce((acc, line) => acc.concat(line.split(/(?<=[.!?;:])\s+/)), []);
    const chunks = [];
    let cur = "";
    parts.forEach((p) => {
      p = p.trim();
      if (!p) return;
      if (cur && (cur + " " + p).length > 180) { chunks.push(cur); cur = p; }
      else cur = cur ? cur + " " + p : p;
    });
    if (cur) chunks.push(cur);
    return chunks;
  }

  let speakingBtn = null;

  function stopSpeech() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (speakingBtn) {
      speakingBtn.classList.remove("speaking");
      speakingBtn.title = t().ui.tts_listen;
      speakingBtn.setAttribute("aria-label", t().ui.tts_listen);
      speakingBtn = null;
    }
  }

  function speak(text, btn) {
    if (btn === speakingBtn) { stopSpeech(); return; }
    stopSpeech();
    const bcp = TTS_LANG[lang];
    const chunks = chunkText(text);
    if (!chunks.length) return;
    speakingBtn = btn;
    btn.classList.add("speaking");
    btn.title = t().ui.tts_stop;
    btn.setAttribute("aria-label", t().ui.tts_stop);
    const voice = pickVoice(bcp);
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = bcp;
      if (voice) u.voice = voice;
      u.rate = 0.95;
      if (i === chunks.length - 1) {
        u.onend = () => { if (speakingBtn === btn) stopSpeech(); };
      }
      u.onerror = () => { if (speakingBtn === btn) stopSpeech(); };
      speechSynthesis.speak(u);
    });
  }

  function makeTtsBtn(text, pill) {
    if (!("speechSynthesis" in window)) return null;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tts-btn" + (pill ? " tts-pill" : "");
    b.innerHTML = TTS_ICON + (pill ? "<span></span>" : "");
    if (pill) b.querySelector("span").textContent = t().ui.tts_listen;
    b.title = t().ui.tts_listen;
    b.setAttribute("aria-label", t().ui.tts_listen);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(text, b);
    });
    return b;
  }

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
    const card = $("#verseCard");
    const old = card.querySelector(".tts-btn");
    if (old) old.remove();
    const btn = makeTtsBtn(v.t + " — " + v.r, false);
    if (btn) card.appendChild(btn);
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
        '<div class="prayer-body"><div class="prayer-tools"></div><p class="prayer-text"></p></div>';
      item.querySelector(".prayer-name").textContent = p.name;
      item.querySelector(".prayer-text").textContent = p.text;
      const ttsBtn = makeTtsBtn(p.name + ". " + p.text, true);
      if (ttsBtn) item.querySelector(".prayer-tools").appendChild(ttsBtn);

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
        '<div class="song-top"><h3 class="song-title"></h3></div>' +
        '<p class="song-meta"></p>' +
        '<p class="song-lyrics"></p>';
      card.querySelector(".song-title").textContent = s.title;
      card.querySelector(".song-meta").textContent = s.meta;
      card.querySelector(".song-lyrics").textContent = s.lyrics;
      const ttsBtn = makeTtsBtn(s.title + ". " + s.lyrics, false);
      if (ttsBtn) card.querySelector(".song-top").appendChild(ttsBtn);
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
      stopSpeech();
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
        const ttsBtn = makeTtsBtn(c.title + ". " + c.text, false);
        if (ttsBtn) card.appendChild(ttsBtn);
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
      const ttsBtn = makeTtsBtn(f.title + ". " + f.text, false);
      if (ttsBtn) card.appendChild(ttsBtn);
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
    stopSpeech();
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
