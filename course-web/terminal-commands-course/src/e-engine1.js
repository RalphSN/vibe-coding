<script>
/* ==========================================================================
   App：狀態、路由、版面
   ========================================================================== */
(() => {
'use strict';

const STORAGE_KEY = 'terminal-course.v1';
const PREFS_KEY = 'terminal-course.prefs.v1';
const READ_CHARS_PER_MIN = 300;
const MINUTES_PER_QUESTION = 0.75;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- localStorage 讀寫：包 try/catch，失敗時退回記憶體 ---------- */
function createStore(key, fallback) {
  const clone = (obj) => JSON.parse(JSON.stringify(obj));
  let state = clone(fallback);
  let isPersistent = true;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) state = Object.assign(clone(fallback), JSON.parse(raw));
  } catch (err) {
    isPersistent = false;
    console.warn(`無法從 localStorage 讀取「${key}」，改用暫存模式：`, err);
  }
  function save() {
    if (!isPersistent) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (err) {
      isPersistent = false;
      console.warn(`無法寫入 localStorage「${key}」，改用暫存模式：`, err);
    }
  }
  return {
    get: () => state,
    persistent: () => isPersistent,
    update(fn) { fn(state); save(); },
    reset() { state = clone(fallback); save(); },
  };
}
const Store = createStore(STORAGE_KEY, { done: {}, visited: {}, quiz: {}, openModules: {} });
const Prefs = createStore(PREFS_KEY, { fontScale: null, sidebarWidth: null, theme: null });

function lessonState(id) {
  const s = Store.get();
  if (s.done[id]) return 'done';
  if (s.visited[id]) return 'visited';
  return 'new';
}
function moduleProgress(mod) {
  const done = mod.lessons.filter((l) => Store.get().done[l.id]).length;
  return { done, total: mod.lessons.length };
}
function overallProgress() {
  const done = LESSONS.filter((l) => Store.get().done[l.id]).length;
  return { done, total: LESSONS.length };
}
const STATE_TEXT = { new: '未讀', visited: '讀到一半', done: '已完成' };

/* ---------- 文字處理：先跳脫，再套用輕量標記 ---------- */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/**
 * 內文標記：**粗體**、==螢光==、`程式碼`、{kbd:按鍵}、[[術語]] 或 [[術語|顯示文字]]、[文字](網址)
 * 內容一律先跳脫，因此資料中的 HTML 不會被執行。
 */
function md(str) {
  let out = esc(str);
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/==([^=]+)==/g, '<mark>$1</mark>');
  out = out.replace(/\{kbd:([^}]+)\}/g, '<kbd>$1</kbd>');
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, key, label) => termButton(key, label));
  out = out.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
  return out;
}
/* 術語按鈕：key 經過 esc() 後才進來，查表時還原 */
function termButton(escapedKey, label) {
  const key = escapedKey.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const term = GLOSSARY[key];
  const text = label || escapedKey;
  if (!term) return `<span class="term-missing" title="術語表沒有這個詞">${text}</span>`;
  return `<button type="button" class="term" data-term="${escapedKey}" aria-expanded="false" aria-controls="term-pop">${text}</button>`;
}

/* ---------- 詞組斷行（line-breaking.md 2.1） ---------- */
const wordSegmenter = (typeof Intl !== 'undefined' && Intl.Segmenter) ? new Intl.Segmenter('zh-Hant', { granularity: 'word' }) : null;
const HAN = /\p{Script=Han}/u;
/* 只包中文詞：英文單字包了 nowrap 反而會在窄容器溢出 */
// 標題裡連續的英文詞（auto mode、GitHub Actions）用不換行空白黏在一起，避免專有名詞被拆成兩行。
// 超過 14 個字元的（managed settings）不黏：手機上比容器還寬時，寧可在空白處換行，也不要從單字中間斷開
const LATIN_RUN = /[A-Za-z0-9.]+(?: [A-Za-z0-9.]+)+/g;
const MAX_GLUED_LATIN = 14;
function wrapWordsHtml(rawText) {
  const text = rawText.replace(LATIN_RUN, (run) => (run.length <= MAX_GLUED_LATIN ? run.replace(/ /g, ' ') : run));
  if (!wordSegmenter) return esc(text);
  return [...wordSegmenter.segment(text)]
    .map(({ segment, isWordLike }) => (isWordLike && HAN.test(segment) ? `<span class="word">${esc(segment)}</span>` : esc(segment)))
    .join('');
}
function renderPhrases(text) {
  const phrases = splitPhrases(text);
  // 空格放在詞組之間（inline-block 外面），才不會被行首行尾吃掉
  return phrases.map((phrase, i) => `${i > 0 && needsSpaceBetween(phrases[i - 1], phrase) ? ' ' : ''}<span class="phrase">${wrapWordsHtml(phrase)}</span>`).join('');
}

/* ---------- 閱讀時間：中文每分鐘 300 字，練習每題另計 ---------- */
function collectText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join('');
  if (typeof value === 'object') {
    return Object.entries(value).filter(([k]) => k !== 'svg' && k !== 'props' && k !== 'why').map(([, v]) => collectText(v)).join('');
  }
  return '';
}
function readingMinutes(lesson) {
  const c = lesson.content;
  if (!c) return null;
  if (c.minutes) return c.minutes;
  const text = collectText({ ...c, practice: null, review: null, sources: null }).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const questions = (c.practice || []).length + (c.review || []).length;
  return Math.max(3, Math.round(text.length / READ_CHARS_PER_MIN + questions * MINUTES_PER_QUESTION));
}

/* ---------- 主題切換：跟隨系統 → 淺色 → 深色 ---------- */
const THEME_ORDER = [null, 'light', 'dark'];
const THEME_LABEL = { null: '跟隨系統', light: '淺色', dark: '深色' };
function applyTheme() {
  const theme = Prefs.get().theme;
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const btn = $('#theme-btn');
  btn.setAttribute('aria-label', `切換深淺色（目前：${THEME_LABEL[theme]}）`);
  btn.title = `目前：${THEME_LABEL[theme]}`;
}
function cycleTheme() {
  Prefs.update((p) => {
    const i = THEME_ORDER.indexOf(p.theme);
    p.theme = THEME_ORDER[(i + 1) % THEME_ORDER.length];
  });
  applyTheme();
  announce(`已切換為${THEME_LABEL[Prefs.get().theme]}`);
}

function announce(msg) {
  const live = $('#live');
  live.textContent = '';
  window.setTimeout(() => { live.textContent = msg; }, 30);
}

/* ---------- 字級：6 段，存在 Prefs，載入時由 <head> 的 script 先套用 ---------- */
const FONT_STEPS = [0.875, 1, 1.125, 1.25, 1.375, 1.5];
function currentFontScale() { return Prefs.get().fontScale || 1; }
function syncTopbarHeight() {
  const height = Math.ceil($('.topbar').getBoundingClientRect().height);
  document.documentElement.style.setProperty('--topbar-h', `${height}px`);
}
const LARGE_TEXT_SCALE = 1.375;
function applyFontScale(scale, shouldAnnounce) {
  document.documentElement.style.setProperty('--font-scale', String(scale));
  document.documentElement.toggleAttribute('data-large-text', scale >= LARGE_TEXT_SCALE);
  const i = FONT_STEPS.indexOf(scale);
  $$('[data-font-pct]').forEach((el) => { el.textContent = `${Math.round(scale * 100)}%`; });
  $$('[data-font="down"]').forEach((b) => { b.disabled = i <= 0; });
  $$('[data-font="up"]').forEach((b) => { b.disabled = i >= FONT_STEPS.length - 1; });
  if (shouldAnnounce) announce(`字級 ${Math.round(scale * 100)}%`);
  Resizer.applyPreferred();
  syncTopbarHeight();
  scheduleFit();
}
function changeFont(action) {
  const i = FONT_STEPS.indexOf(currentFontScale());
  let next = 1;
  if (action === 'up') next = FONT_STEPS[Math.min(FONT_STEPS.length - 1, i + 1)];
  if (action === 'down') next = FONT_STEPS[Math.max(0, i - 1)];
  Prefs.update((p) => { p.fontScale = next === 1 ? null : next; });
  applyFontScale(next, true);
}

