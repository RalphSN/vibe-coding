
/* ==========================================================================
   JavaScript 課程專用互動元件
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

/* ---------- runner：先預測，再在沙盒 iframe 裡執行 ---------- */
// props: { code, title?, predict?: { q?, options: [文字], answer: index }, dom?: HTML 字串, wait?: 毫秒, editable?: true }
// 程式在 sandbox="allow-scripts" 的 iframe 裡以 ES 模組（嚴格模式）執行，console 輸出用 postMessage 傳回。
const RUN_WAIT_MS = 1500;
const RUN_MAX_LINES = 200;

/* 在 iframe 裡執行的格式化程式：盡量模仿 Node.js 的 console.log 輸出 */
const RUNNER_PRELUDE = String.raw`
const __send = (kind, text) => parent.postMessage({ __run: window.name, kind, text }, '*');
function __fmt(v, depth = 0, top = true) {
  if (typeof v === 'string') return top ? v : "'" + v + "'";
  if (typeof v === 'bigint') return v + 'n';
  if (typeof v === 'symbol') return v.toString();
  if (typeof v === 'function') return '[Function: ' + (v.name || '(anonymous)') + ']';
  if (v === null || typeof v !== 'object') return String(v);
  if (v instanceof Error) return v.name + ': ' + v.message;
  if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
  if (Array.isArray(v)) return v.length ? '[ ' + v.map((x) => __fmt(x, depth + 1, false)).join(', ') + ' ]' : '[]';
  if (v instanceof Map) return 'Map(' + v.size + ') {' + (v.size ? ' ' + [...v].map(([k, x]) => __fmt(k, depth + 1, false) + ' => ' + __fmt(x, depth + 1, false)).join(', ') + ' ' : '') + '}';
  if (v instanceof Set) return 'Set(' + v.size + ') {' + (v.size ? ' ' + [...v].map((x) => __fmt(x, depth + 1, false)).join(', ') + ' ' : '') + '}';
  if (v instanceof Promise) return 'Promise { … }';
  if (typeof Node !== 'undefined' && v instanceof Node) return '<' + (v.nodeName || '').toLowerCase() + '>';
  const keys = Object.keys(v);
  const proto = Object.getPrototypeOf(v);
  const name = proto && proto !== Object.prototype && proto.constructor ? proto.constructor.name + ' ' : (proto === null ? '[Object: null prototype] ' : '');
  if (!keys.length) return name + '{}';
  return name + '{ ' + keys.map((k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : "'" + k + "'") + ': ' + __fmt(v[k], depth + 1, false)).join(', ') + ' }';
}
for (const level of ['log', 'info', 'warn', 'error', 'table']) {
  console[level] = (...args) => __send(level === 'error' || level === 'warn' ? 'err' : 'log', args.map((a) => __fmt(a)).join(' '));
}
window.addEventListener('error', (e) => { __send('err', 'Uncaught ' + (e.error ? e.error.name + ': ' + e.error.message : e.message)); e.preventDefault(); });
window.addEventListener('unhandledrejection', (e) => { const r = e.reason; __send('err', 'Uncaught (in promise) ' + (r instanceof Error ? r.name + ': ' + r.message : __fmt(r))); e.preventDefault(); });
`;
let runSeq = 0;
Widgets.runner = {
  render(props, id) {
    const p = props.predict;
    const lines = String(props.code).split('\n').length;
    return `<div class="jw runner">
      <div class="jw-head"><span class="label" style="--chip:var(--m0)">試試看</span><span class="grow">${esc(props.title || '先預測，再執行')}</span></div>
      <label class="visually-hidden" for="${id}-code">程式碼（可以修改）</label>
      <textarea class="run-code" id="${id}-code" spellcheck="false" rows="${Math.min(Math.max(lines, 3), 16)}"${props.editable === false ? ' readonly' : ''}>${esc(props.code)}</textarea>
      ${p ? `<div class="run-predict" role="group" aria-label="預測">
        <span class="jw-note"><strong>先預測：</strong>${md(p.q || '執行後會印出什麼？')}</span>
        <div class="opts">${p.options.map((o, i) => `<button type="button" class="btn small nb-press" data-pick="${i}" aria-pressed="false">${esc(o)}</button>`).join('')}</div>
      </div>` : ''}
      <div class="jw-row">
        <button type="button" class="btn small primary nb-press" data-run>▶ 執行</button>
        <button type="button" class="btn small nb-press" data-reset>還原程式</button>
      </div>
      ${props.dom ? '<iframe class="run-frame" title="執行結果的網頁畫面" hidden></iframe>' : ''}
      <pre class="run-out" aria-live="polite" aria-label="輸出"><span class="ln dim">（按「執行」看結果）</span></pre>
      <div class="run-verdict" aria-live="polite"></div>
    </div>`;
  },
  hydrate(el, props) {
    const code = $('.run-code', el);
    const out = $('.run-out', el);
    const verdict = $('.run-verdict', el);
    let picked = null;
    let frame = $('.run-frame', el);
    let lineCount = 0;
    let token = '';
    const add = (kind, text) => {
      if (lineCount >= RUN_MAX_LINES) return;
      lineCount += 1;
      const span = document.createElement('span');
      span.className = `ln${kind === 'err' ? ' err' : ''}`;
      span.textContent = text;
      out.appendChild(span);
    };
    const onMsg = (e) => {
      const d = e.data;
      if (!d || d.__run !== token || !document.body.contains(el)) return;
      add(d.kind, d.text);
    };
    window.addEventListener('message', onMsg);
    function judge() {
      const p = props.predict;
      if (!p || picked == null) { verdict.className = 'run-verdict'; verdict.textContent = ''; return; }
      const ok = picked === p.answer;
      verdict.className = `run-verdict ${ok ? 'ok' : 'no'}`;
      verdict.textContent = ok ? `✓ 預測正確：${p.options[p.answer]}` : `✗ 你預測「${p.options[picked]}」，實際對應的是「${p.options[p.answer]}」`;
    }
    function run() {
      runSeq += 1;
      token = `run-${runSeq}`;
      lineCount = 0;
      out.textContent = '';
      verdict.className = 'run-verdict';
      verdict.textContent = '';
      const old = frame;
      frame = document.createElement('iframe');
      frame.className = 'run-frame';
      frame.title = '執行結果的網頁畫面';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.hidden = !props.dom;
      frame.name = token;
      // 使用者的程式放在 module script 裡：和 .mjs 一樣是嚴格模式，也能用頂層 await
      const userCode = code.value.replace(/<\/script/gi, '<\\/script');
      frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;margin:8px}</style><body>${props.dom || ''}<script>${RUNNER_PRELUDE}<\/script><script type="module">${userCode}\n<\/script></body>`;
      if (old) old.replaceWith(frame); else out.before(frame);
      window.setTimeout(() => {
        if (!document.body.contains(el)) return;
        if (!lineCount) add('log', '（沒有任何輸出）');
        judge();
      }, props.wait || RUN_WAIT_MS);
    }
    el.addEventListener('click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        picked = Number(pick.dataset.pick);
        $$('[data-pick]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === pick)));
        return;
      }
      if (e.target.closest('[data-run]')) run();
      if (e.target.closest('[data-reset]')) { code.value = props.code; }
    });
    // Tab 鍵在程式區塊裡輸入兩個空白；Esc 離開時才交還焦點
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !code.readOnly) {
        e.preventDefault();
        const { selectionStart: s, selectionEnd: t } = code;
        code.setRangeText('  ', s, t, 'end');
      }
    });
    window.addEventListener('hashchange', () => window.removeEventListener('message', onMsg), { once: true });
  },
};

/* ---------- floatbits：把 number 拆成 64 個位元 ---------- */
// props: { presets: ['0.1', …], start: '0.1' }
const FLOAT_DIGITS = 25;
function floatParts(n) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n);
  let bits = '';
  for (let i = 0; i < 8; i += 1) bits += view.getUint8(i).toString(2).padStart(8, '0');
  return { sign: bits.slice(0, 1), exp: bits.slice(1, 12), mant: bits.slice(12) };
}
Widgets.floatbits = {
  render(props, id) {
    return `<div class="jw floatbits">
      <div class="jw-head"><span class="label" style="--chip:var(--m1)">拆開看</span><span class="grow">一個 number 實際存成 64 個位元</span></div>
      <div class="jw-row">
        <label for="${id}-n" class="mono">數字</label>
        <input class="fb-input" id="${id}-n" inputmode="decimal" value="${esc(props.start || '0.1')}" autocomplete="off">
        ${(props.presets || []).map((p) => `<button type="button" class="btn small nb-press mono" data-fb="${esc(p)}">${esc(p)}</button>`).join('')}
      </div>
      <div class="fb-legend"><span class="label" style="--chip:var(--danger)">符號 1 位元</span><span class="label" style="--chip:var(--info)">指數 11 位元</span><span class="label" style="--chip:var(--highlight)">尾數 52 位元</span></div>
      <div class="fb-bits" aria-hidden="true"></div>
      <div class="fb-out" aria-live="polite"></div>
    </div>`;
  },
  hydrate(el) {
    const input = $('.fb-input', el);
    const bitsEl = $('.fb-bits', el);
    const outEl = $('.fb-out', el);
    function draw() {
      const raw = input.value.trim();
      const n = Number(raw);
      if (raw === '' || Number.isNaN(n)) { bitsEl.innerHTML = ''; outEl.innerHTML = '<span>請輸入一個數字，例如 0.1</span>'; return; }
      const { sign, exp, mant } = floatParts(n);
      bitsEl.innerHTML = [...sign].map((b) => `<span class="s">${b}</span>`).join('') + [...exp].map((b) => `<span class="e">${b}</span>`).join('') + [...mant].map((b) => `<span class="m">${b}</span>`).join('');
      const exact = Number.isFinite(n) ? n.toPrecision(FLOAT_DIGITS) : String(n);
      const same = String(n) === raw;
      outEl.innerHTML = `<span>你輸入：${esc(raw)}</span>
        <span>JavaScript 顯示：${esc(String(n))}${same ? '' : '（和你輸入的不一樣）'}</span>
        <span>實際存下來的值（${FLOAT_DIGITS} 位有效數字）：${esc(exact)}</span>
        <span>是安全整數嗎？${Number.isSafeInteger(n) ? '是' : '否'}</span>`;
    }
    input.addEventListener('input', draw);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fb]');
      if (!b) return;
      input.value = b.dataset.fb;
      draw();
    });
    draw();
  },
};

/* ---------- refviz：逐行看變數與物件的關係 ---------- */
// props: { code: [行], steps: [{ line, vars: [{ name, val?, ref? }], objs: [{ id, text, changed? }], note }] }
Widgets.refviz = {
  render(props) {
    return `<div class="jw refviz">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">逐行看</span><span class="grow">${esc(props.title || '變數裡放的是值，還是箭頭？')}</span><span class="ls-step" aria-live="polite"></span></div>
      <pre class="rv-code">${props.code.map((l) => `<span>${esc(l) || ' '}</span>`).join('')}</pre>
      ${stepperControls('逐行執行控制')}
      <div class="rv-board">
        <div class="rv-col"><h4>變數</h4><ul class="rv-list rv-vars"></ul></div>
        <div class="rv-col"><h4>物件（放在別處，用代號表示）</h4><ul class="rv-list rv-objs"></ul></div>
      </div>
      <p class="jw-note rv-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    const lines = $$('.rv-code span', el);
    makeStepper(el, props.steps.length, (i) => {
      const s = props.steps[i];
      lines.forEach((ln, k) => { ln.className = k === s.line ? 'now' : (k < s.line ? 'done' : ''); });
      $('.ls-step', el).textContent = `第 ${i + 1} ／ ${props.steps.length} 步`;
      $('.rv-vars', el).innerHTML = s.vars.length ? s.vars.map((v) => (v.ref
        ? `<li class="rv-var is-ref"><span class="tag">${esc(v.name)}</span>→ 物件 ${esc(v.ref)}</li>`
        : `<li class="rv-var"><span class="tag">${esc(v.name)}</span>${esc(v.val)}</li>`)).join('') : '<li class="rv-empty">（還沒有變數）</li>';
      $('.rv-objs', el).innerHTML = s.objs.length ? s.objs.map((o) => `<li class="rv-obj${o.changed ? ' changed' : ''}"><span class="tag">${esc(o.id)}</span>${esc(o.text)}${o.changed ? '　← 剛被改' : ''}</li>`).join('') : '<li class="rv-empty">（還沒有物件）</li>';
      $('.rv-note', el).innerHTML = md(s.note || '');
    });
  },
};

