
/* ==========================================================================
   C# 課程專用互動元件
   每個元件：render(props, id) 只產生字串；hydrate(el, props) 才綁事件與動畫
   ========================================================================== */
const STEP_MS = 1800;

/* 逐步播放的共用控制：上一步、播放／暫停、下一步、重設；方向鍵也能用 */
function stepperControls(label) {
  return `<div class="tw-controls" role="group" aria-label="${esc(label || '動畫控制')}">
    <button type="button" class="btn small nb-press" data-step="prev">← 上一步</button>
    <button type="button" class="btn small primary nb-press" data-step="play">▶ 播放</button>
    <button type="button" class="btn small nb-press" data-step="next">下一步 →</button>
    <button type="button" class="btn small nb-press" data-step="reset">重設</button>
  </div>`;
}
function makeStepper(el, count, draw, { interval = STEP_MS, start = 0 } = {}) {
  let step = start;
  let timer = null;
  const playBtn = $('[data-step="play"]', el);
  const reduced = prefersReducedMotion();
  if (reduced) {
    playBtn.disabled = true;
    playBtn.textContent = '自動播放已關閉';
    playBtn.title = '你的系統開啟了「減少動態效果」，請用「下一步」逐步觀看';
  }
  function sync() {
    $('[data-step="prev"]', el).disabled = step <= 0;
    $('[data-step="next"]', el).disabled = step >= count - 1;
  }
  function stop() {
    window.clearInterval(timer);
    timer = null;
    if (!reduced) playBtn.textContent = '▶ 播放';
  }
  function go(to, animate = true) {
    step = Math.min(Math.max(to, 0), count - 1);
    draw(step, animate && !reduced);
    sync();
  }
  function play() {
    if (timer) { stop(); return; }
    if (step >= count - 1) go(0);
    playBtn.textContent = '❚❚ 暫停';
    timer = window.setInterval(() => {
      if (step >= count - 1 || !document.body.contains(el)) { stop(); return; }
      go(step + 1);
    }, interval);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b || !el.contains(b)) return;
    const a = b.dataset.step;
    if (a === 'play') { play(); return; }
    stop();
    if (a === 'prev') go(step - 1);
    if (a === 'next') go(step + 1);
    if (a === 'reset') go(0, false);
  });
  el.addEventListener('keydown', (e) => {
    if (!e.target.closest('.tw-controls')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stop(); go(step + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); stop(); go(step - 1); }
  });
  window.addEventListener('hashchange', stop, { once: true });
  go(start, false);
  return { go, stop };
}

/* ---------- csrun：可執行的範例與輸出 ---------- */
// props: { code, title?, file?, lang?, hl?, output: 字串（\n 分行，! 開頭的行顯示成錯誤） }
// 頁面不執行 Python，輸出是事先在 CPython 實際跑過的結果；版本與差異記在 research-notes.md。
Widgets.csrun = {
  render(props, id) {
    return `<div class="jw runner">
      <div class="jw-head"><span class="label" style="--chip:var(--m0)">執行</span><span class="grow">${esc(props.title || '範例與執行結果')}</span></div>
      <div class="code"><div class="code-head"><span class="lang">${esc(props.lang || 'Python')}</span><span class="ttl">${esc(props.file || 'app.py')}</span></div>
        <pre tabindex="0" aria-label="程式碼"><code class="language-${esc(props.hl || 'python')}">${esc(props.code)}</code></pre></div>
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-run aria-controls="${id}-out" aria-expanded="false">▶ 執行</button></div>
      <pre class="run-out" id="${id}-out" aria-live="polite" aria-label="輸出"><span class="ln dim">（按「執行」顯示輸出）</span></pre>
    </div>`;
  },
  hydrate(el, props) {
    const out = $('.run-out', el);
    const runBtn = $('[data-run]', el);
    function show() {
      out.textContent = '';
      String(props.output).split('\n').forEach((line) => {
        const span = document.createElement('span');
        const isErr = line.startsWith('!');
        span.className = `ln${isErr ? ' err' : ''}`;
        span.textContent = isErr ? line.slice(1) : line;
        out.appendChild(span);
      });
      runBtn.setAttribute('aria-expanded', 'true');
    }
    runBtn.addEventListener('click', show);
  },
};

/* ---------- classify：分類練習 ---------- */
// props: { buckets: [{ id, label }], items: [{ text, answer, why }] }
Widgets.classify = {
  render(props) {
    const btns = (i) => props.buckets.map((b) => `<button type="button" class="btn small nb-press" data-cls="${i}:${esc(b.id)}" aria-pressed="false">${esc(b.label)}</button>`).join('');
    return `<div class="jw cls">
      <div class="cls-head"><span class="cls-score" aria-live="polite"></span><button type="button" class="btn small nb-press" data-cls-reset>重做</button></div>
      <ol class="cls-list">${props.items.map((it, i) => `<li class="cls-item" data-i="${i}">
        <div class="cls-text">${md(it.text)}</div>
        <div class="cls-btns" role="group" aria-label="選一個類別">${btns(i)}</div>
        <div class="cls-fb" aria-live="polite"></div>
      </li>`).join('')}</ol>
    </div>`;
  },
  hydrate(el, props) {
    const label = (id) => (props.buckets.find((b) => b.id === id) || {}).label || id;
    const answered = new Map();
    const score = $('.cls-score', el);
    function sync() {
      const right = [...answered.values()].filter(Boolean).length;
      score.textContent = `已作答 ${answered.size} / ${props.items.length}・答對 ${right}`;
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-cls-reset]')) {
        answered.clear();
        $$('.cls-item', el).forEach((li) => { li.className = 'cls-item'; $('.cls-fb', li).innerHTML = ''; $$('[data-cls]', li).forEach((b) => b.setAttribute('aria-pressed', 'false')); });
        sync();
        return;
      }
      const b = e.target.closest('[data-cls]');
      if (!b) return;
      const [i, id] = b.dataset.cls.split(':');
      const it = props.items[Number(i)];
      const li = b.closest('.cls-item');
      const ok = it.answer === id;
      answered.set(i, ok);
      $$('[data-cls]', li).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      li.className = `cls-item ${ok ? 'is-right' : 'is-wrong'}`;
      $('.cls-fb', li).innerHTML = `<strong>${ok ? '✓ 正確' : `✗ 應該是「${esc(label(it.answer))}」`}</strong>　${md(it.why)}`;
      sync();
    });
    sync();
  },
};