/* ---------- 設定選單（手機版字級） ---------- */
const Settings = (() => {
  const btn = $('#settings-btn');
  const menu = $('#settings-menu');
  function set(open) {
    menu.dataset.open = String(open);
    btn.setAttribute('aria-expanded', String(open));
  }
  btn.addEventListener('click', () => set(menu.dataset.open !== 'true'));
  document.addEventListener('click', (e) => { if (!e.target.closest('.settings')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.dataset.open === 'true') { set(false); btn.focus(); }
  });
  return { close: () => set(false) };
})();

/* ---------- 可拖曳寬度的側欄（components.md 第 1 節） ---------- */
const SIDEBAR_WIDTH = { min: 224, max: 480, step: 16, fallback: 288 };
const Resizer = (() => {
  const root = document.documentElement;
  const handle = $('.sidebar-resizer');
  const maxWidth = () => Math.min(SIDEBAR_WIDTH.max, Math.round(window.innerWidth * 0.4));
  function apply(px) {
    const width = Math.round(Math.min(maxWidth(), Math.max(SIDEBAR_WIDTH.min, px)));
    root.style.setProperty('--sidebar-w', `${width}px`);
    handle.setAttribute('aria-valuenow', String(width));
    handle.setAttribute('aria-valuemax', String(maxWidth()));
    return width;
  }
  // 使用者沒拖過把手時，預設寬度跟著字級放大，150% 字級時目錄標題才不會被擠到斷字
  const defaultWidth = () => Math.round(SIDEBAR_WIDTH.fallback * currentFontScale());
  function save(width) { Prefs.update((p) => { p.sidebarWidth = width === defaultWidth() ? null : width; }); }
  handle.addEventListener('pointerdown', (event) => {
    handle.setPointerCapture(event.pointerId);
    root.classList.add('is-resizing');
  });
  handle.addEventListener('pointermove', (event) => {
    if (!handle.hasPointerCapture(event.pointerId)) return;
    // 側欄貼齊視窗左緣，所以指標的 x 座標就是新寬度
    apply(event.clientX);
  });
  handle.addEventListener('lostpointercapture', () => {
    root.classList.remove('is-resizing');
    save(parseInt(handle.getAttribute('aria-valuenow'), 10));
    scheduleFit();
  });
  handle.addEventListener('dblclick', () => { save(apply(defaultWidth())); scheduleFit(); });
  handle.addEventListener('keydown', (event) => {
    const current = parseInt(handle.getAttribute('aria-valuenow'), 10);
    const next = {
      ArrowLeft: current - SIDEBAR_WIDTH.step,
      ArrowRight: current + SIDEBAR_WIDTH.step,
      Home: SIDEBAR_WIDTH.min,
      End: maxWidth(),
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    save(apply(next));
    announce(`目錄寬度 ${handle.getAttribute('aria-valuenow')} 像素`);
    scheduleFit();
  });
  const applyPreferred = () => apply(Prefs.get().sidebarWidth || defaultWidth());
  applyPreferred();
  // 用偏好值重算，而不是目前的值：視窗暫時縮小時被夾到最小值，放大後才回得去
  window.addEventListener('resize', applyPreferred);
  return { apply, applyPreferred };
})();

/* ---------- 孤行處理：動態縮小字級（line-breaking.md 2.5） ---------- */
const FIT = { minScale: 0.8, step: 0.05, shortChars: 2 };
// 首頁 hero 與 section-title 混有貼紙方塊，行高不一，會被誤判成多行，所以不列入
const FIT_TARGETS = '.lesson-head h1, .card-title, .lesson-nav .ttl';
function measureLines(element) {
  const chars = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    for (let i = 0; i < node.length; i += 1) {
      if (!node.data[i].trim()) continue;
      const range = document.createRange();
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const rect = range.getClientRects()[0];
      if (rect) chars.push({ ch: node.data[i], top: rect.top, height: rect.height });
    }
  }
  const lines = [];
  chars.forEach((c) => {
    const last = lines[lines.length - 1];
    if (!last || c.top - last.top > c.height / 2) lines.push({ top: c.top, text: c.ch });
    else last.text += c.ch;
  });
  return lines.map((l) => l.text);
}
// 1–2 個字，或沒有任何文字（只有編號、符號）的行算孤行
const isShortLine = (line) => line.length <= FIT.shortChars || !/\p{L}/u.test(line);
function hasShortLine(element) {
  const lines = measureLines(element);
  return lines.length > 1 && lines.some(isShortLine);
}
function fitShortText(element) {
  if (!element.offsetParent && element.tagName !== 'H1') return;
  let scale = 1;
  element.style.setProperty('--fit', '1');
  while (hasShortLine(element) && scale - FIT.step >= FIT.minScale - 1e-6) {
    scale = Math.round((scale - FIT.step) * 100) / 100;
    element.style.setProperty('--fit', String(scale));
  }
  if (hasShortLine(element)) {
    console.warn('縮到字級下限仍有孤行，請改寫標題或調整 | 斷點：', element.textContent.trim());
  }
}
let fitFrame = 0;
function fitAll() { $$(FIT_TARGETS).forEach(fitShortText); }
function scheduleFit() {
  window.cancelAnimationFrame(fitFrame);
  fitFrame = window.requestAnimationFrame(fitAll);
}

/* ---------- 側邊選單 ---------- */
let currentLessonId = null;

function renderNav() {
  const s = Store.get();
  const overall = overallProgress();
  const html = [`
    <div class="nav-overall">全站進度 ${overall.done} / ${overall.total}
      <span class="progress thin" style="--p:${overall.done / overall.total}"><span></span></span>
    </div>`];
  COURSES.forEach((mod) => {
    const { done, total } = moduleProgress(mod);
    const containsCurrent = mod.lessons.some((l) => l.id === currentLessonId);
    const isOpen = containsCurrent || !!s.openModules[mod.id];
    html.push(`
      <div class="nav-module">
        <button class="nav-module-btn" type="button" aria-expanded="${isOpen}" aria-controls="nav-m${mod.id}" data-module="${mod.id}" style="--chip:var(--m${mod.id})">
          <span class="num">${mod.id}</span>
          <span class="t">${renderPhrases(mod.title)}</span>
          <span class="count">${done}/${total}</span>
          <span class="caret" aria-hidden="true">▸</span>
        </button>
        <div class="collapse" id="nav-m${mod.id}" data-open="${isOpen}"><div class="collapse-inner">
          <ul class="nav-lessons">
          ${mod.lessons.map((l) => {
            const st = lessonState(l.id);
            const current = l.id === currentLessonId ? ' aria-current="page"' : '';
            return `<li><a class="nav-link" href="#/l/${l.id}"${current}>
              <span class="status" data-state="${st}" role="img" aria-label="${STATE_TEXT[st]}"></span>
              <span class="lid">${l.id}</span><span class="ttl">${renderPhrases(l.title)}</span></a></li>`;
          }).join('')}
          </ul>
        </div></div>
      </div>`);
  });
  $('#nav').innerHTML = html.join('');
}

function updateTopProgress() {
  const { done, total } = overallProgress();
  $('#top-progress-fill').parentElement.style.setProperty('--p', done / total);
  $('#top-progress-text').textContent = `${done} / ${total}`;
}

