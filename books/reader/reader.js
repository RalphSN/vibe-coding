/*
  共用翻頁閱讀器。書的頁面先設定 window.BOOK，再載入這支程式與 toc.js；每回的內文在 text/NNN.js，翻到才載入。
  用 <script> 載入資料而不是 fetch，直接雙擊開檔（file://）也能讀。
  分頁：每回內文排成固定欄寬的多欄文字流，每一頁都是看向同一條文字流的窗口（平移 i 欄）。
*/
(() => {
  const BOOK = window.BOOK;
  const THEME_KEY = 'vibe-coding-home.theme.v1'; // 和書櫃首頁共用，全站同一個配色選擇
  const FONT_SIZES = [16, 17, 19, 21, 23, 26];
  const DEFAULT_FONT_INDEX = 2;
  const SPREAD_MIN_WIDTH = 768;
  const PAGE_RATIO = 0.7; // 頁寬 / 頁高
  const MAX_PAGE_W = 560;
  const FLIP_MS = 680;
  const OPEN_MS = 1150;
  const OPEN_DELAY_MS = 500;
  const SWIPE_MIN = 40;
  const FONT_WAIT_MS = 3000;
  const RESIZE_DEBOUNCE_MS = 150;
  const LINE_HEIGHT = 1.95; // 和 reader.css 的 .flow 用同一個值，由這裡寫進 --reader-lh
  const LETTER_SPACING_EM = 0.04; // 同上，寫進 --reader-ls
  const GRID_SLACK_PX = 1; // 剛好等於整數倍時，小數誤差可能讓最後一個字或最後一行被擠掉，留 1px
  const MAX_QUEUED_FLIPS = 5; // 連點時最多累積幾頁，避免一口氣翻太遠
  const FRONT = 0; // 第 0 回是卷首（書名頁＋說明頁）

  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const bookEl = $('#book');
  const pageL = $('#page-left');
  const pageR = $('#page-right');
  const leaf = $('#leaf');
  const leafFront = leaf.querySelector('.front');
  const leafBack = leaf.querySelector('.back');
  const measure = $('#measure');
  const range = $('#page-range');
  const statusEl = $('#status');
  const live = $('#live');
  const srText = $('#sr-text');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const chapters = new Map(); // n → { title, html }
  const pending = new Map(); // n → resolve
  const counts = new Map(); // n → 目前版面下的頁數
  let toc = null;
  let tocReady;
  const tocPromise = new Promise((resolve) => { tocReady = resolve; });
  let layout = null;
  let cur = { ch: FRONT, page: 0 };
  let busy = false;
  let queued = 0;
  let needsRepaginate = false;
  let fontIndex = DEFAULT_FONT_INDEX;
  // 讀到最遠的位置：跳去卷首或翻目錄之後，用「回到閱讀進度」回來
  let furthest = { ch: FRONT, ratio: 0 };

  /* ---------- 資料 ---------- */
  window.BookData = {
    toc(list) { toc = list; tocReady(list); },
    chapter(c) {
      chapters.set(c.n, { title: c.title, html: chapterHtml(c) });
      const resolve = pending.get(c.n);
      if (resolve) { pending.delete(c.n); resolve(); }
    },
  };

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  /** 註腳標記在資料裡是 \u0003N\u0004，轉成上標 */
  function inlineHtml(text) {
    return escapeHtml(text).replace(/\u0003(\d+)\u0004/g, '<sup>$1</sup>');
  }

  function chapterHtml(c) {
    const [no, ...couplet] = c.title.split('　').filter(Boolean);
    const body = c.blocks.map((b) => {
      if (b.t === 'poem') return `<p class="poem">${inlineHtml(b.x)}</p>`;
      // 批語裡的詩（多行）和正文的詩一樣排：不縮排、上下留間距
      if (b.t === 'comment') return `<p class="comment${b.x.includes('\n') ? ' poem' : ''}">${inlineHtml(b.x)}</p>`;
      return `<p>${inlineHtml(b.x)}</p>`;
    }).join('');
    const notes = c.notes.length
      ? `<section class="notes"><h3>註釋</h3><ol>${c.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol></section>`
      : '';
    const end = c.n === BOOK.chapterCount ? '全書完' : `${no}終`;
    return `<header class="chapter-head"><span class="no">${escapeHtml(no)}</span><span class="couplet">${couplet.map(escapeHtml).join('<br>')}</span></header>${body}<p class="chapter-end">${end}</p>${notes}`;
  }

  function frontHtml() {
    return `
      <section class="front front-title">
        <span class="big">${escapeHtml(BOOK.title)}</span>
        <span class="seal">${escapeHtml(BOOK.seal)}</span>
        <span class="by">${BOOK.authorLines.map(escapeHtml).join('<br>')}</span>
      </section>
      <section class="front front-info">
        <h3>版本</h3>
        <p>${escapeHtml(BOOK.edition)}</p>
        <h3>出處</h3>
        <p><a href="${escapeHtml(BOOK.source.url)}" target="_blank" rel="noopener">${escapeHtml(BOOK.source.label)}</a>。${escapeHtml(BOOK.license)}</p>
        <h3>翻頁</h3>
        <p>點書頁左右兩側、左右滑動，或按 <kbd>←</kbd> <kbd>→</kbd>。左上角的選單有全書 ${BOOK.chapterCount} 回目錄。</p>
      </section>`;
  }
  chapters.set(FRONT, { title: '卷首', html: frontHtml() });

  function loadChapter(n) {
    if (chapters.has(n)) return Promise.resolve();
    if (!pending.has(n)) {
      const promise = new Promise((resolve, reject) => {
        pending.set(n, resolve);
        const script = document.createElement('script');
        script.src = `${BOOK.textPath}${String(n).padStart(3, '0')}.js`;
        script.onerror = () => { pending.delete(n); reject(new Error(`載入第 ${n} 回失敗：${script.src}`)); };
        document.head.append(script);
      });
      pending.set(`p${n}`, promise);
    }
    return pending.get(`p${n}`);
  }

  /* ---------- 版面與分頁 ---------- */
  function computeLayout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const isSpread = W >= SPREAD_MIN_WIDTH;
    const margin = isSpread ? 28 : 12;
    let pageW;
    let pageH;
    if (isSpread) {
      pageH = H - margin * 2;
      pageW = Math.min((W - margin * 2) / 2, pageH * PAGE_RATIO, MAX_PAGE_W);
      pageH = Math.min(pageH, pageW / PAGE_RATIO + 40);
    } else {
      pageW = W - margin * 2;
      pageH = H - margin * 2;
    }
    pageW = Math.floor(pageW);
    pageH = Math.floor(pageH);
    const size = FONT_SIZES[fontIndex];
    const basePadX = Math.round(Math.min(56, Math.max(20, pageW * 0.09)));
    const basePadY = Math.round(Math.min(60, Math.max(34, pageH * 0.075)));
    // 欄寬取「字寬＋字距」的整數倍：每行剛好排滿整數個字，左右對齊時字距不會被撐開
    const charAdvance = size * (1 + LETTER_SPACING_EM);
    const colW = Math.floor((pageW - basePadX * 2) / charAdvance) * charAdvance + GRID_SLACK_PX;
    // 文字區高度取行高的整數倍：最後一行剛好貼齊底部，多出的空間平均分到上下
    const lineH = size * LINE_HEIGHT;
    const textH = Math.floor((pageH - basePadY * 2) / lineH) * lineH + GRID_SLACK_PX;
    const padX = (pageW - colW) / 2;
    const padY = (pageH - textH) / 2;
    const gap = padX * 2;
    return { isSpread, pageW, pageH, padX, padY, colW, gap, step: colW + gap, size };
  }

  function applyLayout() {
    layout = computeLayout();
    const s = document.documentElement.style;
    s.setProperty('--page-w', `${layout.pageW}px`);
    s.setProperty('--page-h', `${layout.pageH}px`);
    s.setProperty('--book-w', `${layout.isSpread ? layout.pageW * 2 : layout.pageW}px`);
    s.setProperty('--pad-x', `${layout.padX}px`);
    s.setProperty('--pad-y', `${layout.padY}px`);
    s.setProperty('--col-w', `${layout.colW}px`);
    s.setProperty('--col-gap', `${layout.gap}px`);
    s.setProperty('--reader-size', `${layout.size}px`);
    s.setProperty('--reader-lh', String(LINE_HEIGHT));
    s.setProperty('--reader-ls', `${LETTER_SPACING_EM}em`);
    bookEl.classList.toggle('single', !layout.isSpread);
    counts.clear();
    document.querySelectorAll('.page[data-key]').forEach((el) => { delete el.dataset.key; });
  }

  function pageCount(n) {
    if (!chapters.has(n)) return 0;
    if (!counts.has(n)) {
      const flow = measure.querySelector('.flow');
      flow.innerHTML = chapters.get(n).html;
      const total = Math.max(1, Math.round((flow.scrollWidth + layout.gap) / layout.step));
      counts.set(n, total);
      flow.innerHTML = '';
    }
    return counts.get(n);
  }

  const span = () => (layout.isSpread ? 2 : 1);

  /** 比例換回頁碼。ratio 是 page / count 存下來的，直接 floor 會因浮點誤差少一頁（30/44*44 = 29.999…），加一點容差 */
  const RATIO_EPSILON = 1e-6;
  const pageAtRatio = (ratio, count) => Math.min(count - 1, Math.floor(ratio * count + RATIO_EPSILON));
  const alignPage = (page) => page - (page % span());

  /** 把頁面元素設定成「第 n 回的第 i 頁」。同一回只換平移量，不重排整回文字 */
  function setFace(el, n, i) {
    const chapter = chapters.get(n);
    const count = pageCount(n);
    const key = `${n}`;
    if (!chapter) { el.innerHTML = '<div class="loading-note">載入中…</div>'; delete el.dataset.key; return; }
    if (el.dataset.key !== key) {
      el.innerHTML = `<div class="page-inner"><div class="running-head"><span></span><span></span></div><div class="window"><div class="flow">${chapter.html}</div></div><div class="folio"></div></div>`;
      el.dataset.key = key;
    }
    const flow = el.querySelector('.flow');
    const isBlank = i >= count;
    flow.style.transform = `translateX(${-Math.min(i, count - 1) * layout.step}px)`;
    flow.style.visibility = isBlank ? 'hidden' : '';
    const head = el.querySelectorAll('.running-head span');
    const showHead = n !== FRONT && i > 0 && !isBlank;
    head[0].textContent = showHead ? BOOK.title : '';
    head[1].textContent = showHead ? chapter.title.split('　')[0] : '';
    el.querySelector('.folio').textContent = n === FRONT || isBlank ? '' : String(i + 1);
    let blank = el.querySelector('.blank-end');
    if (isBlank && !blank) {
      blank = document.createElement('div');
      blank.className = 'blank-end';
      el.querySelector('.window').append(blank);
    }
    if (blank) blank.style.display = isBlank ? '' : 'none';
  }

  function setBlankPaper(el) {
    el.innerHTML = '';
    delete el.dataset.key;
  }

  /* ---------- 位置 ---------- */
  function nextPos(pos) {
    if (pos.page + span() < pageCount(pos.ch)) return { ch: pos.ch, page: pos.page + span() };
    if (pos.ch < BOOK.chapterCount) return { ch: pos.ch + 1, page: 0 };
    return null;
  }

  async function prevPos(pos) {
    if (pos.page > 0) return { ch: pos.ch, page: Math.max(0, pos.page - span()) };
    if (pos.ch <= FRONT) return null;
    await ensure(pos.ch - 1);
    return { ch: pos.ch - 1, page: alignPage(pageCount(pos.ch - 1) - 1) };
  }

  async function ensure(n) {
    if (n < FRONT || n > BOOK.chapterCount) return;
    await loadChapter(n);
  }

  function prefetch() {
    // 載入後先量一次頁數：新出現的字會提早下載字型子集，不會等到翻過去才重新分頁
    [cur.ch + 1, cur.ch - 1].forEach((n) => {
      ensure(n).then(() => pageCount(n)).catch((err) => console.warn(`預先載入第 ${n} 回失敗：`, err));
    });
  }

  function render() {
    cur.page = alignPage(Math.min(cur.page, pageCount(cur.ch) - 1));
    if (layout.isSpread) {
      setFace(pageL, cur.ch, cur.page);
      setFace(pageR, cur.ch, cur.page + 1);
    } else {
      setFace(pageR, cur.ch, cur.page);
    }
    updateChrome();
    saveState();
  }

  /* ---------- 翻頁動畫：和書櫃首頁的扉頁同一套（rotateY 繞書脊，明暗只動 background-color） ---------- */
  const EASE = 'cubic-bezier(0.45, 0, 0.2, 1)';
  const nextFrame = () => new Promise((resolve) => { window.requestAnimationFrame(() => resolve()); });
  /*
    翻頁與封面翻動時不做明暗變化。原本疊一層黑色遮罩表現明暗，
    但 Safari 的 backface-visibility 只藏住朝後的那一面，上面的遮罩照樣畫出來，
    翻頁躺在左頁時會閃黑一下（拿掉遮罩後實測不閃）。
  */
  const leafPose = (deg) => `translateZ(1px) rotateY(${deg}deg)`;

  /** 翻頁「靜止時」的角度直接寫在 style 上，不靠動畫的 fill 撐住，動畫還沒套上或剛結束的那一格也是正確角度 */
  function setLeafPose(deg) {
    leaf.style.transform = leafPose(deg);
  }

  /**
   * 翻頁先以起始角度畫好、蓋住底下那頁，才換底下的內容（swapBeneath）再開始轉。
   * 翻頁剛顯示的那一格可能還沒畫好，先換底下會露出下一頁。
   */
  async function animateLeaf(fromDeg, toDeg, swapBeneath) {
    setLeafPose(fromDeg);
    leaf.hidden = false;
    await nextFrame();
    await nextFrame();
    if (swapBeneath) swapBeneath();
    const opts = { duration: FLIP_MS, easing: EASE };
    const turn = leaf.animate([{ transform: leafPose(fromDeg) }, { transform: leafPose(toDeg) }], opts);
    // 動畫一開始就把 style 換成終點：動畫播放時蓋過 style，播完那一格直接停在終點
    setLeafPose(toDeg);
    await turn.finished;
  }

  /** 翻完先讓翻頁停著蓋住底下，等底下的頁面畫好兩個畫格才收起（見 animateLeaf） */
  async function hideLeafAfterPaint() {
    await nextFrame();
    await nextFrame();
    leaf.hidden = true;
    leaf.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  }

  async function flip(dir) {
    // 翻頁動畫中又按了，記下次數依序翻完；反方向的會互相抵銷
    if (busy) { queued = Math.max(-MAX_QUEUED_FLIPS, Math.min(MAX_QUEUED_FLIPS, queued + dir)); return; }
    busy = true;
    try {
      const target = dir > 0 ? nextPos(cur) : await prevPos(cur);
      if (!target) { queued = 0; return; }
      await ensure(target.ch);
      const animate = !reduceMotion.matches;
      if (animate) await playFlip(dir, target);
      cur = target;
      render();
      if (animate) await hideLeafAfterPaint();
      prefetch();
    } catch (err) {
      leaf.hidden = true;
      console.error(`翻頁失敗（第 ${cur.ch} 回第 ${cur.page + 1} 頁，方向 ${dir}）：`, err);
    } finally {
      busy = false;
      if (needsRepaginate) repaginate();
      if (queued) {
        const next = Math.sign(queued);
        queued -= next;
        flip(next);
      }
    }
  }

  async function playFlip(dir, target) {
    if (layout.isSpread && dir > 0) {
      setFace(leafFront, cur.ch, cur.page + 1);
      setFace(leafBack, target.ch, target.page);
      await animateLeaf(0, -180, () => setFace(pageR, target.ch, target.page + 1));
    } else if (layout.isSpread) {
      setFace(leafBack, cur.ch, cur.page);
      setFace(leafFront, target.ch, target.page + 1);
      await animateLeaf(-180, 0, () => setFace(pageL, target.ch, target.page));
    } else if (dir > 0) {
      setFace(leafFront, cur.ch, cur.page);
      setBlankPaper(leafBack);
      await animateLeaf(0, -180, () => setFace(pageR, target.ch, target.page));
    } else {
      setFace(leafFront, target.ch, target.page);
      setBlankPaper(leafBack);
      await animateLeaf(-180, 0);
    }
  }

  async function goTo(n, page = 0) {
    try {
      await ensure(n);
      cur = { ch: n, page: Math.max(0, page) };
      render();
      prefetch();
    } catch (err) {
      console.error(`跳到第 ${n} 回失敗：`, err);
    }
  }

  /* ---------- 開場：闔起的書翻開封面（從書櫃點進來時書櫃已播過，就跳過） ---------- */
  async function playOpening() {
    const cover = $('#cover');
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') === 'shelf' || reduceMotion.matches || typeof cover.animate !== 'function') { cover.remove(); return; }
    const inside = cover.querySelector('.cover-inside .page');
    if (layout.isSpread) setFace(inside, cur.ch, cur.page);
    else setBlankPaper(inside);
    pageL.style.visibility = 'hidden';
    const shift = layout.isSpread ? layout.pageW / 2 : 0;
    const closed = `translate(-50%, -50%) translateX(${-shift}px)`;
    const open = 'translate(-50%, -50%)';
    bookEl.style.transform = closed;
    cover.hidden = false;
    const hint = $('#stage-hint');
    hint.hidden = false;

    let skipped = false;
    const finish = () => {
      if (skipped) return;
      skipped = true;
      bookEl.getAnimations().concat(cover.getAnimations({ subtree: true })).forEach((a) => a.cancel());
      bookEl.style.transform = '';
      pageL.style.visibility = '';
      cover.remove();
      hint.remove();
      stage.removeEventListener('pointerdown', finish);
      document.removeEventListener('keydown', finish);
    };
    stage.addEventListener('pointerdown', finish);
    document.addEventListener('keydown', finish);

    const opts = { duration: OPEN_MS, delay: OPEN_DELAY_MS, easing: EASE, fill: 'both' };
    try {
      await Promise.all([
        bookEl.animate([{ transform: closed }, { transform: open }], opts).finished,
        cover.animate([{ transform: 'translateZ(3px) rotateY(0deg)' }, { transform: 'translateZ(3px) rotateY(-180deg)' }], opts).finished,
      ]);
    } catch (err) {
      // 被使用者略過時動畫會被 cancel，這是預期的；其他錯誤要記錄
      if (err.name !== 'AbortError') console.warn('開場動畫失敗，直接顯示內文：', err);
    }
    finish();
  }

  /* ---------- 介面狀態 ---------- */
  function chapterLabel(n) {
    if (n === FRONT) return '卷首';
    const chapter = chapters.get(n);
    return chapter ? chapter.title : `第 ${n} 回`;
  }

  function overallPercent() {
    if (!toc || cur.ch === FRONT) return 0;
    const total = toc.reduce((sum, c) => sum + c.chars, 0);
    const before = toc.slice(0, cur.ch - 1).reduce((sum, c) => sum + c.chars, 0);
    const within = toc[cur.ch - 1].chars * ((cur.page + span()) / pageCount(cur.ch));
    return Math.min(100, ((before + Math.min(within, toc[cur.ch - 1].chars)) / total) * 100);
  }

  function updateChrome() {
    const count = pageCount(cur.ch);
    const shown = Math.min(count, cur.page + span());
    const label = chapterLabel(cur.ch);
    $('#nav-chapter').textContent = label;
    range.max = String(count);
    range.value = String(cur.page + 1);
    range.setAttribute('aria-valuetext', `${label}，第 ${cur.page + 1} 頁，共 ${count} 頁`);
    const percent = overallPercent();
    statusEl.innerHTML = `<b>${cur.page + 1}${shown > cur.page + 1 ? `–${shown}` : ''}</b> / ${count}<span class="pct"> 頁 · ${percent.toFixed(percent < 10 ? 1 : 0)}%</span>`;
    $('#progress-text').textContent = `已讀 ${readDone().size} / ${BOOK.chapterCount} 回 · 全書 ${percent.toFixed(1)}%`;
    $('#progress-meter').style.transform = `scaleX(${percent / 100})`;
    $('#prev-btn').disabled = cur.ch === FRONT && cur.page === 0;
    $('#first-btn').disabled = cur.ch === FRONT && cur.page === 0;
    $('#resume-btn').disabled = isAtFurthest();
    $('#next-btn').disabled = !nextPos(cur);
    live.textContent = `${label}，第 ${cur.page + 1} 頁，共 ${count} 頁`;
    if (srText.dataset.ch !== String(cur.ch)) {
      srText.innerHTML = chapters.get(cur.ch).html;
      srText.dataset.ch = String(cur.ch);
    }
    updateToc();
  }

  /** 目前這一頁（雙頁時是這一攤）是否就是讀到最遠的地方 */
  function isAtFurthest() {
    if (cur.ch !== furthest.ch) return false;
    return alignPage(pageAtRatio(furthest.ratio, pageCount(cur.ch))) === cur.page;
  }

  async function goToFurthest() {
    await ensure(furthest.ch);
    goTo(furthest.ch, alignPage(pageAtRatio(furthest.ratio, pageCount(furthest.ch))));
  }

  function readDone() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(BOOK.progressKey) || '{}');
      return new Set(Object.keys((parsed && parsed.done) || {}).map(Number));
    } catch (err) {
      console.warn(`讀取閱讀進度「${BOOK.progressKey}」失敗：`, err);
      return new Set();
    }
  }

  /** 讀到一回的最後一頁就記為已讀；格式 { done: { 回數: true } } 和書櫃首頁的課程進度相同，書背進度線讀得到 */
  function saveState() {
    try {
      const count = pageCount(cur.ch);
      const ratio = cur.page / count;
      if (cur.ch > furthest.ch || (cur.ch === furthest.ch && ratio > furthest.ratio)) furthest = { ch: cur.ch, ratio };
      window.localStorage.setItem(BOOK.stateKey, JSON.stringify({ ch: cur.ch, ratio, font: fontIndex, furthest }));
      if (cur.ch !== FRONT && cur.page + span() >= count) {
        const done = Object.fromEntries([...readDone()].map((n) => [n, true]));
        done[cur.ch] = true;
        window.localStorage.setItem(BOOK.progressKey, JSON.stringify({ done }));
      }
    } catch (err) {
      console.warn('儲存閱讀位置失敗：', err);
    }
  }

  function loadState() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(BOOK.stateKey) || 'null');
      if (!saved) return { ch: FRONT, ratio: 0 };
      if (Number.isInteger(saved.font) && FONT_SIZES[saved.font]) fontIndex = saved.font;
      const far = saved.furthest;
      if (far && Number.isInteger(far.ch) && far.ch >= FRONT && far.ch <= BOOK.chapterCount) furthest = { ch: far.ch, ratio: Number(far.ratio) || 0 };
      const ch = Number.isInteger(saved.ch) && saved.ch >= FRONT && saved.ch <= BOOK.chapterCount ? saved.ch : FRONT;
      if (!far) furthest = { ch, ratio: Number(saved.ratio) || 0 };
      return { ch, ratio: Number(saved.ratio) || 0 };
    } catch (err) {
      console.warn('讀取閱讀位置失敗，從卷首開始：', err);
      return { ch: FRONT, ratio: 0 };
    }
  }

  /* ---------- 目錄側欄 ---------- */
  function buildToc() {
    const list = $('#toc');
    const items = [{ n: FRONT, title: '卷首　書名頁與說明' }, ...toc];
    list.innerHTML = items.map((c) => {
      const [no, ...rest] = c.title.split('　').filter(Boolean);
      return `<li><a href="#ch-${c.n}" data-ch="${c.n}"><span class="no">${escapeHtml(no)}</span><span>${rest.map(escapeHtml).join('<br>')}</span><i class="read" aria-hidden="true"></i></a></li>`;
    }).join('');
    list.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-ch]');
      if (!link) return;
      event.preventDefault();
      closeDrawer();
      goTo(Number(link.dataset.ch));
    });
  }

  function updateToc() {
    const done = readDone();
    document.querySelectorAll('#toc a[data-ch]').forEach((a) => {
      const n = Number(a.dataset.ch);
      a.classList.toggle('is-read', done.has(n));
      if (n === cur.ch) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  const drawer = $('#drawer');
  const menuBtn = $('#menu-btn');
  const blockedWhileOpen = ['.nav', '#stage', '.bar'];

  /** viaKeyboard：用鍵盤開啟時焦點放到目前那一回；滑鼠或觸控開啟時放在側欄本身，不顯示 focus 框 */
  function openDrawer(viaKeyboard) {
    document.body.classList.add('drawer-open');
    drawer.removeAttribute('aria-hidden');
    menuBtn.setAttribute('aria-expanded', 'true');
    blockedWhileOpen.forEach((sel) => { document.querySelector(sel).inert = true; });
    const current = drawer.querySelector('a[aria-current="true"]');
    if (current) current.scrollIntoView({ block: 'center' });
    const focusTarget = viaKeyboard ? (current || $('#drawer-close')) : drawer;
    focusTarget.focus({ preventScroll: true });
  }

  function closeDrawer() {
    if (!document.body.classList.contains('drawer-open')) return;
    document.body.classList.remove('drawer-open');
    drawer.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    blockedWhileOpen.forEach((sel) => { document.querySelector(sel).inert = false; });
    menuBtn.focus({ preventScroll: true });
  }

  /* ---------- 設定：配色與字級（桌面在頂部列，手機在側欄，兩組按鈕同步） ---------- */
  function applyTheme(choice) {
    if (choice === 'light' || choice === 'dark') document.documentElement.dataset.theme = choice;
    else delete document.documentElement.dataset.theme;
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.themeChoice === (choice || 'auto')));
    });
  }

  function setupSettings() {
    let theme = 'auto';
    try { theme = window.localStorage.getItem(THEME_KEY) || 'auto'; } catch (err) { console.warn('讀取配色偏好失敗：', err); }
    applyTheme(theme);
    document.querySelectorAll('[data-theme-choice]').forEach((btn) => btn.addEventListener('click', () => {
      const choice = btn.dataset.themeChoice;
      applyTheme(choice);
      try {
        if (choice === 'auto') window.localStorage.removeItem(THEME_KEY);
        else window.localStorage.setItem(THEME_KEY, choice);
      } catch (err) { console.warn('儲存配色偏好失敗：', err); }
    }));
    document.querySelectorAll('[data-font-step]').forEach((btn) => btn.addEventListener('click', () => {
      const nextIndex = fontIndex + Number(btn.dataset.fontStep);
      if (!FONT_SIZES[nextIndex]) return;
      fontIndex = nextIndex;
      relayout();
    }));
    updateFontButtons();
  }

  function updateFontButtons() {
    document.querySelectorAll('[data-font-step]').forEach((btn) => {
      btn.disabled = !FONT_SIZES[fontIndex + Number(btn.dataset.fontStep)];
    });
  }

  /** 版面或字級改變：重新分頁，用「在這一回讀到的比例」還原位置 */
  function relayout() {
    const ratio = cur.page / pageCount(cur.ch);
    applyLayout();
    cur.page = pageAtRatio(ratio, pageCount(cur.ch));
    render();
    updateFontButtons();
  }

  /**
   * 字型子集下載完，字寬可能變，頁數要重算。版面尺寸沒變，所以不重建頁面 DOM（重建會閃一下）；
   * 翻頁中就等翻完再做。
   */
  function repaginate() {
    if (busy) { needsRepaginate = true; return; }
    needsRepaginate = false;
    const ratio = cur.page / pageCount(cur.ch);
    counts.clear();
    cur.page = pageAtRatio(ratio, pageCount(cur.ch));
    render();
  }

  /* ---------- 操作 ---------- */
  function setupInput() {
    $('#prev-btn').addEventListener('click', () => flip(-1));
    $('#next-btn').addEventListener('click', () => flip(1));
    $('#first-btn').addEventListener('click', () => goTo(FRONT, 0));
    $('#resume-btn').addEventListener('click', () => {
      goToFurthest().catch((err) => console.error(`回到閱讀進度（第 ${furthest.ch} 回）失敗：`, err));
    });
    range.addEventListener('input', () => {
      cur.page = alignPage(Number(range.value) - 1);
      render();
    });
    // 鍵盤（Enter、空白鍵）觸發的 click，event.detail 是 0
    menuBtn.addEventListener('click', (event) => openDrawer(event.detail === 0));
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#scrim').addEventListener('click', closeDrawer);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeDrawer(); return; }
      if (document.body.classList.contains('drawer-open') || event.target.closest('input, textarea, select')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (['ArrowRight', 'PageDown'].includes(event.key) || (event.key === ' ' && !event.shiftKey)) { event.preventDefault(); flip(1); }
      if (['ArrowLeft', 'PageUp'].includes(event.key) || (event.key === ' ' && event.shiftKey)) { event.preventDefault(); flip(-1); }
    });

    // 滑動翻頁；沒有滑動就當成點擊：點左半邊上一頁、右半邊下一頁
    let start = null;
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('a')) return;
      start = { x: event.clientX, y: event.clientY };
    });
    stage.addEventListener('pointerup', (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) { flip(dx < 0 ? 1 : -1); return; }
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return;
      const rect = bookEl.getBoundingClientRect();
      flip(event.clientX < rect.left + rect.width / 2 ? -1 : 1);
    });
    stage.addEventListener('pointercancel', () => { start = null; });

    let timer = 0;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = computeLayout();
        if (!layout || (next.pageW === layout.pageW && next.pageH === layout.pageH && next.isSpread === layout.isSpread)) return;
        relayout();
      }, RESIZE_DEBOUNCE_MS);
    };
    // ResizeObserver 依附繪製，分頁在背景時不觸發；window resize 當備援
    new ResizeObserver(onResize).observe(stage);
    window.addEventListener('resize', onResize);
  }

  /* ---------- 啟動 ---------- */
  function waitForFonts() {
    if (!document.fonts || !document.fonts.ready) return Promise.resolve();
    // 字型載不到（離線、被擋）時不能卡住，逾時就用系統字型排版
    return Promise.race([document.fonts.ready, new Promise((resolve) => { window.setTimeout(resolve, FONT_WAIT_MS); })]);
  }

  async function start() {
    const saved = loadState();
    setupSettings();
    setupInput();
    await waitForFonts();
    applyLayout();
    await tocPromise;
    buildToc();
    try {
      await ensure(saved.ch);
      cur = { ch: saved.ch, page: pageAtRatio(saved.ratio, pageCount(saved.ch)) };
    } catch (err) {
      console.warn(`還原到第 ${saved.ch} 回失敗，從卷首開始：`, err);
      cur = { ch: FRONT, page: 0 };
    }
    render();
    prefetch();
    // 字型的子集是看到新字才下載，下載完字寬可能變，重新分頁一次
    if (document.fonts) document.fonts.addEventListener('loadingdone', repaginate);
    await playOpening();
  }

  start().catch((err) => {
    console.error('閱讀器啟動失敗：', err);
    stage.innerHTML = `<div class="loading-note">閱讀器載入失敗：${escapeHtml(err.message)}</div>`;
  });
})();