/* ---------- coerce：一步一步看轉型 ---------- */
// props: { presets: [{ expr, steps: [文字], result }] }（結果都在 Node.js 22 實測過）
Widgets.coerce = {
  render(props) {
    return `<div class="jw coerce">
      <div class="jw-head"><span class="label" style="--chip:var(--m3)">轉型探索器</span><span class="grow">選一個運算式，看 JavaScript 每一步怎麼轉</span></div>
      <div class="jw-row" role="group" aria-label="運算式">${props.presets.map((p, i) => `<button type="button" class="btn small nb-press mono" data-co="${i}" aria-pressed="false">${esc(p.expr)}</button>`).join('')}</div>
      <ol class="co-steps" aria-live="polite"></ol>
      <div class="co-result" hidden></div>
    </div>`;
  },
  hydrate(el, props) {
    function show(i) {
      const p = props.presets[i];
      $$('[data-co]', el).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.co) === i)));
      $('.co-steps', el).innerHTML = p.steps.map((s) => `<li>${md(s)}</li>`).join('');
      const r = $('.co-result', el);
      r.hidden = false;
      r.textContent = `${p.expr}　→　${p.result}`;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-co]');
      if (b) show(Number(b.dataset.co));
    });
    show(0);
  },
};

/* ---------- mutator：這個方法會不會改到原陣列 ---------- */
// props: { start: [數字], methods: [方法 key] }；方法真的在這裡執行，不是寫死的結果
const MUTATOR_METHODS = {
  'push(4)': (a) => a.push(4),
  'pop()': (a) => a.pop(),
  'sort()': (a) => a.sort(),
  'reverse()': (a) => a.reverse(),
  'splice(1, 1)': (a) => a.splice(1, 1),
  'toSorted()': (a) => a.toSorted(),
  'toReversed()': (a) => a.toReversed(),
  'toSpliced(1, 1)': (a) => a.toSpliced(1, 1),
  'with(0, 99)': (a) => a.with(0, 99),
  'map(x => x * 2)': (a) => a.map((x) => x * 2),
  'filter(x => x > 5)': (a) => a.filter((x) => x > 5),
  'slice(1)': (a) => a.slice(1),
};
const fmtArr = (v) => (Array.isArray(v) ? `[ ${v.join(', ')} ]` : (v === undefined ? 'undefined' : String(v)));
Widgets.mutator = {
  render(props) {
    return `<div class="jw mutator">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">按按看</span><span class="grow">原陣列：<span class="mono">nums = ${esc(fmtArr(props.start))}</span></span><button type="button" class="btn small nb-press" data-mu-reset>重設 nums</button></div>
      <div class="jw-row mu-methods" role="group" aria-label="陣列方法">${props.methods.map((m) => `<button type="button" class="btn small nb-press" data-mu="${esc(m)}">nums.${esc(m)}</button>`).join('')}</div>
      <div class="mu-grid">
        <div class="mu-box mu-ret"><span class="cap">回傳值</span><span class="v">（按一個方法）</span></div>
        <div class="mu-box mu-orig"><span class="cap">之後的 nums</span><span class="v">${esc(fmtArr(props.start))}</span></div>
      </div>
      <p class="jw-note mu-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    let nums = [...props.start];
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-mu-reset]')) {
        nums = [...props.start];
        $('.mu-orig .v', el).textContent = fmtArr(nums);
        $('.mu-orig', el).className = 'mu-box mu-orig';
        $('.mu-ret .v', el).textContent = '（按一個方法）';
        $('.mu-note', el).textContent = '';
        return;
      }
      const b = e.target.closest('[data-mu]');
      if (!b) return;
      const before = fmtArr(nums);
      const ret = MUTATOR_METHODS[b.dataset.mu](nums);
      const after = fmtArr(nums);
      const changed = before !== after;
      $('.mu-ret .v', el).textContent = ret === nums ? `${fmtArr(ret)}（就是 nums 本身）` : fmtArr(ret);
      $('.mu-orig .v', el).textContent = after;
      $('.mu-orig', el).className = `mu-box mu-orig ${changed ? 'changed' : 'kept'}`;
      $('.mu-note', el).textContent = changed ? `✗ nums 被改了：${before} → ${after}` : '✓ nums 沒有變，結果在回傳值裡';
    });
  },
};

/* ---------- thisfinder：this 判定器 ---------- */
// props: { cases: [{ call, rule, result, note }] }；rule 是 THIS_RULES 的索引
const THIS_RULES = [
  '是箭頭函式嗎？→ 沒有自己的 this，用「寫下它的地方」的 this',
  '用 new 呼叫嗎？→ this 是剛建立的新物件',
  '用 call、apply 或 bind 指定了嗎？→ this 是指定的那個值',
  '呼叫時點的左邊有物件嗎（obj.fn()）？→ this 是那個物件',
  '都不是，直接 fn()？→ 嚴格模式（模組、class）裡是 undefined',
];
Widgets.thisfinder = {
  render(props) {
    return `<div class="jw thisfinder">
      <div class="jw-head"><span class="label" style="--chip:var(--m5)">判定器</span><span class="grow">選一種呼叫寫法，由上往下對規則</span></div>
      <div class="jw-row tf-cases" role="group" aria-label="呼叫寫法">${props.cases.map((c, i) => `<button type="button" class="btn small nb-press" data-tf="${i}" aria-pressed="false">${esc(c.call)}</button>`).join('')}</div>
      <ol class="tf-rules">${THIS_RULES.map((r, i) => `<li><span class="n">${i}</span><span>${esc(r)}</span></li>`).join('')}</ol>
      <p class="jw-note tf-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    function show(i) {
      const c = props.cases[i];
      $$('[data-tf]', el).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.tf) === i)));
      $$('.tf-rules li', el).forEach((li, k) => { li.className = k < c.rule ? 'skip' : (k === c.rule ? 'hit' : ''); });
      $('.tf-note', el).innerHTML = `<strong>this 是：${esc(c.result)}</strong>　${md(c.note)}`;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tf]');
      if (b) show(Number(b.dataset.tf));
    });
  },
};