const Drawer = (() => {
  const sidebar = () => $('#sidebar');
  const isDesktop = () => window.matchMedia('(min-width: 1280px)').matches;
  let lastFocus = null;
  function open() {
    if (isDesktop()) return;
    lastFocus = document.activeElement;
    sidebar().classList.add('open');
    $('#scrim').dataset.open = 'true';
    $('.menu-btn').setAttribute('aria-expanded', 'true');
    const current = $('.nav-link[aria-current="page"]', sidebar()) || $('.sidebar-close');
    window.setTimeout(() => current.focus(), 50);
  }
  function close(restoreFocus = true) {
    if (!sidebar().classList.contains('open')) return;
    sidebar().classList.remove('open');
    $('#scrim').dataset.open = 'false';
    $('.menu-btn').setAttribute('aria-expanded', 'false');
    if (restoreFocus && lastFocus) lastFocus.focus();
  }
  function trap(e) {
    if (e.key !== 'Tab' || !sidebar().classList.contains('open')) return;
    const focusables = $$('button, a[href]', sidebar()).filter((el) => el.offsetParent !== null && !el.closest('.collapse[data-open="false"]'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  return { open, close, trap, isOpen: () => sidebar().classList.contains('open') };
})();

/* ---------- 路由 ---------- */
function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'l' && LESSON_BY_ID[parts[1]]) return { name: 'lesson', id: parts[1] };
  if (parts[0] === 'm' && COURSES[Number(parts[1])]) return { name: 'module', id: Number(parts[1]) };
  if (parts[0] === 'styleguide') return { name: 'styleguide' };
  if (parts[0] === 'references') return { name: 'references' };
  if (parts.length === 0) return { name: 'home' };
  return { name: 'notfound', raw: hash };
}

const Views = {};

function render() {
  const route = parseRoute();
  currentLessonId = route.name === 'lesson' ? route.id : null;
  const main = $('#main');
  const view = Views[route.name] || Views.notfound;
  main.innerHTML = view(route);
  $('#toc').innerHTML = route.name === 'lesson' ? renderToc(route.id) : '';
  // 沒有本課目錄的頁面（首頁、模組頁），不保留右側空欄
  $('.layout').classList.toggle('no-toc', !$('#toc').innerHTML.trim());
  if (!prefersReducedMotion()) {
    main.classList.remove('view-enter');
    void main.offsetWidth;
    main.classList.add('view-enter');
  }
  if (route.name === 'lesson') {
    Store.update((s) => { s.visited[route.id] = true; });
    document.title = `${route.id} ${LESSON_BY_ID[route.id].plain}｜${SITE.name}`;
  } else if (route.name === 'module') {
    document.title = `模組 ${route.id} ${plainTitle(COURSES[route.id].title)}｜${SITE.name}`;
  } else {
    document.title = SITE.name;
  }
  renderNav();
  updateTopProgress();
  Drawer.close(false);
  hydrate(main);
  focusHeading(main);
  scheduleFit();
}

function focusHeading(main) {
  const h1 = $('h1', main);
  if (!h1) return;
  h1.setAttribute('tabindex', '-1');
  if (window.scrollY > 0) window.scrollTo(0, 0);
  h1.focus({ preventScroll: true });
}

/* 每次渲染後啟用互動元件（元件區會往 Hydrators 加入函式） */
const Hydrators = [];
function hydrate(root) { Hydrators.forEach((fn) => fn(root)); }

/* ---------- 首頁 ---------- */
Views.home = () => {
  const s = Store.get();
  const overall = overallProgress();
  const resume = LESSONS.find((l) => s.visited[l.id] && !s.done[l.id]) || LESSONS.find((l) => !s.done[l.id]);
  const hereModule = resume ? resume.moduleId : null;
  const started = overall.done > 0 || Object.keys(s.visited).length > 0;
  const resumeBtn = started
    ? `<a class="btn big primary nb-press" href="#/l/${resume ? resume.id : '0-1'}">繼續：${resume ? resume.id : '0-1'}</a>`
    : '<a class="btn big primary nb-press" href="#/l/0-1">從 0-1 開始</a>';
  return `
  <div class="wide">
    <section class="hero hero-grid">
      <div>
      <div class="stickers">
        <span class="label tilt" style="--chip:var(--accent)">${LESSONS.length} 個單元</span>
        <span class="label tilt-r" style="--chip:var(--success)">零基礎可讀</span>
        <span class="label tilt" style="--chip:var(--info)">Windows ＋ macOS</span>
      </div>
      <h1><span class="phrase">看到指令，</span><br><span class="phrase">不再<span class="hl">只會複製貼上</span></span></h1>
      <p class="lead">黑色視窗裡的每一行字，都是由幾個固定的零件組成。這門課從「終端機是什麼」開始，教你拆解任何一行指令、在 PowerShell 和 zsh 之間切換、用 git、npm、Python，一直到 Claude Code、Codex、Antigravity 三個 AI 工具的指令。</p>
      <div class="actions">
        ${resumeBtn}
        <a class="btn big nb-press" href="#/l/1-1">直接學拆解指令</a>
      </div>
      </div>
      ${window.App.renderWidget ? window.App.renderWidget({ name: 'herodemo', props: {} }) : ''}
    </section>

    <h2 class="section-title"><span class="label" style="--chip:var(--primary)">學習地圖</span><span class="phrase">${COURSES.length} 個模組</span></h2>
    <div class="module-grid">
      ${COURSES.map((mod, i) => {
        const { done, total } = moduleProgress(mod);
        const isHere = mod.id === hereModule;
        return `<a class="module-card nb-press drop-in${isHere ? ' is-here' : ''}" href="#/m/${mod.id}" style="--chip:var(--m${mod.id});--i:${Math.min(i, 5)}">
          <span class="top"><span class="big-num">${String(mod.id).padStart(2, '0')}</span>
            ${isHere ? '<span class="label here-tag tilt-r">你在這裡</span>' : ''}</span>
          <h3 class="card-title">${renderPhrases(mod.title)}</h3>
          <p>${esc(mod.desc)}</p>
          <span class="meta"><span class="progress thin" style="--p:${done / total};--fill:var(--m${mod.id})"><span></span></span>${done} / ${total}</span>
        </a>`;
      }).join('')}
    </div>

    <h2 class="section-title"><span class="label" style="--chip:var(--m2)">怎麼用</span><span class="phrase">本站的使用方式</span></h2>
    <div class="content" style="margin:0">
      <ul>
        <li>每個單元的結構都一樣：3 件事 → 暖身回顧 → 比喻 → 心智模型 → 定義 → 範例 → 常見錯誤 → 練習 → 三個重點。</li>
        <li>這門課的主軸：任何一行指令都能拆成<strong>程式、子指令、選項、參數</strong>，再用<strong>連接符號</strong>接起來。全站用同一組顏色標示這五種零件。</li>
        <li>範例預設依 <strong>PowerShell（Windows）→ zsh（macOS）→ bash → cmd</strong> 的順序排列。頁面裡的終端機都是模擬的，不會動到你的電腦。</li>
        <li>練習的答案預設隱藏；選擇題送出後，每個選項都有解析。</li>
        <li>鍵盤：<kbd>←</kbd> <kbd>→</kbd> 切換上一課與下一課，<kbd>/</kbd> 搜尋。頂部列可以調整字級，寬螢幕可以拖曳目錄的右緣調整寬度。</li>
        <li>進度存在這台電腦的瀏覽器裡${Store.persistent() ? '' : '（目前瀏覽器不允許儲存，關閉分頁後進度會消失）'}。</li>
      </ul>
    </div>
  </div>`;
};

/* ---------- 模組頁 ---------- */
Views.module = ({ id }) => {
  const mod = COURSES[id];
  const { done, total } = moduleProgress(mod);
  const minutes = mod.lessons.map(readingMinutes).filter(Boolean).reduce((a, b) => a + b, 0);
  return `
  <div class="content">
    <header class="lesson-head" style="--chip:var(--m${mod.id})">
      <span class="lid-big">模組 ${mod.id}</span>
      <h1>${renderPhrases(mod.title)}</h1>
      <p style="margin-top:var(--sp-4)">${esc(mod.desc)}</p>
      <div class="lesson-meta">
        <span>${mod.lessons.length} 個單元</span>
        ${minutes ? `<span>約 ${minutes} 分鐘</span>` : ''}
        <span class="progress" style="--p:${done / total};--fill:var(--m${mod.id})"><span></span></span>
        <span>已完成 ${done} / ${total}</span>
      </div>
    </header>
    <ol class="goals" style="--chip:var(--m${mod.id})">
      ${mod.lessons.map((l) => {
        const st = lessonState(l.id);
        const min = readingMinutes(l);
        return `<li><a href="#/l/${l.id}" style="flex:1">${l.id}　${renderPhrases(l.title)}</a>
          <span style="font-family:var(--font-ui);font-size:var(--fs-small);white-space:nowrap">${min ? `${min} 分` : ''}</span>
          <span class="status" data-state="${st}" role="img" aria-label="${STATE_TEXT[st]}"></span></li>`;
      }).join('')}
    </ol>
    <nav class="lesson-nav" aria-label="開始本模組"><a class="next nb-press" href="#/l/${mod.lessons[0].id}"><span class="dir">從這裡開始</span><span class="ttl">${renderPhrases(`${mod.lessons[0].id} ${mod.lessons[0].title}`)}</span></a></nav>
  </div>`;
};

/* ---------- 單元頁 ---------- */
const SECTION_DEFS = [
  ['goals', '這課你會學到 3 件事'],
  ['review', '暖身回顧'],
  ['analogy', '比喻'],
  ['model', '心智模型'],
  ['define', '正式定義'],
  ['examples', '範例'],
  ['mistakes', '常見錯誤'],
  ['practice', '練習'],
  ['keypoints', '三個重點'],
];

/* 單元各段的渲染函式由元件區提供；這裡是退回用的簡單版本 */
const Sections = {
  goals: (c) => `<ol class="goals">${c.goals.map((g) => `<li><span class="goal-text">${md(g)}</span></li>`).join('')}</ol>`,
};

function lessonSections(lesson) {
  const c = lesson.content;
  return SECTION_DEFS.filter(([key]) => {
    if (c.layout === 'reference') return false;
    const v = c[key];
    return v != null && (!Array.isArray(v) || v.length > 0);
  });
}

function renderToc(id) {
  const lesson = LESSON_BY_ID[id];
  if (!lesson.content) return '';
  const secs = lesson.content.layout === 'reference'
    ? (lesson.content.blocks || []).filter((b) => b.type === 'heading').map((b) => [b.id, b.text])
    : lessonSections(lesson);
  if (!secs.length) return '';
  return `<span class="label" style="--chip:var(--m${lesson.moduleId})">本課段落</span>
    <ol>${secs.map(([key, label]) => `<li><a href="#/l/${id}" data-scroll="sec-${key}">${esc(label)}</a></li>`).join('')}</ol>`;
}

Views.lesson = ({ id }) => {
  const lesson = LESSON_BY_ID[id];
  const mod = COURSES[lesson.moduleId];
  const pos = LESSONS.indexOf(lesson);
  const prev = LESSONS[pos - 1];
  const next = LESSONS[pos + 1];
  const min = readingMinutes(lesson);
  const modP = moduleProgress(mod);
  const c = lesson.content;
  const isDone = !!Store.get().done[id];

  let body;
  if (!c) {
    body = '<div class="placeholder"><span class="label" style="--chip:var(--warning)">製作中</span><p style="margin-top:var(--sp-3)">這個單元的內容還在製作。</p></div>';
  } else if (c.layout === 'reference') {
    body = (Sections.reference ? Sections.reference(c, lesson) : '');
  } else {
    body = lessonSections(lesson).map(([key, label]) => {
      const fn = Sections[key];
      const inner = fn ? fn(c, lesson) : '';
      return `<section class="lsec" id="sec-${key}" aria-labelledby="h-${key}">
        <h2 id="h-${key}"><span class="label" style="--chip:var(--m${mod.id})">${esc(label)}</span></h2>
        ${inner}
      </section>`;
    }).join('');
  }

  const sources = c && c.sources && Sections.sources ? Sections.sources(c) : '';

  return `
  <article class="content" style="--chip:var(--m${mod.id})">
    <header class="lesson-head">
      <div class="lesson-meta">
        <a class="label" href="#/m/${mod.id}">模組 ${mod.id}・${esc(mod.short)}</a>
        <span class="meta-group">單元 ${lesson.index + 1} / ${mod.lessons.length}</span>
        <span class="meta-group"><span class="progress" style="--p:${(modP.done) / modP.total};--fill:var(--m${mod.id})" role="progressbar" aria-label="本模組進度" aria-valuemin="0" aria-valuemax="${modP.total}" aria-valuenow="${modP.done}"><span></span></span>已完成 ${modP.done} / ${modP.total}</span>
        ${min ? `<span class="meta-group">閱讀約 ${min} 分鐘</span>` : ''}
      </div>
      <span class="lid-big">${lesson.id}</span>
      <h1>${renderPhrases(lesson.title)}</h1>
    </header>
    ${body}
    ${sources}
    ${c ? `<div class="done-row" id="done-row">
      ${isDone
        ? `<span class="stamp">已完成 ✓</span><button class="btn small nb-press" type="button" data-action="undone" data-id="${id}">改回未完成</button>`
        : `<button class="btn big success nb-press" type="button" data-action="done" data-id="${id}">標記為已完成</button><span style="color:var(--ink-muted)">讀完、做完練習後按一下。</span>`}
    </div>` : ''}
    <nav class="lesson-nav" aria-label="上一課與下一課">
      ${prev ? `<a class="prev nb-press" href="#/l/${prev.id}" rel="prev"><span class="dir">← 上一課</span><span class="ttl">${renderPhrases(`${prev.id} ${prev.title}`)}</span></a>` : ''}
      ${next ? `<a class="next nb-press" href="#/l/${next.id}" rel="next"><span class="dir">下一課 →</span><span class="ttl">${renderPhrases(`${next.id} ${next.title}`)}</span></a>` : ''}
    </nav>
  </article>`;
};

Views.notfound = (route) => `
  <div class="content">
    <h1>找不到這個頁面</h1>
    <p>網址「${esc(route.raw || '')}」沒有對應的頁面。</p>
    <a class="btn primary nb-press" href="#/">回到首頁</a>
  </div>`;

/* ---------- 頁尾：更新標示與參考資料列表 ---------- */
function renderFooter() {
  const list = Object.entries(SOURCES)
    .map(([, s]) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
    .join('');
  $('#footer').innerHTML = `
    <span class="label updated-stamp tilt" style="--chip:var(--primary)">內容更新至 ${SITE.updated}</span>
    <p style="margin:0">課程中的指令、旗標與工具名稱，皆於 ${SITE.verifiedOn} 對照官方文件查證。標示「未確認」的項目，請以官方最新文件為準。</p>
    <details class="reveal footer-refs">
      <summary>參考資料列表（${Object.keys(SOURCES).length} 筆）</summary>
      <div class="reveal-body"><ol class="ref-list">${list}</ol></div>
    </details>
    <p style="margin:0"><a href="#/references">參考資料完整頁</a>・<a href="#/styleguide">元件樣式表</a>・<button type="button" class="linklike" data-action="reset">重置學習進度</button></p>`;
}

Views.references = () => `
  <div class="content">
    <header class="lesson-head" style="--chip:var(--neutral)"><span class="lid-big">參考</span><h1>參考資料</h1></header>
    <p>以下來源皆於 ${SITE.verifiedOn} 查證。標示「第三方」的來源只用來說明風險類型。</p>
    <ol>${Object.values(SOURCES).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join('')}</ol>
  </div>`;

/* ---------- 全域事件 ---------- */
function onClick(e) {
  const moduleBtn = e.target.closest('.nav-module-btn');
  if (moduleBtn) {
    const id = moduleBtn.dataset.module;
    const panel = document.getElementById(`nav-m${id}`);
    const willOpen = panel.dataset.open !== 'true';
    panel.dataset.open = String(willOpen);
    moduleBtn.setAttribute('aria-expanded', String(willOpen));
    Store.update((s) => { s.openModules[id] = willOpen; });
    return;
  }
  const fontBtn = e.target.closest('[data-font]');
  if (fontBtn) { changeFont(fontBtn.dataset.font); return; }
  const scrollLink = e.target.closest('[data-scroll]');
  if (scrollLink) {
    e.preventDefault();
    const target = document.getElementById(scrollLink.dataset.scroll);
    if (target) {
      target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      const heading = $('h2', target) || target;
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }
    return;
  }
  const action = e.target.closest('[data-action]');
  if (!action) return;
  const { action: name, id } = action.dataset;
  if (name === 'done') markDone(id, true);
  if (name === 'undone') markDone(id, false);
  if (name === 'reset' && window.confirm('確定要清除所有學習進度與測驗紀錄嗎？字級與目錄寬度不會被清除。')) {
    Store.reset();
    render();
    announce('學習進度已清除');
  }
}

function markDone(id, isDone) {
  Store.update((s) => { if (isDone) s.done[id] = true; else delete s.done[id]; });
  const row = $('#done-row');
  if (row) {
    row.innerHTML = isDone
      ? `<span class="stamp animate">已完成 ✓</span><button class="btn small nb-press" type="button" data-action="undone" data-id="${id}">改回未完成</button>`
      : `<button class="btn big success nb-press" type="button" data-action="done" data-id="${id}">標記為已完成</button><span style="color:var(--ink-muted)">讀完、做完練習後按一下。</span>`;
    const focusTarget = $('button', row);
    if (focusTarget) focusTarget.focus();
  }
  renderNav();
  updateTopProgress();
  announce(isDone ? `${id} 已標記為完成` : `${id} 已改回未完成`);
}

function isTyping(el) {
  return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onKeydown(e) {
  if (e.key === 'Escape' && Drawer.isOpen()) { Drawer.close(); return; }
  Drawer.trap(e);
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || isTyping(document.activeElement)) return;
  if (document.activeElement && document.activeElement.closest('[role="tablist"], .tw-controls, .anat-input, .fs-side, [role="listbox"], [role="separator"], input[type="range"], [role="radiogroup"]')) return;
  const route = parseRoute();
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && route.name === 'lesson') {
    const pos = LESSONS.findIndex((l) => l.id === route.id);
    const target = LESSONS[pos + (e.key === 'ArrowRight' ? 1 : -1)];
    if (target) { e.preventDefault(); window.location.hash = `#/l/${target.id}`; }
  }
}

/* 對外開放給元件區使用 */
window.App = { $, $$, esc, md, Store, Prefs, Sections, Views, Hydrators, announce, render, renderNav, updateTopProgress, prefersReducedMotion, isTyping, readingMinutes, renderPhrases, scheduleFit, fitAll, measureLines, currentLessonId: () => currentLessonId };

document.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
$('.menu-btn').addEventListener('click', () => Drawer.open());
$('.sidebar-close').addEventListener('click', () => Drawer.close());
$('#scrim').addEventListener('click', () => Drawer.close());
$('#theme-btn').addEventListener('click', cycleTheme);
$$('.theme-side-btn').forEach((b) => b.addEventListener('click', cycleTheme));
window.addEventListener('hashchange', render);
// 換課動畫結束就拿掉 class：留著的 transform 會讓 main 變成 fixed 元素的定位基準
$('#main').addEventListener('animationend', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('view-enter'); });