/* ---------- knobs：試算拉桿（從 finance-psychology-course 複製） ---------- */
// props: { title, sliders: [{ id, label, min, max, step, value, unit?, ends?, format? }], compute: (v) => ({ rows: [{ label, value, ratio }], note }) }
Widgets.knobs = {
  render(props, id) {
    return `<div class="jw kn">
      <div class="jw-head"><span class="label" style="--chip:var(--m7)">拉桿</span><span class="grow">${esc(props.title || '改參數，看結果')}</span></div>
      <div class="lv-sliders">${props.sliders.map((s) => `<div class="lv-row">
        <label for="${id}-${s.id}">${esc(s.label)}：<output data-kn-out="${s.id}"></output>${s.unit ? ` ${esc(s.unit)}` : ''}</label>
        <input type="range" id="${id}-${s.id}" data-kn="${s.id}" min="${s.min}" max="${s.max}" step="${s.step || 1}" value="${s.value}">
        ${s.ends ? `<div class="lv-ends"><span>${esc(s.ends[0])}</span><span>${esc(s.ends[1])}</span></div>` : ''}
      </div>`).join('')}</div>
      <div class="kn-rows" aria-live="polite"></div>
      <p class="jw-note kn-note"></p>
    </div>`;
  },
  hydrate(el, props) {
    const v = Object.fromEntries(props.sliders.map((s) => [s.id, s.value]));
    function draw() {
      const r = props.compute(v);
      $('.kn-rows', el).innerHTML = r.rows.map((row) => `<div class="kn-row"><span>${esc(row.label)}</span><span class="lv-meter"><span class="lv-fill" style="transform:scaleX(${Math.max(0, Math.min(1, row.ratio))})"></span></span><strong>${esc(row.value)}</strong></div>`).join('');
      $('.kn-note', el).innerHTML = r.note ? md(r.note) : '';
      props.sliders.forEach((s) => { $(`[data-kn-out="${s.id}"]`, el).textContent = s.format ? s.format(v[s.id]) : v[s.id]; });
    }
    el.addEventListener('input', (e) => { const s = e.target.closest('[data-kn]'); if (s) { v[s.dataset.kn] = Number(s.value); draw(); } });
    draw();
  },
};

/* ---------- herodemo：首頁的第一個範例 ---------- */
const HERO_RUNNER = {
  "title": "這門課的第一個觀念：名字與物件",
  "lang": "Python",
  "hl": "python",
  "file": "app.py",
  "code": "a = [1, 2]\nb = a\nb.append(3)\nprint(a)",
  "output": "[1, 2, 3]"
};
Widgets.herodemo = {
  render(props, id) { return Widgets.csrun.render(HERO_RUNNER, id); },
  hydrate(el) { Widgets.csrun.hydrate(el, HERO_RUNNER); },
};

/* ---------- 圖片放大：手機上圖裡的字會縮到 8px 左右，點「放大看」用原尺寸檢視 ---------- */
// 放大後最小字級至少 12.5px（content-rules：375px 時圖中文字要 ≥ 12px）
const FIG_MIN_TEXT_PX = 12.5;
const FigZoom = (() => {
  let dialog = null;
  let opener = null;
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.className = 'fig-dialog';
    dialog.setAttribute('aria-label', '放大檢視圖解');
    dialog.innerHTML = '<div class="fig-dialog-bar"><span class="fig-dialog-hint">可以左右、上下捲動</span><button type="button" class="btn small nb-press" data-fig-close>關閉</button></div><div class="fig-dialog-body"><div class="figure fig-dialog-figure"></div></div>';
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-fig-close]') || e.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      $('.fig-dialog-figure', dialog).textContent = '';
      if (opener) opener.focus();
    });
    document.body.appendChild(dialog);
    return dialog;
  }
  function open(button) {
    const svg = $('svg', button.closest('.figure'));
    if (!svg) return;
    const box = ensureDialog();
    const clone = svg.cloneNode(true);
    const fontSizes = [...clone.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size'))).filter(Boolean);
    const minFont = fontSizes.length ? Math.min(...fontSizes) : 16;
    const scale = Math.max(1, FIG_MIN_TEXT_PX / minFont);
    clone.style.width = `${Math.ceil(svg.viewBox.baseVal.width * scale)}px`;
    clone.style.maxWidth = 'none';
    $('.fig-dialog-figure', box).appendChild(clone);
    opener = button;
    box.showModal();
    $('[data-fig-close]', box).focus();
  }
  document.addEventListener('click', (e) => {
    const button = e.target.closest('[data-fig-zoom]');
    if (button) open(button);
  });
  return { open };
})();