/* ---------- protochain：沿著原型鏈找屬性 ---------- */
// props: { chain: [{ name, props: [屬性名] }], presets: [屬性名] }
Widgets.protochain = {
  render(props, id) {
    return `<div class="jw protochain">
      <div class="jw-head"><span class="label" style="--chip:var(--m5)">查找</span><span class="grow">輸入一個屬性名，看它在哪一層被找到</span></div>
      <div class="jw-row">
        <label for="${id}-k" class="mono">屬性</label>
        <input class="fb-input" id="${id}-k" autocomplete="off" spellcheck="false" value="${esc(props.presets[0])}">
        ${props.presets.map((p) => `<button type="button" class="btn small nb-press mono" data-pc="${esc(p)}">${esc(p)}</button>`).join('')}
      </div>
      <ol class="pc-chain">${props.chain.map((lv, i) => `<li data-lv="${i}"><span class="lvl">${i === 0 ? '物件自己' : `第 ${i} 層原型`}：${esc(lv.name)}</span>${lv.props.map(esc).join('、')}</li>`).join('')}</ol>
      <div class="pc-end">null（原型鏈的盡頭）</div>
      <p class="jw-note pc-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    const input = $('input', el);
    function look() {
      const key = input.value.trim();
      const items = $$('.pc-chain li', el);
      const hit = props.chain.findIndex((lv) => lv.props.includes(key));
      items.forEach((li, i) => { li.className = hit === -1 || i < hit ? 'miss' : (i === hit ? 'found' : ''); });
      $('.pc-end', el).className = `pc-end${hit === -1 ? ' found-none' : ''}`;
      $('.pc-note', el).innerHTML = !key ? '' : (hit === -1
        ? `每一層都沒有 \`${esc(key)}\`，走到 null 還是找不到：讀取結果是 \`undefined\`；如果拿來呼叫，會拋出 \`TypeError: ... is not a function\`。`
        : `在「${esc(props.chain[hit].name)}」找到 \`${esc(key)}\`${hit === 0 ? '：它是物件自己的屬性。' : `，往上找了 ${hit} 層。`}`);
    }
    input.addEventListener('input', look);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pc]');
      if (!b) return;
      input.value = b.dataset.pc;
      look();
    });
    look();
  },
};