/* 元件區載入後再進行第一次渲染 */
window.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  applyFontScale(currentFontScale(), false);
  renderFooter();
  render();
  new ResizeObserver(scheduleFit).observe($('#main'));
  // 頂部列的實際高度會隨斷點、字級改變，量出來寫回 --topbar-h，讓側欄、把手、捲動定位都貼齊它的底線
  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  new ResizeObserver(syncTopbarHeight).observe($('.topbar'), { box: 'border-box' }); // padding 在不同斷點會變，要看外框高度
  if (document.fonts) document.fonts.ready.then(scheduleFit);
});
})();
</script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.2/highlight.min.js" integrity="sha512-VSPLUv/n1Bmn+4zoxBNwpuFAO3//79I0Aax/qHDx24R47vylPcc9PrHDCqlePwHnh3joiM7/YTQhcXyQAAxvPQ==" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.2/languages/powershell.min.js" integrity="sha512-I2sYcyooqG4MUbNURH1azVlcuwqA4uxCFT9tLOXIhrvwrosPpNrE0Zz0AYdjRaGPacIrJTwnTut5CzB6VNc6Hw==" crossorigin="anonymous" referrerpolicy="no-referrer" defer></script>
<script>
/* ==========================================================================
   共用元件
   ========================================================================== */
