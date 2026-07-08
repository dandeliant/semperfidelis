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
  let editMode = false;

  /* ---------- user content overlay (edits + additions, stored locally) ---------- */

  const CAT_FIELDS = {
    prayers: [["name", "ed_name", "input"], ["text", "ed_text", "textarea"]],
    songs: [["title", "ed_name", "input"], ["meta", "ed_meta", "input"], ["lyrics", "ed_lyrics", "textarea"]],
    facts: [["title", "ed_name", "input"], ["text", "ed_text", "textarea"]],
    knowledge: [["title", "ed_name", "input"], ["text", "ed_text", "textarea"]],
  };
  const CAT_HAS_ICON = { prayers: true, songs: false, facts: true, knowledge: true };
  const ADD_LABEL = { prayers: "ed_add_prayer", songs: "ed_add_song", facts: "ed_add_fact", knowledge: "ed_add_card" };
  const FLAGS = { pl: "🇵🇱", en: "🇬🇧", ru: "🇷🇺", de: "🇩🇪", fr: "🇫🇷" };

  function normalizeContent(c) {
    const o = {
      edits: { prayers: {}, songs: {}, facts: {}, knowledge: {} },
      added: { prayers: [], songs: [], facts: [], knowledge: [] },
    };
    if (c && typeof c === "object") {
      ["prayers", "songs", "facts", "knowledge"].forEach((cat) => {
        if (c.edits && c.edits[cat] && typeof c.edits[cat] === "object") o.edits[cat] = c.edits[cat];
        if (c.added && Array.isArray(c.added[cat])) o.added[cat] = c.added[cat];
      });
    }
    return o;
  }

  let userContent;
  try { userContent = normalizeContent(JSON.parse(localStorage.getItem("sf-user-content"))); }
  catch (e) { userContent = normalizeContent(null); }

  function saveUserContent() {
    localStorage.setItem("sf-user-content", JSON.stringify(userContent));
  }

  function hasAny(obj, cat) {
    return CAT_FIELDS[cat].some(([f]) => obj && obj[f] && String(obj[f]).trim());
  }

  // best translation of a user-added entry for the current language
  function trFor(entry, cat) {
    if (entry.tr[lang] && hasAny(entry.tr[lang], cat)) return entry.tr[lang];
    if (entry.src && entry.tr[entry.src] && hasAny(entry.tr[entry.src], cat)) return entry.tr[entry.src];
    for (let i = 0; i < LANGS.length; i++) {
      if (entry.tr[LANGS[i]] && hasAny(entry.tr[LANGS[i]], cat)) return entry.tr[LANGS[i]];
    }
    return {};
  }

  function baseItemFor(cat, idx, l) {
    if (cat === "knowledge") {
      const p = String(idx).split(":");
      return I18N[l].knowledge[Number(p[0])].cards[Number(p[1])];
    }
    return I18N[l][cat][idx];
  }

  // base items merged with user edits, followed by user additions
  function effSimple(cat) {
    const base = t()[cat].map((it, i) => {
      const ed = userContent.edits[cat][i];
      const out = Object.assign({}, it);
      if (ed) {
        if (ed.icon) out.icon = ed.icon;
        if (ed.tr && ed.tr[lang] && hasAny(ed.tr[lang], cat)) Object.assign(out, ed.tr[lang]);
      }
      out._ref = { kind: "base", idx: i };
      return out;
    });
    const added = userContent.added[cat].map((a) => {
      const out = Object.assign({}, trFor(a, cat));
      out.icon = a.icon || "🕊";
      out._ref = { kind: "added", id: a.id };
      return out;
    });
    return base.concat(added);
  }

  function effKnowledge() {
    return t().knowledge.map((k, ti) => {
      const cards = k.cards.map((c, ci) => {
        const key = ti + ":" + ci;
        const ed = userContent.edits.knowledge[key];
        const out = Object.assign({}, c);
        if (ed) {
          if (ed.icon) out.icon = ed.icon;
          if (ed.tr && ed.tr[lang] && hasAny(ed.tr[lang], "knowledge")) Object.assign(out, ed.tr[lang]);
        }
        out._ref = { kind: "base", idx: key };
        return out;
      });
      const added = userContent.added.knowledge
        .filter((a) => a.tab === ti)
        .map((a) => {
          const out = Object.assign({}, trFor(a, "knowledge"));
          out.icon = a.icon || "🕊";
          out._ref = { kind: "added", id: a.id };
          return out;
        });
      return { tab: k.tab, intro: k.intro, daily: !!k.daily, cards: cards.concat(added) };
    });
  }

  /* ---------- favourites ---------- */

  let favs;
  try { favs = new Set(JSON.parse(localStorage.getItem("sf-favs")) || []); }
  catch (e) { favs = new Set(); }
  const favKey = (ref) => (ref.kind === "base" ? "b" + ref.idx : "a" + ref.id);
  function saveFavs() { localStorage.setItem("sf-favs", JSON.stringify(Array.from(favs))); }

  const PENCIL_ICON =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';

  function editBadge(cat, ref, tabIdx) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "edit-badge";
    b.innerHTML = PENCIL_ICON;
    b.title = t().ui.ed_edit;
    b.setAttribute("aria-label", t().ui.ed_edit);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(cat, ref, tabIdx);
    });
    return b;
  }

  function addTile(cat, tabIdx) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "add-tile";
    btn.innerHTML = '<span class="add-plus">+</span><span></span>';
    btn.querySelector("span:last-child").textContent = t().ui[ADD_LABEL[cat]];
    btn.addEventListener("click", () => openEditor(cat, null, tabIdx));
    return btn;
  }

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
    const et = $("#editToggle");
    et.title = t().ui.ed_mode;
    et.setAttribute("aria-label", t().ui.ed_mode);
    const sb = $("#searchBtn");
    sb.title = t().ui.search_label;
    sb.setAttribute("aria-label", t().ui.search_label);
    const th = $("#themeToggle");
    th.title = t().ui.theme_toggle;
    th.setAttribute("aria-label", t().ui.theme_toggle);
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

  function renderPrayers(autoOpen) {
    const list = $("#prayerList");
    list.innerHTML = "";
    const items = effSimple("prayers");
    // favourites float to the top, otherwise keep original order (stable sort)
    items.sort((a, b) => (favs.has(favKey(b._ref)) ? 1 : 0) - (favs.has(favKey(a._ref)) ? 1 : 0));
    items.forEach((p, i) => {
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
      item.dataset.key = favKey(p._ref);
      const ttsBtn = makeTtsBtn(p.name + ". " + p.text, true);
      if (ttsBtn) item.querySelector(".prayer-tools").appendChild(ttsBtn);
      const isFav = favs.has(favKey(p._ref));
      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "tts-btn tts-pill fav-pill" + (isFav ? " fav-on" : "");
      favBtn.innerHTML = '<span class="fav-star">★</span>';
      favBtn.title = isFav ? t().ui.fav_remove : t().ui.fav_add;
      favBtn.setAttribute("aria-label", favBtn.title);
      favBtn.addEventListener("click", () => {
        const k = favKey(p._ref);
        if (favs.has(k)) favs.delete(k); else favs.add(k);
        saveFavs();
        renderPrayers(false);
      });
      item.querySelector(".prayer-tools").appendChild(favBtn);
      if (editMode) item.appendChild(editBadge("prayers", p._ref));

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
      if (i === 0 && autoOpen !== false) {
        item.classList.add("open");
        head.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => { body.style.maxHeight = body.scrollHeight + "px"; });
      }
    });
    if (editMode) list.appendChild(addTile("prayers"));
  }

  function renderSongs() {
    const grid = $("#songGrid");
    grid.innerHTML = "";
    effSimple("songs").forEach((s) => {
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
      if (editMode) card.appendChild(editBadge("songs", s._ref));
      grid.appendChild(card);
    });
    if (editMode) grid.appendChild(addTile("songs"));
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
      const k = effKnowledge()[activeTab];
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
      let cards = k.cards;
      if (k.daily && cards.length) {
        // rotate so a different saint leads each day — the "saint of the day"
        const off = Math.floor(Date.now() / 86400000) % cards.length;
        cards = cards.slice(off).concat(cards.slice(0, off));
      }
      cards.forEach((c, ci) => {
        const card = document.createElement(c.url ? "a" : "div");
        card.className = "k-card";
        if (c.url) {
          card.href = c.url;
          card.target = "_blank";
          card.rel = "noopener";
          card.classList.add("k-link");
        }
        if (k.daily && ci === 0) {
          card.classList.add("patron");
          const badge = document.createElement("span");
          badge.className = "patron-badge";
          badge.textContent = "✨ " + t().ui.k_patron;
          card.appendChild(badge);
        }
        card.insertAdjacentHTML("beforeend", '<div class="k-card-icon"></div><h4></h4><p></p>');
        card.querySelector(".k-card-icon").textContent = c.icon;
        card.querySelector("h4").textContent = c.title;
        card.querySelector("p").textContent = c.text;
        const ttsBtn = makeTtsBtn(c.title + ". " + c.text, false);
        if (ttsBtn) card.appendChild(ttsBtn);
        if (editMode) card.appendChild(editBadge("knowledge", c._ref, activeTab));
        grid.appendChild(card);
      });
      if (editMode) grid.appendChild(addTile("knowledge", activeTab));
      panel.appendChild(grid);
    }
    renderKnowledgePanel();
  }

  function renderFacts() {
    const grid = $("#factsGrid");
    grid.innerHTML = "";
    effSimple("facts").forEach((f, i) => {
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
      if (editMode) card.appendChild(editBadge("facts", f._ref));
      grid.appendChild(card);
    });
    if (editMode) grid.appendChild(addTile("facts"));
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

  /* ---------- editor modal ---------- */

  let editorState = null;
  let toastTimer = null;

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 320);
    }, 3200);
  }

  function openEditor(cat, ref, tabIdx) {
    const fields = CAT_FIELDS[cat];
    const draft = {};
    LANGS.forEach((l) => { draft[l] = {}; });
    let icon = "";
    let mode;
    if (!ref) {
      mode = "add";
    } else if (ref.kind === "base") {
      mode = "edit-base";
      const ed = userContent.edits[cat][ref.idx] || {};
      LANGS.forEach((l) => {
        const b = baseItemFor(cat, ref.idx, l);
        const over = ed.tr && ed.tr[l];
        fields.forEach(([f]) => {
          draft[l][f] = over && over[f] != null && String(over[f]).trim() ? over[f] : (b[f] || "");
        });
      });
      icon = ed.icon || baseItemFor(cat, ref.idx, lang).icon || "";
    } else {
      mode = "edit-added";
      const a = userContent.added[cat].find((x) => x.id === ref.id);
      if (!a) return;
      LANGS.forEach((l) => {
        fields.forEach(([f]) => { draft[l][f] = (a.tr[l] && a.tr[l][f]) || ""; });
      });
      icon = a.icon || "";
      tabIdx = a.tab;
    }
    editorState = { cat, ref, tabIdx, mode, draft, icon, lang: lang };
    buildModal();
  }

  function buildModal() {
    const st = editorState;
    $("#modalTitle").textContent = st.mode === "add" ? t().ui[ADD_LABEL[st.cat]] : t().ui.ed_edit;

    const tabs = $("#modalLangs");
    tabs.innerHTML = "";
    LANGS.forEach((l) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mlang" + (l === st.lang ? " active" : "") + (hasAny(st.draft[l], st.cat) ? " filled" : "");
      b.innerHTML = "<span>" + FLAGS[l] + "</span><span>" + l.toUpperCase() + "</span><span class=\"dot\"></span>";
      b.addEventListener("click", () => { syncDraft(); st.lang = l; buildModal(); });
      tabs.appendChild(b);
    });

    const iconRow = $("#modalIconRow");
    if (CAT_HAS_ICON[st.cat]) {
      iconRow.hidden = false;
      $("#modalIconLabel").textContent = t().ui.ed_icon;
      $("#modalIcon").value = st.icon;
    } else {
      iconRow.hidden = true;
    }

    const wrap = $("#modalFields");
    wrap.innerHTML = "";
    CAT_FIELDS[st.cat].forEach(([f, labelKey, kind]) => {
      const lab = document.createElement("label");
      lab.textContent = t().ui[labelKey];
      lab.htmlFor = "mf_" + f;
      const inp = document.createElement(kind === "textarea" ? "textarea" : "input");
      if (kind !== "textarea") inp.type = "text";
      inp.id = "mf_" + f;
      inp.dataset.field = f;
      inp.value = st.draft[st.lang][f] || "";
      wrap.appendChild(lab);
      wrap.appendChild(inp);
    });

    $("#modalSave").textContent = t().ui.ed_save;
    $("#modalCancel").textContent = t().ui.ed_cancel;
    const del = $("#modalDelete");
    if (st.mode === "edit-added") {
      del.hidden = false;
      del.textContent = t().ui.ed_delete;
    } else if (st.mode === "edit-base" && userContent.edits[st.cat][st.ref.idx]) {
      del.hidden = false;
      del.textContent = t().ui.ed_revert;
    } else {
      del.hidden = true;
    }
    $("#editorModal").hidden = false;
  }

  function syncDraft() {
    const st = editorState;
    if (!st) return;
    $$("#modalFields [data-field]").forEach((inp) => {
      st.draft[st.lang][inp.dataset.field] = inp.value;
    });
    if (CAT_HAS_ICON[st.cat]) st.icon = $("#modalIcon").value;
  }

  function closeModal() {
    $("#editorModal").hidden = true;
    editorState = null;
  }

  function saveEditor() {
    syncDraft();
    const st = editorState;
    if (!LANGS.some((l) => hasAny(st.draft[l], st.cat))) {
      toast(t().ui.ed_need_content);
      return;
    }
    if (st.mode === "add") {
      userContent.added[st.cat].push({
        id: "u" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        tab: st.cat === "knowledge" ? st.tabIdx : undefined,
        icon: (st.icon || "").trim(),
        src: lang,
        tr: st.draft,
      });
    } else if (st.mode === "edit-added") {
      const a = userContent.added[st.cat].find((x) => x.id === st.ref.id);
      if (a) { a.tr = st.draft; a.icon = (st.icon || "").trim(); }
    } else {
      const tr = {};
      LANGS.forEach((l) => {
        const b = baseItemFor(st.cat, st.ref.idx, l);
        const changed = CAT_FIELDS[st.cat].some(([f]) => (st.draft[l][f] || "") !== (b[f] || ""));
        if (changed) tr[l] = st.draft[l];
      });
      const baseIcon = baseItemFor(st.cat, st.ref.idx, "pl").icon || "";
      const iconChanged = CAT_HAS_ICON[st.cat] && (st.icon || "").trim() && (st.icon || "").trim() !== baseIcon;
      if (Object.keys(tr).length || iconChanged) {
        userContent.edits[st.cat][st.ref.idx] = {
          icon: iconChanged ? st.icon.trim() : undefined,
          tr: tr,
        };
      } else {
        delete userContent.edits[st.cat][st.ref.idx];
      }
    }
    saveUserContent();
    closeModal();
    renderAll();
  }

  $("#modalSave").addEventListener("click", saveEditor);
  $("#modalCancel").addEventListener("click", closeModal);
  $("#modalDelete").addEventListener("click", () => {
    const st = editorState;
    if (!st) return;
    if (!confirm(t().ui.ed_confirm_delete)) return;
    if (st.mode === "edit-added") {
      userContent.added[st.cat] = userContent.added[st.cat].filter((x) => x.id !== st.ref.id);
    } else {
      delete userContent.edits[st.cat][st.ref.idx];
    }
    saveUserContent();
    closeModal();
    renderAll();
  });
  $("#editorModal").addEventListener("click", (e) => {
    if (e.target === $("#editorModal")) closeModal();
  });

  /* ---------- edit mode, export & import ---------- */

  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("edit-mode", on);
    $("#editToolbar").hidden = !on;
    renderAll();
  }

  $("#editToggle").addEventListener("click", () => setEditMode(!editMode));
  $("#editDone").addEventListener("click", () => setEditMode(false));

  $("#exportBtn").addEventListener("click", () => {
    const payload = {
      app: "semper-fidelis",
      type: "user-content",
      version: 1,
      exportedAt: new Date().toISOString(),
      content: userContent,
      candles: loadCandles(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "semper-fidelis-tresci.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t().ui.ed_export_ok);
  });

  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(r.result);
        if (obj.app !== "semper-fidelis" || !obj.content) throw new Error("bad file");
        userContent = normalizeContent(obj.content);
        saveUserContent();
        if (Array.isArray(obj.candles)) saveCandles(obj.candles);
        renderAll();
        toast(t().ui.ed_import_ok);
      } catch (err) {
        toast(t().ui.ed_import_err);
      }
      e.target.value = "";
    };
    r.readAsText(f);
  });

  /* ---------- night mode ---------- */

  const savedTheme = localStorage.getItem("sf-theme");
  if (savedTheme === "dark" || (!savedTheme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.body.classList.add("dark");
  }
  function updateThemeColor() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = document.body.classList.contains("dark") ? "#14172a" : "#fbf9f4";
  }
  $("#themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");
    localStorage.setItem("sf-theme", document.body.classList.contains("dark") ? "dark" : "light");
    updateThemeColor();
  });
  updateThemeColor();

  /* ---------- search ---------- */

  function openSearch() {
    $("#searchOverlay").hidden = false;
    const inp = $("#searchInput");
    inp.value = "";
    $("#searchResults").innerHTML = "";
    setTimeout(() => inp.focus(), 60);
  }
  function closeSearch() { $("#searchOverlay").hidden = true; }

  $("#searchBtn").addEventListener("click", openSearch);
  $("#searchOverlay").addEventListener("click", (e) => {
    if (e.target === $("#searchOverlay")) closeSearch();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeSearch(); closeModal(); }
  });

  function snippet(text, q) {
    const idx = text.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 34);
    let s = text.slice(start, start + 110).replace(/\n/g, " ");
    if (start > 0) s = "…" + s;
    if (start + 110 < text.length) s += "…";
    return s;
  }

  function runSearch() {
    const q = $("#searchInput").value.trim().toLowerCase();
    const out = $("#searchResults");
    out.innerHTML = "";
    if (q.length < 2) return;
    const results = [];
    const add = (cat, title, text, go) => {
      const hay = (title + "\n" + text).toLowerCase();
      if (hay.indexOf(q) === -1) return;
      results.push({ cat, title, text, go, rank: title.toLowerCase().indexOf(q) !== -1 ? 0 : 1 });
    };
    effSimple("prayers").forEach((p) => add(t().ui.nav_prayers, p.name, p.text, () => goPrayer(p._ref)));
    effSimple("songs").forEach((s, i) => add(t().ui.nav_songs, s.title, (s.meta || "") + "\n" + s.lyrics, () => goCard("#songGrid .song-card", i)));
    effKnowledge().forEach((k, ti) => k.cards.forEach((c) => add(t().ui.nav_knowledge + " · " + k.tab, c.title, c.text, () => goKnowledge(ti, c.title))));
    effSimple("facts").forEach((f, i) => add(t().ui.nav_facts, f.title, f.text, () => goCard("#factsGrid .fact-card", i)));
    results.sort((a, b) => a.rank - b.rank);
    if (!results.length) {
      out.innerHTML = '<p class="search-empty"></p>';
      out.querySelector(".search-empty").textContent = t().ui.search_empty;
      return;
    }
    results.slice(0, 20).forEach((r) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-item";
      item.innerHTML = '<div class="search-cat"></div><div class="search-title"></div><div class="search-snip"></div>';
      item.querySelector(".search-cat").textContent = r.cat;
      item.querySelector(".search-title").textContent = r.title;
      item.querySelector(".search-snip").textContent = snippet(r.text, q);
      item.addEventListener("click", r.go);
      out.appendChild(item);
    });
  }
  $("#searchInput").addEventListener("input", runSearch);

  function goPrayer(ref) {
    closeSearch();
    $("#prayers").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      const el = $('#prayerList .prayer-item[data-key="' + favKey(ref) + '"]');
      if (!el) return;
      if (!el.classList.contains("open")) el.querySelector(".prayer-head").click();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 2000);
    }, 400);
  }
  function goCard(sel, i) {
    closeSearch();
    const el = $$(sel)[i];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2000);
  }
  function goKnowledge(ti, title) {
    closeSearch();
    activeTab = ti;
    renderKnowledge();
    $("#knowledge").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => {
      const card = Array.from($$("#knowledgePanel .k-card h4")).find((h) => h.textContent === title);
      if (card) {
        const el = card.closest(".k-card");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("flash");
        setTimeout(() => el.classList.remove("flash"), 2000);
      }
    }, 400);
  }

  /* ---------- interactive rosary ---------- */

  const RO_DEFAULT_BY_DAY = [3, 0, 2, 3, 1, 2, 0]; // Sun..Sat -> set index
  const ROSARY_STEPS = (() => {
    const s = [{ k: "sign" }, { k: "our" }, { k: "hail3", n: 1 }, { k: "hail3", n: 2 }, { k: "hail3", n: 3 }, { k: "glory" }];
    for (let d = 0; d < 5; d++) {
      s.push({ k: "announce", d });
      for (let n = 1; n <= 10; n++) s.push({ k: "hail", d, n });
      s.push({ k: "fatima", d });
    }
    s.push({ k: "final" });
    return s;
  })();

  let roState;
  try { roState = JSON.parse(localStorage.getItem("sf-rosary")); } catch (e) { roState = null; }
  if (!roState || typeof roState.idx !== "number" || typeof roState.set !== "number") {
    roState = { set: RO_DEFAULT_BY_DAY[new Date().getDay()], idx: 0 };
  }
  roState.idx = Math.min(Math.max(roState.idx, 0), ROSARY_STEPS.length - 1);
  roState.set = Math.min(Math.max(roState.set, 0), 3);
  function roSave() { localStorage.setItem("sf-rosary", JSON.stringify(roState)); }

  function beadClass(st) {
    if (st.k === "sign") return "ro-cross";
    if (st.k === "our" || st.k === "announce") return "ro-large";
    if (st.k === "glory" || st.k === "fatima") return "ro-chain";
    if (st.k === "final") return "ro-medal";
    return "";
  }

  function renderRosaryPanel() {
    const st = ROSARY_STEPS[roState.idx];
    const u = t().ui;
    const R = t().rosary;
    const P = t().prayers;
    const set = R.sets[roState.set];
    let title = "", mystery = "", body = "";
    switch (st.k) {
      case "sign":
        title = u.ro_sign;
        body = P[5].text;
        break;
      case "our":
        title = P[0].name;
        body = P[0].text;
        break;
      case "hail3":
        title = P[1].name + " (" + st.n + "/3) — " + u.ro_intent3;
        body = P[1].text;
        break;
      case "glory":
        // on the single bead: Glory Be + the Fatima prayer, before announcing the first mystery
        title = u.ro_fatima;
        body = P[2].text + "\n\n" + R.fatima;
        break;
      case "announce":
        title = u.ro_mystery + " " + (st.d + 1) + ": " + set.m[st.d];
        mystery = set.name + " · " + P[0].name;
        body = P[0].text;
        break;
      case "hail":
        title = P[1].name + " (" + st.n + "/10)";
        mystery = u.ro_decade + " " + (st.d + 1) + " — " + set.m[st.d];
        body = P[1].text;
        break;
      case "fatima":
        title = u.ro_fatima;
        mystery = u.ro_decade + " " + (st.d + 1) + " — " + set.m[st.d];
        body = P[2].text + "\n\n" + R.fatima;
        break;
      case "final":
        title = u.ro_final + " — " + P[8].name;
        body = P[8].text + "\n\n" + u.ro_done;
        break;
    }
    $("#rosaryStage").textContent = title;
    $("#rosaryMystery").textContent = mystery;
    $("#rosaryText").textContent = body;
    $("#rosaryPrev").disabled = roState.idx === 0;
    $("#rosaryNext").disabled = roState.idx === ROSARY_STEPS.length - 1;
  }

  function renderRosary() {
    const setsEl = $("#rosarySets");
    setsEl.innerHTML = "";
    t().rosary.sets.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ro-set" + (i === roState.set ? " active" : "");
      b.innerHTML = "<span></span><small></small>";
      b.querySelector("span").textContent = s.name;
      b.querySelector("small").textContent = s.days;
      b.addEventListener("click", () => {
        if (roState.set !== i) { roState.set = i; roState.idx = 0; roSave(); renderRosary(); }
      });
      setsEl.appendChild(b);
    });
    const wrap = $("#rosaryBeads");
    wrap.innerHTML = "";
    ROSARY_STEPS.forEach((st, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = ("ro-bead " + beadClass(st)).trim();
      if (i < roState.idx) b.classList.add("done");
      if (i === roState.idx) b.classList.add("current");
      if (st.k === "sign") b.textContent = "✝";
      b.addEventListener("click", () => { roState.idx = i; roSave(); renderRosary(); });
      wrap.appendChild(b);
    });
    renderRosaryPanel();
  }

  $("#rosaryNext").addEventListener("click", () => {
    if (roState.idx < ROSARY_STEPS.length - 1) { roState.idx++; roSave(); renderRosary(); }
  });
  $("#rosaryPrev").addEventListener("click", () => {
    if (roState.idx > 0) { roState.idx--; roSave(); renderRosary(); }
  });
  $("#rosaryReset").addEventListener("click", () => { roState.idx = 0; roSave(); renderRosary(); });

  /* ---------- interactive Divine Mercy chaplet ---------- */

  const CHAPLET_STEPS = (() => {
    const s = [{ k: "sign" }, { k: "our" }, { k: "hail" }, { k: "creed" }];
    for (let d = 0; d < 5; d++) {
      s.push({ k: "eternal", d });
      for (let n = 1; n <= 10; n++) s.push({ k: "mercy", d, n });
    }
    for (let n = 1; n <= 3; n++) s.push({ k: "holy", n });
    s.push({ k: "blood" });
    return s;
  })();

  let chState;
  try { chState = JSON.parse(localStorage.getItem("sf-chaplet")); } catch (e) { chState = null; }
  if (!chState || typeof chState.idx !== "number") chState = { idx: 0 };
  chState.idx = Math.min(Math.max(chState.idx, 0), CHAPLET_STEPS.length - 1);
  function chSave() { localStorage.setItem("sf-chaplet", JSON.stringify(chState)); }

  function chapletBeadClass(st) {
    if (st.k === "sign") return "ro-cross";
    if (st.k === "eternal") return "ro-large";
    if (st.k === "holy") return "ro-chain";
    if (st.k === "blood") return "ro-medal";
    return "";
  }

  function renderChapletPanel() {
    const st = CHAPLET_STEPS[chState.idx];
    const u = t().ui;
    const C = t().chaplet;
    const P = t().prayers;
    let title = "", mystery = "", body = "";
    switch (st.k) {
      case "sign":
        title = u.ch_sign;
        body = C.sign;
        break;
      case "our":
        title = P[0].name;
        body = P[0].text;
        break;
      case "hail":
        title = P[1].name;
        body = P[1].text;
        break;
      case "creed":
        title = P[5].name;
        body = P[5].text;
        break;
      case "eternal":
        title = u.ch_eternal;
        mystery = u.ro_decade + " " + (st.d + 1);
        body = C.eternal;
        break;
      case "mercy":
        title = u.ch_mercy + " (" + st.n + "/10)";
        mystery = u.ro_decade + " " + (st.d + 1);
        body = C.mercy;
        break;
      case "holy":
        title = u.ch_holy + " (" + st.n + "/3)";
        body = C.holy;
        break;
      case "blood":
        title = u.ro_final;
        body = C.blood + "\n\n" + u.ch_done;
        break;
    }
    $("#chapletStage").textContent = title;
    $("#chapletMystery").textContent = mystery;
    $("#chapletText").textContent = body;
    $("#chapletPrev").disabled = chState.idx === 0;
    $("#chapletNext").disabled = chState.idx === CHAPLET_STEPS.length - 1;
  }

  function renderChaplet() {
    const wrap = $("#chapletBeads");
    wrap.innerHTML = "";
    CHAPLET_STEPS.forEach((st, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = ("ro-bead " + chapletBeadClass(st)).trim();
      if (i < chState.idx) b.classList.add("done");
      if (i === chState.idx) b.classList.add("current");
      if (st.k === "sign") b.textContent = "✝";
      b.addEventListener("click", () => { chState.idx = i; chSave(); renderChaplet(); });
      wrap.appendChild(b);
    });
    renderChapletPanel();
  }

  $("#chapletNext").addEventListener("click", () => {
    if (chState.idx < CHAPLET_STEPS.length - 1) { chState.idx++; chSave(); renderChaplet(); }
  });
  $("#chapletPrev").addEventListener("click", () => {
    if (chState.idx > 0) { chState.idx--; chSave(); renderChaplet(); }
  });
  $("#chapletReset").addEventListener("click", () => { chState.idx = 0; chSave(); renderChaplet(); });

  /* ---------- prayer reminders ---------- */

  const REMINDERS = [
    { key: "angelus", time: "12:00", pIdx: 9 },
    { key: "chaplet", time: "15:00", pIdx: 7 },
  ];
  let remState;
  try { remState = JSON.parse(localStorage.getItem("sf-reminders")) || {}; } catch (e) { remState = {}; }
  function remSave() { localStorage.setItem("sf-reminders", JSON.stringify(remState)); }

  function ensureNotifyPermission() {
    if (!("Notification" in window)) return Promise.resolve(false);
    if (Notification.permission === "granted") return Promise.resolve(true);
    if (Notification.permission === "denied") return Promise.resolve(false);
    return Notification.requestPermission().then((p) => p === "granted");
  }

  function renderReminders() {
    const box = $("#remList");
    box.innerHTML = "";
    REMINDERS.forEach((r) => {
      const row = document.createElement("div");
      row.className = "rem-row";
      row.innerHTML = '<span class="rem-label"></span><label class="switch"><input type="checkbox"><span class="track"></span></label>';
      row.querySelector(".rem-label").textContent = I18N[lang].prayers[r.pIdx].name + " — " + r.time;
      const cb = row.querySelector("input");
      cb.checked = !!remState[r.key];
      cb.addEventListener("change", () => {
        if (cb.checked) {
          ensureNotifyPermission().then((ok) => {
            if (!ok) { cb.checked = false; toast(t().ui.rem_denied); return; }
            remState[r.key] = true;
            remSave();
            toast(t().ui.rem_enabled + " · " + r.time);
          });
        } else {
          remState[r.key] = false;
          remSave();
        }
      });
      box.appendChild(row);
    });
  }

  function fireReminder(r) {
    const title = "🔔 " + I18N[lang].prayers[r.pIdx].name;
    const body = t().ui.rem_body;
    if ("Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker.getRegistration()
        .then((reg) => {
          if (reg) reg.showNotification(title, { body: body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" });
          else new Notification(title, { body: body, icon: "icons/icon-192.png" });
        })
        .catch(() => { try { new Notification(title, { body: body }); } catch (e) { /* unsupported */ } });
    }
    toast(title + " · " + body);
  }

  setInterval(() => {
    const now = new Date();
    const hm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    const today = now.toDateString();
    REMINDERS.forEach((r) => {
      if (remState[r.key] && hm === r.time && remState["last_" + r.key] !== today) {
        remState["last_" + r.key] = today;
        remSave();
        fireReminder(r);
      }
    });
  }, 30000);

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
    renderRosary();
    renderChaplet();
    renderReminders();
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

  const yearEl = $("#footerYear");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  spawnParticles();
  renderAll();

  /* ---------- PWA service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => { /* offline mode unavailable */ });
    });
  }
})();