/* ---------- loopsim：事件迴圈模擬器 ---------- */
// props: { code: [行], steps: [{ line?, stack: [], micro: [], task: [], out: [], note }] }
Widgets.loopsim = {
  render(props) {
    return `<div class="jw loopsim">
      <div class="jw-head"><span class="label" style="--chip:var(--m6)">模擬器</span><span class="grow">${esc(props.title || '一條執行緒，加上兩條排隊的隊伍')}</span><span class="ls-step" aria-live="polite"></span></div>
      <pre class="ls-code">${props.code.map((l) => `<span>${esc(l) || ' '}</span>`).join('')}</pre>
      ${stepperControls('事件迴圈播放控制')}
      <div class="ls-cols">
        <div class="ls-col stack"><h4>呼叫堆疊（正在做）</h4><ol></ol></div>
        <div class="ls-col micro"><h4>微任務佇列</h4><ol></ol></div>
        <div class="ls-col task"><h4>任務佇列</h4><ol></ol></div>
      </div>
      <pre class="ls-out" aria-label="目前為止的輸出"></pre>
      <p class="jw-note ls-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    const lines = $$('.ls-code span', el);
    const fill = (sel, arr) => { $(`.ls-col.${sel} ol`, el).innerHTML = arr.map((x) => `<li>${esc(x)}</li>`).join(''); };
    makeStepper(el, props.steps.length, (i) => {
      const s = props.steps[i];
      lines.forEach((ln, k) => { ln.className = k === s.line ? 'now' : ''; });
      fill('stack', s.stack);
      fill('micro', s.micro);
      fill('task', s.task);
      $('.ls-out', el).textContent = s.out.length ? s.out.join('\n') : '（還沒有輸出）';
      $('.ls-step', el).textContent = `第 ${i + 1} ／ ${props.steps.length} 步`;
      $('.ls-note', el).innerHTML = md(s.note || '');
    });
  },
};

/* ---------- racer：逐一 await 與 Promise.all 的時間軸 ---------- */
// props: { tasks: [{ name, ms }] }
const RACER_MIN = 100;
const RACER_MAX = 1000;
const RACER_PLAY_MS = 2400;
Widgets.racer = {
  render(props, id) {
    return `<div class="jw racer">
      <div class="jw-head"><span class="label" style="--chip:var(--m6)">拉拉看</span><span class="grow">調整三個請求各要多久，比較兩種寫法</span></div>
      <div class="rc-sliders">${props.tasks.map((t, i) => `<label for="${id}-r${i}"><span>${esc(t.name)}</span><input type="range" id="${id}-r${i}" min="${RACER_MIN}" max="${RACER_MAX}" step="50" value="${t.ms}" data-rc="${i}"><span class="v">${t.ms} ms</span></label>`).join('')}</div>
      <div class="rc-lane"><h4>for 迴圈裡逐一 await：<span class="rc-total" data-total="seq"></span></h4><div class="rc-track" data-lane="seq"></div></div>
      <div class="rc-lane"><h4>先全部發出，再 await Promise.all：<span class="rc-total" data-total="par"></span></h4><div class="rc-track" data-lane="par"></div></div>
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-rc-play>▶ 播放時間流逝</button></div>
    </div>`;
  },
  hydrate(el, props) {
    const ms = props.tasks.map((t) => t.ms);
    const ROW_REM = 1.9;
    function draw() {
      const seqTotal = ms.reduce((a, b) => a + b, 0);
      const parTotal = Math.max(...ms);
      const scale = seqTotal;
      let offset = 0;
      $('[data-lane="seq"]', el).innerHTML = ms.map((m, i) => {
        const html = `<span class="rc-bar b${i}" style="top:calc(${i * ROW_REM}rem + 4px);left:${(offset / scale) * 100}%;width:${(m / scale) * 100}%">${esc(props.tasks[i].name)}</span>`;
        offset += m;
        return html;
      }).join('') + '<span class="rc-head"></span>';
      $('[data-lane="par"]', el).innerHTML = ms.map((m, i) => `<span class="rc-bar b${i}" style="top:calc(${i * ROW_REM}rem + 4px);left:0;width:${(m / scale) * 100}%">${esc(props.tasks[i].name)}</span>`).join('') + '<span class="rc-head"></span>';
      $('[data-total="seq"]', el).textContent = `約 ${seqTotal} ms`;
      $('[data-total="par"]', el).textContent = `約 ${parTotal} ms`;
      $$('[data-rc]', el).forEach((inp, i) => { $('.v', inp.closest('label')).textContent = `${ms[i]} ms`; });
    }
    el.addEventListener('input', (e) => {
      const r = e.target.closest('[data-rc]');
      if (!r) return;
      ms[Number(r.dataset.rc)] = Number(r.value);
      draw();
    });
    const playBtn = $('[data-rc-play]', el);
    if (prefersReducedMotion()) { playBtn.disabled = true; playBtn.textContent = '已關閉動態效果（看上面的長條即可）'; }
    playBtn.addEventListener('click', () => {
      const seqTotal = ms.reduce((a, b) => a + b, 0);
      $$('.rc-track', el).forEach((track) => {
        const head = $('.rc-head', track);
        const lane = track.dataset.lane;
        const end = lane === 'seq' ? seqTotal : Math.max(...ms);
        const width = track.clientWidth * (end / seqTotal);
        head.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${width}px)` }], { duration: RACER_PLAY_MS * (end / seqTotal), easing: 'linear', fill: 'forwards' });
      });
    });
    draw();
  },
};