(() => {
'use strict';
const { $, $$, esc, md, Store, Sections, Views, Hydrators, announce, prefersReducedMotion, isTyping, renderPhrases } = window.App;

let uidCounter = 0;
const uid = (prefix = 'u') => `${prefix}${++uidCounter}`;
const COPY_TEXT = new Map();
const LANG_ALIAS = { cmd: 'plaintext', bat: 'plaintext', pwsh: 'powershell', text: 'plaintext', prompt: 'plaintext', toml: 'ini', jsonc: 'json', sh: 'bash', zsh: 'bash', shell: 'bash', yml: 'yaml', md: 'markdown', js: 'javascript', ts: 'typescript', ps1: 'powershell', py: 'python' };
const LANG_LABEL = { plaintext: 'TEXT', bash: 'BASH', json: 'JSON', python: 'PYTHON', typescript: 'TYPESCRIPT', javascript: 'JAVASCRIPT', markdown: 'MARKDOWN', yaml: 'YAML', xml: 'XML', ini: 'TOML', powershell: 'POWERSHELL', sql: 'SQL', dockerfile: 'DOCKERFILE' };

/* 單元內容裡定義的術語，自動加進術語表 */
LESSONS.forEach((lesson) => {
  const defs = lesson.content && lesson.content.define;
  if (!defs) return;
  defs.forEach((d) => {
    if (!GLOSSARY[d.term]) GLOSSARY[d.term] = { en: d.en, def: d.def, example: d.example, lesson: lesson.id };
    else if (!GLOSSARY[d.term].lesson) GLOSSARY[d.term].lesson = lesson.id;
  });
});

/* ---------- 區塊渲染 ---------- */
function renderBlocks(blocks) {
  if (blocks == null) return '';
  const list = Array.isArray(blocks) ? blocks : [blocks];
  return list.map(renderBlock).join('');
}

function renderBlock(b) {
  if (typeof b === 'string') return `<p>${md(b)}</p>`;
  switch (b.type) {
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag}>${b.items.map((i) => `<li>${md(i)}</li>`).join('')}</${tag}>`;
    }
    case 'code': return codeBlock(b);
    case 'table': return tableBlock(b);
    case 'callout': return `<div class="callout ${esc(b.variant || 'tip')}"><span class="label">${md(b.title || '')}</span><div class="body blocks">${renderBlocks(b.body)}</div></div>`;
    case 'unverified': return `<div class="callout unverified"><span class="label">截至 2026-10 查證狀態：未確認</span><div class="body blocks">${renderBlocks(b.body)}</div></div>`;
    case 'timely': return `<div class="callout timely"><span class="label">時效提醒</span><div class="body blocks">${renderBlocks(b.body)}</div></div>`;
    case 'legacy': return legacyBlock(b);
    case 'svg': return `<figure class="figure">${b.svg}${b.caption ? `<figcaption>${md(b.caption)}</figcaption>` : ''}</figure>`;
    case 'compare': return compareBlock(b);
    case 'tabs': return tabsBlock(b);
    case 'reveal': return `<details class="reveal"><summary>${esc(b.summary || '展開')}</summary><div class="reveal-body blocks">${renderBlocks(b.body)}</div></details>`;
    case 'quiz': return quizList(b.items, b.key || uid('qz'));
    case 'widget': return renderWidget(b);
    case 'heading': return `<h2 class="ref-h" id="sec-${esc(b.id)}"><span class="label">${esc(b.text)}</span></h2>`;
    case 'tryit': return tryitBlock(b);
    default:
      console.error('未知的區塊類型：', b);
      return '';
  }
}

function codeBlock({ lang = 'text', code, title, label }) {
  const resolved = LANG_ALIAS[lang] || lang;
  const id = uid('code');
  COPY_TEXT.set(id, code);
  return `<div class="code">
    <div class="code-head"><span class="lang">${esc(label || (lang === 'cmd' || lang === 'bat' ? 'CMD' : lang === 'zsh' ? 'ZSH' : LANG_LABEL[resolved] || resolved))}</span><span class="ttl">${esc(title || '')}</span>
      <button type="button" class="btn small nb-press copy-btn" data-copy="${id}" aria-label="複製${title ? ` ${esc(title)}` : '程式碼'}">複製</button></div>
    <pre tabindex="0" aria-label="${esc(title || '程式碼')}"><code class="language-${esc(resolved)}">${esc(code)}</code></pre>
  </div>`;
}

function tableBlock({ head, rows, caption }) {
  return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(caption || '表格')}"><table>
    ${caption ? `<caption>${md(caption)}</caption>` : ''}
    <thead><tr>${head.map((h) => `<th scope="col">${md(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((cell, i) => (i === 0 ? `<th scope="row">${md(cell)}</th>` : `<td>${md(cell)}</td>`)).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

function legacyBlock({ title, rows, note }) {
  return `<div class="callout legacy"><span class="label">${esc(title || '舊做法 → 現在的做法')}</span><div class="body">
    <div class="legacy-grid">${rows.map(([oldWay, newWay]) => `<div class="legacy-row"><div class="old">${md(oldWay)}</div><div class="arrow" aria-hidden="true">→</div><div class="new"><span class="visually-hidden">現在：</span>${md(newWay)}</div></div>`).join('')}</div>
    ${note ? `<p style="margin-top:var(--sp-3)">${md(note)}</p>` : ''}
  </div></div>`;
}

/* ---------- 對照器：prompt、設定檔、指令都適用 ---------- */
const DIFF_RE = /\{\{(\d+):([\s\S]+?)\}\}/g;
function promptHtml(text) { return esc(text).replace(DIFF_RE, '<mark class="diff" data-n="$1">$2</mark>'); }
function promptPlain(text) { return text.replace(DIFF_RE, '$2'); }

function compareSide(kind, label, text, ctx, result, isCode) {
  const id = uid('cmp');
  COPY_TEXT.set(id, promptPlain(text));
  return `<div class="compare-side ${kind}">
    <div class="side-head"><span class="label">${esc(label)}</span>
      <button type="button" class="btn small nb-press copy-btn" data-copy="${id}" aria-label="複製${esc(label)}">複製</button></div>
    <pre class="prompt-text${isCode ? ' is-code' : ''}">${ctx ? `<span class="ctx">${esc(ctx)}</span>` : ''}${promptHtml(text)}</pre>
    ${result ? `<p style="margin:var(--sp-3) 0 0;font-size:var(--fs-small)"><strong>${kind === 'bad' ? '可能的結果' : '得到的結果'}：</strong>${md(result)}</p>` : ''}
  </div>`;
}

function compareBlock(b) {
  return `<div class="compare side-by-side">
    ${b.title ? `<div class="compare-title"><span class="label">${esc(b.kind || '對照')}</span>${md(b.title)}</div>` : ''}
    <div class="compare-grid">
      ${compareSide('bad', b.badLabel || '✗ 壞做法', b.bad, b.badCtx, b.badResult, b.code)}
      ${compareSide('good', b.goodLabel || '✓ 好做法', b.good, b.goodCtx, b.goodResult, b.code)}
    </div>
    ${b.why && b.why.length ? `<div class="why"><strong>差在哪裡</strong><ol>${b.why.map((w, i) => `<li><span class="n">${i + 1}</span><span>${md(w)}</span></li>`).join('')}</ol></div>` : ''}
  </div>`;
}

function tryitBlock(t) {
  return `<div class="tryit"><span class="label">換你補完</span>
    <div class="blocks">${renderBlocks(t.q)}</div>
    ${t.draft ? `<pre class="prompt-text${t.code ? ' is-code' : ''}" style="margin-top:var(--sp-3)">${esc(t.draft).replace(/____/g, '<span class="blank" aria-label="空格">　</span>')}</pre>` : ''}
    <details class="reveal" style="margin-top:var(--sp-4)"><summary>我寫好了，看參考答案</summary><div class="reveal-body blocks">${renderBlocks(t.answer)}</div></details>
  </div>`;
}

/* ---------- 分頁：舊面板淡出後，新面板淡入 ---------- */
function tabsBlock({ tabs, label }) {
  const base = uid('tabs');
  return `<div class="tabs">
    <div class="tablist" role="tablist" aria-label="${esc(label || '分頁')}">
      ${tabs.map((t, i) => `<button type="button" class="tab" role="tab" id="${base}-t${i}" aria-controls="${base}-p${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${esc(t.label)}</button>`).join('')}
    </div>
    ${tabs.map((t, i) => `<div class="tabpanel blocks" role="tabpanel" id="${base}-p${i}" aria-labelledby="${base}-t${i}" tabindex="0" ${i === 0 ? '' : 'hidden'}>${renderBlocks(t.blocks)}</div>`).join('')}
  </div>`;
}
const TAB_LEAVE_MS = 120;
function selectTab(tab) {
  if (tab.getAttribute('aria-selected') === 'true') return;
  const list = tab.closest('[role="tablist"]');
  const tabs = $$('[role="tab"]', list);
  const oldTab = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute('aria-selected', String(selected));
    t.tabIndex = selected ? 0 : -1;
  });
  const newPanel = document.getElementById(tab.getAttribute('aria-controls'));
  const oldPanel = oldTab ? document.getElementById(oldTab.getAttribute('aria-controls')) : null;
  const swap = () => {
    if (oldPanel) { oldPanel.hidden = true; oldPanel.classList.remove('is-leaving'); }
    newPanel.hidden = false;
  };
  if (!oldPanel || prefersReducedMotion()) { swap(); return; }
  oldPanel.classList.add('is-leaving');
  window.setTimeout(swap, TAB_LEAVE_MS);
}
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[role="tab"]');
  if (tab) selectTab(tab);
});
document.addEventListener('keydown', (e) => {
  const tab = e.target.closest && e.target.closest('[role="tab"]');
  if (!tab) return;
  const tabs = $$('[role="tab"]', tab.closest('[role="tablist"]'));
  const i = tabs.indexOf(tab);
  const moves = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
  if (!(e.key in moves)) return;
  e.preventDefault();
  const next = tabs[(moves[e.key] + tabs.length) % tabs.length];
  selectTab(next);
  next.focus();
});

/* ---------- 測驗：每個選項都有解析，選項依 key 固定打亂 ---------- */
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* 同一題每次載入順序一樣，存下來的答案才對得上；不同題順序不同 */
function shuffledOrder(n, key) {
  const order = Array.from({ length: n }, (_, i) => i);
  let seed = hashString(key) || 1;
  for (let i = n - 1; i > 0; i -= 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const j = seed % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function quizList(items, keyBase) {
  return `<div class="quiz-list">${items.map((item, i) => quizItem(item, `${keyBase}:${i}`)).join('')}</div>`;
}

function quizHead(item) {
  const parts = [];
  if (item.level) parts.push(`<span class="label lv" data-lv="${esc(item.level)}">${esc(item.level)}</span>`);
  if (item.from && LESSON_BY_ID[item.from]) parts.push(`<a class="label review-from" href="#/l/${item.from}">回顧 ${esc(item.from)}</a>`);
  return parts.length ? `<div class="quiz-head">${parts.join('')}</div>` : '';
}

function quizItem(item, key) {
  if (item.type === 'mc') {
    QUIZ_REGISTRY.set(key, item);
    const order = shuffledOrder(item.options.length, key);
    return `<form class="quiz" data-quiz="${esc(key)}" novalidate>
      ${quizHead(item)}
      <fieldset><legend>${md(item.q)}</legend>
        <div class="opts">${order.map((oi) => `<label class="opt" data-oi="${oi}"><input type="radio" name="${esc(key)}" value="${oi}"><span>${md(item.options[oi].text)}</span><span class="mark" aria-hidden="true"></span></label>`).join('')}</div>
      </fieldset>
      <div class="quiz-actions"><button type="submit" class="btn primary nb-press">送出答案</button><button type="button" class="btn small nb-press" data-quiz-reset hidden>重做這題</button></div>
      <div class="quiz-feedback" hidden></div>
    </form>`;
  }
  return `<div class="quiz" data-reveal="${esc(key)}">
    ${quizHead(item)}
    <div class="quiz-q blocks">${renderBlocks(item.q)}</div>
    <details class="reveal"><summary>我想好了，看答案</summary><div class="reveal-body blocks">${renderBlocks(item.answer)}</div></details>
  </div>`;
}

const QUIZ_REGISTRY = new Map();
const correctIndex = (item) => item.options.findIndex((o) => o.correct);

function showQuizResult(form, item, choice) {
  const answer = correctIndex(item);
  const isCorrect = choice === answer;
  form.classList.add('answered');
  const displayOrder = $$('.opt', form).map((opt) => Number(opt.dataset.oi));
  $$('.opt', form).forEach((opt) => {
    const oi = Number(opt.dataset.oi);
    const input = $('input', opt);
    input.checked = oi === choice;
    input.disabled = true;
    opt.classList.toggle('is-correct', oi === answer);
    opt.classList.toggle('is-wrong', oi === choice && !isCorrect);
    $('.mark', opt).textContent = oi === answer ? '✓ 正確' : (oi === choice ? '✗ 你的選擇' : '');
  });
  // 選中的解析放最上面，其他依畫面順序
  const explainOrder = [choice, ...displayOrder.filter((oi) => oi !== choice)];
  const items = explainOrder.map((oi) => {
    const o = item.options[oi];
    const tag = oi === answer
      ? '<span class="label" style="--chip:var(--success)">✓ 正確答案</span>'
      : '<span class="label" style="--chip:var(--danger)">✗ 錯誤選項</span>';
    const picked = oi === choice ? '<span class="label" style="--chip:var(--highlight)">你選的</span>' : '';
    return `<li class="${oi === choice ? 'is-picked' : ''}">${tag}${picked}<span class="opt-text">${md(o.text)}</span>${md(o.why || '')}</li>`;
  }).join('');
  const fb = $('.quiz-feedback', form);
  fb.innerHTML = `<p class="verdict">${isCorrect ? '✓ 答對了' : '✗ 答錯了，正確答案已標示'}</p><ol class="explain-list">${items}</ol>`;
  fb.hidden = false;
  $('[type="submit"]', form).hidden = true;
  $('[data-quiz-reset]', form).hidden = false;
  return isCorrect;
}

function resetQuiz(form) {
  form.classList.remove('answered');
  $$('.opt', form).forEach((opt) => {
    const input = $('input', opt);
    input.checked = false; input.disabled = false;
    opt.classList.remove('is-correct', 'is-wrong');
    $('.mark', opt).textContent = '';
  });
  $('.quiz-feedback', form).hidden = true;
  $('[type="submit"]', form).hidden = false;
  $('[data-quiz-reset]', form).hidden = true;
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form.quiz');
  if (!form) return;
  e.preventDefault();
  const key = form.dataset.quiz;
  const item = QUIZ_REGISTRY.get(key);
  const picked = $('input:checked', form);
  const fb = $('.quiz-feedback', form);
  if (!item) { console.error('找不到測驗題目：', key); return; }
  if (!picked) {
    fb.innerHTML = '<p class="verdict">先選一個答案再送出。</p>';
    fb.hidden = false;
    $('input', form).focus();
    return;
  }
  const choice = Number(picked.value);
  const isCorrect = showQuizResult(form, item, choice);
  Store.update((s) => { s.quiz[key] = { choice, correct: isCorrect }; });
  announce(isCorrect ? '答對了' : '答錯了，正確答案已標示');
  fb.setAttribute('tabindex', '-1');
  fb.focus({ preventScroll: false });
});
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-quiz-reset]');
  if (!btn) return;
  const form = btn.closest('form.quiz');
  resetQuiz(form);
  Store.update((s) => { delete s.quiz[form.dataset.quiz]; });
  $('input', form).focus();
});
document.addEventListener('toggle', (e) => {
  const wrap = e.target.closest && e.target.closest('[data-reveal]');
  if (wrap && e.target.open) Store.update((s) => { s.quiz[wrap.dataset.reveal] = { viewed: true }; });
}, true);

Hydrators.push((root) => {
  $$('form.quiz', root).forEach((form) => {
    const saved = Store.get().quiz[form.dataset.quiz];
    const item = QUIZ_REGISTRY.get(form.dataset.quiz);
    if (saved && item && typeof saved.choice === 'number') showQuizResult(form, item, saved.choice);
  });
});

/* ---------- 複製 ---------- */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard API 失敗，改用備援方式：', err);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (err) { console.warn('execCommand 複製失敗：', err); ok = false; }
  ta.remove();
  return ok;
}
const COPY_RESET_MS = 1500;
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const text = COPY_TEXT.get(btn.dataset.copy) ?? (btn.dataset.copyText || '');
  const ok = await copyText(text);
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = ok ? '已複製 ✓' : '請按 Ctrl/Cmd + C';
  btn.classList.toggle('copied', ok);
  if (!ok) {
    const pre = btn.closest('.code, .compare-side');
    const target = pre && $('pre', pre);
    if (target) window.getSelection().selectAllChildren(target);
  }
  announce(ok ? '已複製到剪貼簿' : '複製失敗，已選取文字，請按 Ctrl 或 Cmd 加 C');
  window.clearTimeout(Number(btn.dataset.timer));
  btn.dataset.timer = String(window.setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, COPY_RESET_MS));
});

/* ---------- 語法高亮 ---------- */
function highlightIn(root) {
  if (!window.hljs) return;
  $$('pre code[class*="language-"]', root).forEach((el) => {
    if (el.dataset.highlighted) return;
    try { window.hljs.highlightElement(el); } catch (err) { console.warn('語法高亮失敗：', err); }
  });
}
Hydrators.push(highlightIn);
window.addEventListener('load', () => highlightIn(document));

/* ---------- 術語 popup（WCAG 1.4.13：可 hover、可關閉、持續） ---------- */
const TermPop = (() => {
  const SHOW_DELAY_MS = 150;
  const HIDE_GRACE_MS = 100;
  const GAP = 10;
  const EDGE = 16;
  const el = document.createElement('div');
  el.className = 'term-pop';
  el.id = 'term-pop';
  el.dataset.open = 'false';
  let anchor = null;
  let pinned = false;
  let showTimer = 0;
  let hideTimer = 0;

  function content(key, term) {
    const current = window.App.currentLessonId();
    const link = term.lesson && term.lesson !== current
      ? `<a class="tt-link" href="#/l/${esc(term.lesson)}">在 ${esc(term.lesson)} 學到 →</a>` : '';
    return { html: `<span class="tt-term">${esc(key)}</span>${term.en ? `<span class="tt-en">${esc(term.en)}</span>` : ''}<span class="tt-def">${md(term.def)}</span>${term.example ? `<span class="tt-ex"><strong>例子：</strong>${md(term.example)}</span>` : ''}${link}`, hasLink: !!link };
  }
  function show(btn, pin = false) {
    window.clearTimeout(hideTimer);
    const key = btn.dataset.term.replace(/&amp;/g, '&');
    const term = GLOSSARY[key];
    if (!term) return;
    if (anchor && anchor !== btn) release(anchor);
    anchor = btn;
    pinned = pin;
    const { html, hasLink } = content(key, term);
    el.innerHTML = html;
    // 有連結時是非模態 popover，要能 Tab 進去；沒有連結時是 tooltip
    if (hasLink) { el.setAttribute('role', 'group'); el.setAttribute('aria-label', `${key} 的說明`); btn.removeAttribute('aria-describedby'); }
    else { el.setAttribute('role', 'tooltip'); el.removeAttribute('aria-label'); btn.setAttribute('aria-describedby', el.id); }
    if (el.previousElementSibling !== btn) btn.after(el);
    btn.setAttribute('aria-expanded', 'true');
    position(btn);
    el.dataset.open = 'true';
  }
  function release(btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-describedby');
  }
  function hide() {
    window.clearTimeout(showTimer);
    if (!anchor) return;
    release(anchor);
    anchor = null; pinned = false;
    el.dataset.open = 'false';
  }
  function scheduleHide() {
    window.clearTimeout(showTimer);
    if (pinned) return;
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hide, HIDE_GRACE_MS);
  }
  function position(btn) {
    const r = btn.getClientRects()[0] || btn.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(EDGE, Math.min(Math.max(EDGE, r.left), window.innerWidth - w - EDGE));
    let top = r.bottom + GAP;
    if (top + h > window.innerHeight - EDGE) top = r.top - h - GAP;
    top = Math.max(EDGE, top);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    // popup 插在術語旁邊（讓 Tab 能進到裡面的連結）；祖先若有 transform（例如換課動畫），
    // fixed 會改以那個祖先為基準，所以量一次實際位置，把差距補回來
    const actual = el.getBoundingClientRect();
    if (Math.abs(actual.left - left) > 1 || Math.abs(actual.top - top) > 1) {
      el.style.left = `${left * 2 - actual.left}px`;
      el.style.top = `${top * 2 - actual.top}px`;
    }
  }

  document.addEventListener('mouseover', (e) => {
    if (e.target.closest('.term-pop')) { window.clearTimeout(hideTimer); return; }
    const b = e.target.closest('.term');
    if (!b || pinned) return;
    window.clearTimeout(hideTimer);
    window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => show(b), anchor ? 0 : SHOW_DELAY_MS);
  });
  document.addEventListener('mouseout', (e) => {
    const from = e.target.closest('.term, .term-pop');
    if (!from) return;
    const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.term, .term-pop');
    if (to === anchor || to === el) return;
    scheduleHide();
  });
  document.addEventListener('focusin', (e) => {
    if (e.target.closest('.term-pop')) { window.clearTimeout(hideTimer); return; }
    const b = e.target.closest('.term');
    if (b) show(b, pinned && anchor === b);
    else if (anchor && !pinned) hide();
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('.term-pop')) return;
    const b = e.target.closest('.term');
    if (b) { if (anchor === b && pinned) hide(); else show(b, true); return; }
    if (anchor) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && anchor) { const a = anchor; hide(); a.focus(); }
  });
  window.addEventListener('scroll', () => { if (anchor) position(anchor); }, { passive: true });
  window.addEventListener('resize', () => { if (anchor) position(anchor); });
  window.addEventListener('hashchange', hide);
  return { show, hide };
})();

/* ---------- 搜尋 ---------- */
(() => {
  $('#search-slot').outerHTML = `
    <div class="search" role="search">
      <label for="site-search" class="visually-hidden">搜尋課程標題與術語</label>
      <svg class="ico" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M11.5 11.5L16 16" stroke="currentColor" stroke-width="2.5"/></svg>
      <input id="site-search" type="search" placeholder="搜尋" autocomplete="off" spellcheck="false"
        role="combobox" aria-expanded="false" aria-controls="search-results" aria-autocomplete="list">
      <kbd class="hint" aria-hidden="true">/</kbd>
      <div id="search-results" class="search-results" role="listbox" aria-label="搜尋結果" data-open="false"></div>
    </div>`;
  const input = $('#site-search');
  const box = $('#search-results');
  const MAX_RESULTS = 12;
  const SUB_MAX = 70;
  let results = [];
  let active = -1;

  const norm = (s) => String(s || '').toLowerCase();
  function buildIndex() {
    const items = LESSONS.map((l) => ({
      kind: '課程', title: `${l.id} ${l.plain}`, sub: plainTitle(COURSES[l.moduleId].title),
      hay: norm(`${l.id} ${l.plain} ${plainTitle(COURSES[l.moduleId].title)}`), href: `#/l/${l.id}`,
    }));
    Object.entries(GLOSSARY).forEach(([key, t]) => items.push({
      kind: '術語', title: `${key}${t.en ? `（${t.en}）` : ''}`, sub: t.def.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, k, l) => l || k).replace(/[`*=]/g, ''),
      hay: norm(`${key} ${t.en} ${t.def}`), href: t.lesson ? `#/l/${t.lesson}` : null,
    }));
    return items;
  }
  let INDEX = null;

  function run() {
    INDEX = INDEX || buildIndex();
    const q = norm(input.value.trim());
    if (!q) { close(); return; }
    const words = q.split(/\s+/);
    results = INDEX.filter((it) => words.every((w) => it.hay.includes(w)))
      .sort((a, b) => Number(!norm(a.title).includes(words[0])) - Number(!norm(b.title).includes(words[0])))
      .slice(0, MAX_RESULTS);
    active = results.length ? 0 : -1;
    draw();
  }
  function draw() {
    box.innerHTML = results.length
      ? results.map((r, i) => `<div role="option" id="sr-${i}" aria-selected="${i === active}" data-i="${i}">
          <span class="label" style="--chip:${r.kind === '課程' ? 'var(--info)' : 'var(--accent)'};font-size:.7rem;padding:0 4px">${r.kind}</span>
          ${esc(r.title)}<small>${esc(r.sub.length > SUB_MAX ? `${r.sub.slice(0, SUB_MAX)}…` : r.sub)}</small></div>`).join('')
      : '<div class="empty">找不到符合的課程或術語。</div>';
    box.dataset.open = 'true';
    input.setAttribute('aria-expanded', 'true');
    if (active >= 0) input.setAttribute('aria-activedescendant', `sr-${active}`);
    else input.removeAttribute('aria-activedescendant');
    const act = $(`#sr-${active}`, box);
    if (act) act.scrollIntoView({ block: 'nearest' });
  }
  function close() {
    box.dataset.open = 'false';
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function go(i) {
    const r = results[i];
    if (!r) return;
    if (r.href) {
      window.location.hash = r.href.slice(1);
      input.value = '';
      close();
    } else {
      announce(`${r.title}：${r.sub}`);
    }
  }
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim()) run(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; draw(); }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); go(active); }
    else if (e.key === 'Escape') { e.stopPropagation(); if (box.dataset.open === 'true') close(); else input.blur(); }
  });
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => { const opt = e.target.closest('[role="option"]'); if (opt) go(Number(opt.dataset.i)); });
  input.addEventListener('blur', () => window.setTimeout(close, 100));
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !isTyping(document.activeElement) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });
})();