/* ---------- bubble：事件從目標往外冒泡 ---------- */
// props: { levels: ['div#outer', 'ul#list', 'li', 'button#btn'] }（由外到內）
const BUBBLE_STEP_MS = 450;
Widgets.bubble = {
  render(props) {
    const nest = (i) => (i >= props.levels.length ? '' : `<div class="bb-box" data-bb="${i}"><span class="nm">${esc(props.levels[i])}</span>${i === props.levels.length - 1 ? '<button type="button" class="btn small nb-press" data-bb-click>點我</button>' : nest(i + 1)}</div>`);
    return `<div class="jw bubble">
      <div class="jw-head"><span class="label" style="--chip:var(--m8)">點點看</span><span class="grow">每一層都掛了 click 監聽器</span>
        <label class="jw-row"><input type="checkbox" data-bb-stop> 在 ${esc(props.levels[1])} 呼叫 stopPropagation()</label></div>
      <div class="bb-stage">${nest(0)}</div>
      <ol class="bb-log" aria-live="polite"></ol>
    </div>`;
  },
  hydrate(el, props) {
    const boxes = $$('.bb-box', el);
    const stop = $('[data-bb-stop]', el);
    let order = [];
    boxes.forEach((box) => {
      box.addEventListener('click', (e) => {
        // 最內層第一個收到事件：等這次分派全部跑完（可能中途被擋下），再把記下來的順序播出來
        if (!order.length) window.setTimeout(replay, 0);
        order.push({ i: Number(box.dataset.bb) });
        if (stop.checked && Number(box.dataset.bb) === 1) e.stopPropagation();
      });
    });
    function replay() {
      const seq = order;
      order = [];
      const log = $('.bb-log', el);
      log.innerHTML = '';
      boxes.forEach((b) => b.classList.remove('lit', 'target'));
      const reduced = prefersReducedMotion();
      seq.forEach((hit, k) => {
        const show = () => {
          boxes[hit.i].classList.add(k === 0 ? 'target' : 'lit');
          const li = document.createElement('li');
          li.textContent = `${props.levels[hit.i]} 的監聽器執行${k === 0 ? '（這裡是 event.target）' : ''}`;
          log.appendChild(li);
        };
        if (reduced) show(); else window.setTimeout(show, k * BUBBLE_STEP_MS);
      });
      const tail = () => {
        if (stop.checked && seq.length < props.levels.length) {
          const li = document.createElement('li');
          li.textContent = `在 ${props.levels[1]} 被 stopPropagation() 擋下，外層不會收到`;
          log.appendChild(li);
        }
      };
      if (reduced) tail(); else window.setTimeout(tail, seq.length * BUBBLE_STEP_MS);
    }
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

/* ---------- herodemo：首頁的第一個預測 ---------- */
const HERO_RUNNER = {
  title: '這門課的第一個問題',
  code: 'console.log(0.1 + 0.2 === 0.3);\nconsole.log(0.1 + 0.2);',
  predict: { q: '第一行會印出什麼？', options: ['true', 'false'], answer: 1 },
};
Widgets.herodemo = {
  render(props, id) { return Widgets.runner.render(HERO_RUNNER, id); },
  hydrate(el) { Widgets.runner.hydrate(el, HERO_RUNNER); },
};