/* ---------- 互動元件（widget） ---------- */
const Widgets = {};
const WIDGET_PROPS = new Map();
function renderWidget(b) {
  const w = Widgets[b.name];
  if (!w) {
    console.error('找不到互動元件：', b.name);
    return `<div class="placeholder"><span class="label" style="--chip:var(--warning)">互動元件製作中</span><p style="margin-top:var(--sp-3)">${esc(b.name)}</p></div>`;
  }
  const id = uid('w');
  WIDGET_PROPS.set(id, b.props || {});
  return `<div class="widget" data-widget="${esc(b.name)}" data-wid="${id}">${w.render(b.props || {}, id)}</div>`;
}
Hydrators.push((root) => {
  $$('[data-widget]', root).forEach((el) => {
    const w = Widgets[el.dataset.widget];
    if (w && w.hydrate && !el.dataset.ready) {
      el.dataset.ready = '1';
      w.hydrate(el, WIDGET_PROPS.get(el.dataset.wid) || {});
    }
  });
});

/* 檢查清單 */
Widgets.checklist = {
  render(props) {
    return `<ul class="checklist">${props.items.map((it, i) => `<li><label><input type="checkbox" data-ck="${esc(props.key)}:${i}"><span>${md(it)}</span></label></li>`).join('')}</ul>
      <p style="margin-top:var(--sp-3);font-size:var(--fs-small)" data-ck-count aria-live="polite"></p>`;
  },
  hydrate(el) {
    const boxes = $$('[data-ck]', el);
    const count = () => { $('[data-ck-count]', el).textContent = `已勾選 ${boxes.filter((b) => b.checked).length} / ${boxes.length}`; };
    boxes.forEach((b) => { b.checked = !!Store.get().quiz[`check:${b.dataset.ck}`]; });
    count();
    el.addEventListener('change', (e) => {
      const k = e.target.dataset.ck;
      if (!k) return;
      Store.update((s) => { if (e.target.checked) s.quiz[`check:${k}`] = true; else delete s.quiz[`check:${k}`]; });
      count();
    });
  },
};

