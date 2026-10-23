
/* ==========================================================================
   AI 系列的互動元件（從第一部沿用，各卷再加自己的）
   每個元件：render(props, id) 只產生字串；hydrate(el, props) 才綁事件
   頁面裡沒有 API 金鑰、不會真的呼叫 API：所有回應都是預錄或模擬的
   ========================================================================== */

/* ---------- 共用：逐步播放控制（上一步、播放／暫停、下一步、重設） ---------- */
const STEP_MS = 2400;
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

/* 按鈕組（aria-pressed 單選） */
function chipGroup(label, items, attr, current) {
  return `<div class="jw-row" role="group" aria-label="${esc(label)}">${items.map(([value, text]) => `<button type="button" class="btn small nb-press" ${attr}="${esc(value)}" aria-pressed="${String(value === current)}">${esc(text)}</button>`).join('')}</div>`;
}
function pressOnly(el, attr, value) {
  $$(`[${attr}]`, el).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === String(value))));
}

/* ---------- 價格表（research-notes.md 1.1，查證於 2026-10-22，美元／百萬 token） ---------- */
const TOKENS_PER_MILLION = 1e6;
const CACHE_WRITE_5M_MULTIPLIER = 1.25;
const BATCH_DISCOUNT = 0.5;
const HAIKU_LONG_PROMPT_TOKENS = 100000;
const MODEL_PRICES = {
  'claude-fable-5-1': { name: 'Claude Fable 5.1', input: 10, output: 50, cacheRead: 0.25 },
  'claude-opus-5-5': { name: 'Claude Opus 5.5', input: 4, output: 20, cacheRead: 0.20 },
  'claude-sonnet-5-5': { name: 'Claude Sonnet 5.5', input: 2, output: 10, cacheRead: 0.10 },
  'claude-haiku-5-5': { name: 'Claude Haiku 5.5', input: 0.10, output: 0.50, cacheRead: 0.01, long: { input: 0.50, output: 2.50, cacheRead: 0.05 } },
};
/* Haiku 5.5 的 prompt 超過 10 萬 token 時整個請求改用較高的價格 */
function priceFor(modelId, promptTokens) {
  const p = MODEL_PRICES[modelId];
  return p.long && promptTokens > HAIKU_LONG_PROMPT_TOKENS ? { ...p, ...p.long } : p;
}
function formatUsd(value) {
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(5)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}
function formatTokens(n) { return Math.round(n).toLocaleString('en-US'); }

/* ---------- reqbuilder：組一個 API 請求，看會不會被擋 ---------- */
// props: { title, endpoint, fields: [{ key, value, on, required, label, note, breaks, options: [值] }], extraHeaders }
// breaks：這個欄位開著時 API 會回的錯誤訊息（模擬）；required：關掉時會回的錯誤
Widgets.reqbuilder = {
  render(props, id) {
    return `<div class="jw rq">
      <div class="jw-head"><span class="label" style="--chip:var(--info)">請求組裝器</span><span class="grow">${esc(props.title || '勾選欄位，看請求長什麼樣子')}</span></div>
      <div class="rq-grid">
        <fieldset class="rq-fields"><legend class="visually-hidden">請求欄位</legend>
          ${props.fields.map((f, i) => `<div class="rq-field" data-i="${i}">
            <label class="rq-check"><input type="checkbox" data-rq-on="${i}" ${f.on ? 'checked' : ''}><code>${esc(f.key)}</code>${f.required ? '<span class="rq-req">必填</span>' : ''}</label>
            ${f.options ? `<label class="visually-hidden" for="${id}-o${i}">${esc(f.key)} 的值</label><select class="fb-input rq-select" id="${id}-o${i}" data-rq-val="${i}">${f.options.map((o) => `<option value="${esc(JSON.stringify(o))}" ${JSON.stringify(o) === JSON.stringify(f.value) ? 'selected' : ''}>${esc(typeof o === 'string' ? o : JSON.stringify(o))}</option>`).join('')}</select>` : ''}
            ${f.note ? `<p class="rq-note">${md(f.note)}</p>` : ''}
          </div>`).join('')}
        </fieldset>
        <div class="rq-out">
          <div class="rq-endpoint"><span class="label" style="--chip:var(--m1)">POST</span><code>${esc(props.endpoint || '/v1/messages')}</code></div>
          <pre class="rq-json" tabindex="0" aria-label="請求內容（JSON）"></pre>
          <p class="rq-verdict" aria-live="polite"></p>
        </div>
      </div>
    </div>`;
  },
  hydrate(el, props) {
    const state = props.fields.map((f) => ({ on: !!f.on, value: f.value }));
    const pre = $('.rq-json', el);
    const verdict = $('.rq-verdict', el);
    function draw() {
      const body = {};
      state.forEach((s, i) => { if (s.on) body[props.fields[i].key] = s.value; });
      pre.textContent = JSON.stringify(body, null, 2);
      const errors = [];
      props.fields.forEach((f, i) => {
        if (f.required && !state[i].on) errors.push(f.required === true ? `缺少必填欄位 ${f.key}` : f.required);
        if (state[i].on && f.breaks) {
          const msg = typeof f.breaks === 'function' ? f.breaks(state[i].value) : f.breaks;
          if (msg) errors.push(msg);
        }
      });
      verdict.className = `rq-verdict ${errors.length ? 'is-bad' : 'is-ok'}`;
      verdict.innerHTML = errors.length
        ? `<strong>✗ 400 invalid_request_error</strong><br>${errors.map((e) => md(e)).join('<br>')}`
        : '<strong>✓ 格式正確，可以送出</strong>（這裡只檢查格式，不會真的送出）';
      $$('.rq-field', el).forEach((row, i) => row.classList.toggle('is-off', !state[i].on));
    }
    el.addEventListener('change', (e) => {
      const on = e.target.closest('[data-rq-on]');
      if (on) state[Number(on.dataset.rqOn)].on = on.checked;
      const val = e.target.closest('[data-rq-val]');
      if (val) state[Number(val.dataset.rqVal)].value = JSON.parse(val.value);
      draw();
    });
    draw();
  },
};

/* ---------- tokenmeter：把文字切成「像 token 的片段」 ---------- */
// 示意用的切法，不是任何模型真正的 tokenizer：英數每 4 個字元左右一段、中文每 1 字一段、標點各自一段。
// 真正的數字一律用 count_tokens 量（1-4）。
const LATIN_PIECE = 4;
function pseudoTokens(text) {
  const out = [];
  const re = /(\s+)|([A-Za-z]+)|(\d+)|([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])|(.)/gu;
  let m;
  while ((m = re.exec(text))) {
    const [all, space, word, digits] = m;
    if (space) { if (out.length) out[out.length - 1] += ' '; continue; }
    const run = word || digits;
    if (run) { for (let i = 0; i < run.length; i += LATIN_PIECE) out.push(run.slice(i, i + LATIN_PIECE)); continue; }
    out.push(all);
  }
  return out;
}
Widgets.tokenmeter = {
  render(props, id) {
    return `<div class="jw tk">
      <div class="jw-head"><span class="label" style="--chip:var(--m1)">token 示意切法</span><span class="grow">輸入文字，看它大概被切成幾段</span></div>
      ${props.presets ? chipGroup('範例文字', props.presets.map((p, i) => [String(i), p.label]), 'data-tk-preset', '0') : ''}
      <label for="${id}-in">文字</label>
      <textarea class="fb-input tk-in" id="${id}-in" rows="3" spellcheck="false"></textarea>
      <div class="tk-chips" aria-hidden="true"></div>
      <p class="tk-sum" aria-live="polite"></p>
      <p class="jw-note">${md('這是**示意**的切法，不是任何模型真正的 tokenizer。同一段文字在不同模型的 token 數不一樣；要算錢時用 API 的 `count_tokens` 量。')}</p>
    </div>`;
  },
  hydrate(el, props) {
    const input = $('.tk-in', el);
    const chips = $('.tk-chips', el);
    const sum = $('.tk-sum', el);
    const MAX_CHIPS = 120;
    function draw() {
      const parts = pseudoTokens(input.value);
      const shown = parts.slice(0, MAX_CHIPS);
      chips.innerHTML = shown.map((p, i) => `<span class="tk-chip" style="--c:var(--m${i % 6})">${esc(p.replace(/ /g, '·'))}</span>`).join('') + (parts.length > MAX_CHIPS ? `<span class="tk-more">…還有 ${parts.length - MAX_CHIPS} 段</span>` : '');
      const chars = [...input.value].length;
      sum.innerHTML = md(`**${chars}** 個字元 → 示意切成 **${parts.length}** 段`);
    }
    function load(i) { input.value = props.presets[i].text; pressOnly(el, 'data-tk-preset', i); draw(); }
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-tk-preset]'); if (b) load(Number(b.dataset.tkPreset)); });
    input.addEventListener('input', draw);
    if (props.presets) load(0); else { input.value = props.text || ''; draw(); }
  },
};

/* ---------- costcalc：每月要花多少錢 ---------- */
// props: { model, requestsPerDay, input, output, prefix, hitRate, batch, show: ['cache','batch','storage'] }
const DAYS_PER_MONTH = 30;
// 數量級差很多的值（請求數、token 數）用對數刻度：拉桿位置 0–LOG_STEPS 對應 min–max 的等比數列
const LOG_STEPS = 1000;
const COST_SLIDERS = [
  { key: 'requestsPerDay', label: '每天請求數', min: 10, max: 1000000, log: true, unit: '次' },
  { key: 'input', label: '每次輸入 token', min: 100, max: 500000, log: true, unit: 'token' },
  { key: 'output', label: '每次輸出 token', min: 50, max: 32000, log: true, unit: 'token' },
];
const CACHE_SLIDERS = [
  { key: 'prefix', label: '其中固定不變的前綴', min: 0, max: 100, step: 5, unit: '% 的輸入' },
  { key: 'hitRate', label: '快取命中率', min: 0, max: 100, step: 5, unit: '%' },
];
/* 對數刻度的整數取到 2 位有效數字，數字比較好讀 */
function roundNice(value) {
  if (value < 100) return Math.round(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}
const toSlider = (s, value) => (s.log ? Math.round((Math.log(value / s.min) / Math.log(s.max / s.min)) * LOG_STEPS) : value);
const fromSlider = (s, pos) => (s.log ? roundNice(s.min * (s.max / s.min) ** (pos / LOG_STEPS)) : pos);
function sliderRow(id, s, value) {
  return `<div class="lv-row">
    <label for="${id}-${s.key}">${esc(s.label)}：<output data-out="${s.key}">${formatTokens(value)}</output> ${esc(s.unit)}</label>
    <input type="range" id="${id}-${s.key}" data-cc="${s.key}" min="${s.log ? 0 : s.min}" max="${s.log ? LOG_STEPS : s.max}" step="${s.log ? 1 : s.step}" value="${toSlider(s, value)}">
  </div>`;
}
Widgets.costcalc = {
  render(props, id) {
    const v = { requestsPerDay: 1000, input: 2000, output: 500, prefix: 0, hitRate: 0, ...props };
    const show = props.show || [];
    return `<div class="jw cc">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">成本計算器</span><span class="grow">價格查證於 ${esc(SITE.verifiedOn)}</span></div>
      ${chipGroup('模型', Object.entries(MODEL_PRICES).map(([k, p]) => [k, p.name]), 'data-cc-model', v.model || 'claude-opus-5-5')}
      <div class="lv-sliders">
        ${COST_SLIDERS.map((s) => sliderRow(id, s, v[s.key])).join('')}
        ${show.includes('cache') ? CACHE_SLIDERS.map((s) => sliderRow(id, s, v[s.key])).join('') : ''}
      </div>
      ${show.includes('batch') ? `<label class="rq-check"><input type="checkbox" data-cc-batch ${v.batch ? 'checked' : ''}>用 Batch API（非即時，輸入輸出都 5 折）</label>` : ''}
      <div class="cc-bars" aria-hidden="true"></div>
      <div class="cc-out" aria-live="polite"></div>
    </div>`;
  },
  hydrate(el, props) {
    const v = { requestsPerDay: 1000, input: 2000, output: 500, prefix: 0, hitRate: 0, batch: false, model: 'claude-opus-5-5', ...props };
    function draw() {
      const prefix = Math.round((v.input * v.prefix) / 100);
      const p = priceFor(v.model, v.input);
      const hit = v.hitRate / 100;
      const discount = v.batch ? BATCH_DISCOUNT : 1;
      const parts = {
        fresh: ((v.input - prefix) * p.input) / TOKENS_PER_MILLION,
        cacheRead: (prefix * hit * p.cacheRead) / TOKENS_PER_MILLION,
        cacheWrite: (prefix * (1 - hit) * p.input * CACHE_WRITE_5M_MULTIPLIER) / TOKENS_PER_MILLION,
        output: (v.output * p.output) / TOKENS_PER_MILLION,
      };
      // 沒開快取時，前綴照一般輸入價計
      if (!(props.show || []).includes('cache')) { parts.fresh = (v.input * p.input) / TOKENS_PER_MILLION; parts.cacheRead = 0; parts.cacheWrite = 0; }
      Object.keys(parts).forEach((k) => { parts[k] *= discount; });
      const perRequest = Object.values(parts).reduce((a, b) => a + b, 0);
      const perMonth = perRequest * v.requestsPerDay * DAYS_PER_MONTH;
      const rows = [['輸入（一般）', parts.fresh, 'var(--m2)'], ['快取寫入', parts.cacheWrite, 'var(--m5)'], ['快取讀取', parts.cacheRead, 'var(--m3)'], ['輸出', parts.output, 'var(--m7)']].filter((r) => r[1] > 0);
      $('.cc-bars', el).innerHTML = `<div class="cc-stack">${rows.map(([label, value, color]) => `<span style="--w:${(value / perRequest) * 100}%;--c:${color}" title="${esc(label)}"></span>`).join('')}</div>
        <div class="cc-legend">${rows.map(([label, value, color]) => `<span><i style="--c:${color}"></i>${esc(label)} ${Math.round((value / perRequest) * 100)}%</span>`).join('')}</div>`;
      $('.cc-out', el).innerHTML = `<div class="cc-big"><span>每次請求</span><strong>${formatUsd(perRequest)}</strong></div>
        <div class="cc-big"><span>每月（${DAYS_PER_MONTH} 天）</span><strong>${formatUsd(perMonth)}</strong></div>
        ${p.long && v.input > HAIKU_LONG_PROMPT_TOKENS ? '<p class="jw-note">輸入超過 10 萬 token，Haiku 5.5 整個請求改用較高的價格。</p>' : ''}`;
      Object.keys(v).forEach((k) => { const out = $(`[data-out="${k}"]`, el); if (out) out.textContent = formatTokens(v[k]); });
    }
    el.addEventListener('input', (e) => {
      const s = e.target.closest('[data-cc]');
      if (!s) return;
      const def = [...COST_SLIDERS, ...CACHE_SLIDERS].find((x) => x.key === s.dataset.cc);
      v[s.dataset.cc] = fromSlider(def, Number(s.value));
      draw();
    });
    el.addEventListener('change', (e) => { if (e.target.closest('[data-cc-batch]')) { v.batch = e.target.checked; draw(); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cc-model]');
      if (!b) return;
      v.model = b.dataset.ccModel;
      pressOnly(el, 'data-cc-model', v.model);
      draw();
    });
    draw();
  },
};

/* ---------- ssestream：串流回應，原始 SSE 與畫面同步（真的有資料逐筆流過，所以用動畫） ---------- */
// props: { text, chunks?, view: 'raw'|'compare'|'ui', abortable, failAt, ttft, gap, inputTokens, title }
const SSE_DEFAULT_TTFT_MS = 700;
const SSE_DEFAULT_GAP_MS = 110;
const SSE_CHUNK_CHARS = 3;
function splitChunks(text) {
  const out = [];
  let buf = '';
  [...text].forEach((ch) => {
    buf += ch;
    if (buf.length >= SSE_CHUNK_CHARS || /[，。！？、\n]/.test(ch)) { out.push(buf); buf = ''; }
  });
  if (buf) out.push(buf);
  return out;
}
function sseEvents(props, chunks) {
  const inputTokens = props.inputTokens || 42;
  const outputTokens = chunks.length;
  const ev = (event, data) => ({ event, data: JSON.stringify(data) });
  return [
    ev('message_start', { type: 'message_start', message: { id: 'msg_01Demo', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], usage: { input_tokens: inputTokens, output_tokens: 1 } } }),
    ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    ev('ping', { type: 'ping' }),
    ...chunks.map((t) => ({ ...ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }), text: t })),
    ev('content_block_stop', { type: 'content_block_stop', index: 0 }),
    ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } }),
    ev('message_stop', { type: 'message_stop' }),
  ];
}
Widgets.ssestream = {
  render(props) {
    const view = props.view || 'raw';
    const screen = (cls, label) => `<div class="ss-pane ${cls}"><div class="ss-pane-head"><span>${esc(label)}</span><span class="ss-time" data-time></span></div><div class="ss-screen" aria-live="off"></div></div>`;
    return `<div class="jw ss" data-view="${view}">
      <div class="jw-head"><span class="label" style="--chip:var(--m2)">串流播放器</span><span class="grow">${esc(props.title || '一個回應，一行一行送過來')}</span></div>
      <div class="tw-controls" role="group" aria-label="串流控制">
        <button type="button" class="btn small primary nb-press" data-ss="play">▶ 送出請求</button>
        <button type="button" class="btn small nb-press" data-ss="step">下一個事件</button>
        ${props.abortable ? '<button type="button" class="btn small danger nb-press" data-ss="stop" disabled>■ 停止生成</button>' : ''}
        <button type="button" class="btn small nb-press" data-ss="reset">重設</button>
      </div>
      <div class="ss-panes">
        ${view === 'compare' ? `${screen('ss-ui', '串流：邊產生邊顯示')}${screen('ss-whole', '不串流：全部好了才顯示')}` : ''}
        ${view === 'raw' ? `<div class="ss-pane ss-raw-pane"><div class="ss-pane-head"><span>原始 SSE（text/event-stream）</span><span class="ss-count" data-count></span></div><pre class="ss-raw" tabindex="0" aria-label="原始事件"></pre></div>${screen('ss-ui', '使用者看到的畫面')}` : ''}
        ${view === 'ui' ? screen('ss-ui', '使用者看到的畫面') : ''}
      </div>
      <p class="tw-note ss-status" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    const chunks = props.chunks || splitChunks(props.text);
    const events = sseEvents(props, chunks);
    const ttft = props.ttft || SSE_DEFAULT_TTFT_MS;
    const gap = props.gap || SSE_DEFAULT_GAP_MS;
    const ui = $('.ss-ui .ss-screen', el);
    const whole = $('.ss-whole .ss-screen', el);
    const raw = $('.ss-raw', el);
    const status = $('.ss-status', el);
    const playBtn = $('[data-ss="play"]', el);
    const stopBtn = $('[data-ss="stop"]', el);
    const reduced = prefersReducedMotion();
    let i = 0;
    let timer = null;
    let clock = 0;
    let firstAt = null;
    let ended = false;
    let shown = '';
    // 事件在虛擬時間軸上的時刻：第一個 delta 之前等 ttft，之後每個 delta 間隔 gap
    const firstDelta = events.findIndex((e) => e.event === 'content_block_delta');
    const timeOf = (k) => (k < firstDelta ? Math.round((ttft * k) / firstDelta) : ttft + (k - firstDelta) * gap);
    const seconds = (ms) => `${(ms / 1000).toFixed(1)} 秒`;
    if (reduced) { playBtn.disabled = true; playBtn.textContent = '自動播放已關閉'; playBtn.title = '你的系統開啟了「減少動態效果」，請用「下一個事件」逐步觀看'; }
    function setTime(sel, text) { const t = $(`${sel} [data-time]`, el); if (t) t.textContent = text; }
    function finish(kind) {
      window.clearTimeout(timer);
      timer = null;
      ended = true;
      if (stopBtn) stopBtn.disabled = true;
      $('[data-ss="step"]', el).disabled = true;
      playBtn.disabled = reduced;
      if (!reduced) playBtn.textContent = '▶ 再送一次';
      ui.classList.remove('is-typing');
      if (kind === 'done') {
        status.innerHTML = md(`完成：第一個字在 **${seconds(firstAt ?? ttft)}** 出現，全部在 **${seconds(clock)}** 收完。\`stop_reason\` 是 \`end_turn\`。`);
        if (whole) { whole.textContent = shown; setTime('.ss-whole', `${seconds(clock)} 才出現`); }
      } else if (kind === 'stopped') {
        status.innerHTML = md(`你在 **${seconds(clock)}** 按了停止：畫面停在已收到的 ${shown.length} 個字。伺服器已經產生的部分照樣計費；沒有收到 \`message_delta\`，所以拿不到 \`stop_reason\`。`);
        ui.insertAdjacentHTML('beforeend', '<span class="ss-flag">已停止</span>');
      } else {
        status.innerHTML = md(`連線在 **${seconds(clock)}** 中斷：收到一半的文字還在畫面上，但沒有 \`message_stop\`。程式要能分辨「正常結束」和「被切斷」，並讓使用者重試。`);
        ui.insertAdjacentHTML('beforeend', '<span class="ss-flag is-bad">連線中斷</span>');
      }
    }
    function emit() {
      const e = events[i];
      clock = timeOf(i);
      if (raw) {
        raw.insertAdjacentHTML('beforeend', `<span class="ss-line${e.text ? ' is-delta' : ''}"><span class="k">event:</span> ${esc(e.event)}\n<span class="k">data:</span> ${esc(e.data)}\n\n</span>`);
        raw.scrollTop = raw.scrollHeight;
        const c = $('[data-count]', el);
        if (c) c.textContent = `第 ${i + 1} / ${events.length} 個事件`;
      }
      if (e.text) {
        if (firstAt == null) firstAt = clock;
        shown += e.text;
        ui.textContent = shown;
        ui.classList.add('is-typing');
      }
      setTime('.ss-ui', firstAt == null ? `等待中 ${seconds(clock)}` : `第一個字 ${seconds(firstAt)}`);
      if (whole && !ended) { whole.innerHTML = '<span class="ss-wait">等待完整回應…</span>'; setTime('.ss-whole', `等待中 ${seconds(clock)}`); }
      status.innerHTML = md(`收到 \`${e.event}\`${e.text ? `：多了「${e.text.replace(/\n/g, '↵')}」` : ''}`);
      i += 1;
      if (props.failAt != null && i > firstDelta + props.failAt && e.text) { finish('failed'); return false; }
      if (i >= events.length) { finish('done'); return false; }
      return true;
    }
    function tick() {
      if (!document.body.contains(el)) return;
      if (!emit()) return;
      timer = window.setTimeout(tick, Math.max(16, timeOf(i) - timeOf(i - 1)));
    }
    function reset() {
      window.clearTimeout(timer);
      timer = null;
      i = 0; clock = 0; firstAt = null; ended = false; shown = '';
      ui.textContent = ''; ui.classList.remove('is-typing');
      if (raw) raw.textContent = '';
      if (whole) whole.textContent = '';
      $$('[data-time], [data-count]', el).forEach((t) => { t.textContent = ''; });
      $('[data-ss="step"]', el).disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      playBtn.disabled = reduced;
      if (!reduced) playBtn.textContent = '▶ 送出請求';
      status.textContent = '按「送出請求」開始；也可以按「下一個事件」一次看一個。';
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ss]');
      if (!b) return;
      const action = b.dataset.ss;
      if (action === 'reset') { reset(); return; }
      if (action === 'stop') { if (!ended && i > 0) finish('stopped'); return; }
      if (ended) reset();
      if (action === 'play') {
        playBtn.disabled = true;
        if (stopBtn) stopBtn.disabled = false;
        $('[data-ss="step"]', el).disabled = true;
        timer = window.setTimeout(tick, 0);
      }
      if (action === 'step') { if (stopBtn) stopBtn.disabled = false; emit(); }
    });
    window.addEventListener('hashchange', () => window.clearTimeout(timer), { once: true });
    reset();
  },
};

/* ---------- schemacheck：模型輸出的 JSON 對得上 schema 嗎 ---------- */
// props: { schema: { name, fields: [{ name, type: 'string'|'number'|'integer'|'boolean'|'array'|'object', required, enum, items }] }, presets: [{ label, json, note }] }
function typeOfJson(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}
function checkAgainstSchema(obj, schema) {
  const issues = [];
  if (typeOfJson(obj) !== 'object') return [`最外層要是物件（object），收到的是 ${typeOfJson(obj)}`];
  schema.fields.forEach((f) => {
    if (!(f.name in obj)) { if (f.required) issues.push(`缺少必填欄位 \`${f.name}\``); return; }
    const v = obj[f.name];
    const t = typeOfJson(v);
    const isOk = f.type === 'number' ? (t === 'number' || t === 'integer') : t === f.type;
    if (!isOk) { issues.push(`\`${f.name}\` 應該是 ${f.type}，收到 ${t}（${JSON.stringify(v)}）`); return; }
    if (f.enum && !f.enum.includes(v)) issues.push(`\`${f.name}\` 只能是 ${f.enum.map((x) => JSON.stringify(x)).join('、')}，收到 ${JSON.stringify(v)}`);
    if (f.type === 'array' && f.items) v.forEach((x, k) => { if (typeOfJson(x) !== f.items) issues.push(`\`${f.name}[${k}]\` 應該是 ${f.items}`); });
  });
  Object.keys(obj).filter((k) => !schema.fields.some((f) => f.name === k)).forEach((k) => issues.push(`多了 schema 沒有的欄位 \`${k}\`（additionalProperties: false）`));
  return issues;
}
Widgets.schemacheck = {
  render(props, id) {
    const s = props.schema;
    return `<div class="jw sc">
      <div class="jw-head"><span class="label" style="--chip:var(--m3)">schema 檢查器</span><span class="grow">改改看模型的輸出，看哪裡過不了</span></div>
      <div class="sc-grid">
        <div class="sc-schema"><span class="sc-cap">schema：${esc(s.name || '輸出格式')}</span>
          <ul>${s.fields.map((f) => `<li><code>${esc(f.name)}</code> <span class="sc-type">${esc(f.type)}${f.items ? `&lt;${esc(f.items)}&gt;` : ''}${f.enum ? `：${esc(f.enum.join(' | '))}` : ''}</span>${f.required ? '<span class="rq-req">必填</span>' : ''}</li>`).join('')}</ul>
        </div>
        <div class="sc-edit">
          ${props.presets ? chipGroup('模型輸出範例', props.presets.map((p, i) => [String(i), p.label]), 'data-sc-preset', '0') : ''}
          <label for="${id}-in">模型的輸出</label>
          <textarea class="fb-input mono sc-in" id="${id}-in" rows="7" spellcheck="false"></textarea>
        </div>
      </div>
      <div class="sc-result" aria-live="polite"></div>
    </div>`;
  },
  hydrate(el, props) {
    const input = $('.sc-in', el);
    const out = $('.sc-result', el);
    function draw(note) {
      let issues;
      try {
        issues = checkAgainstSchema(JSON.parse(input.value), props.schema);
      } catch (err) {
        issues = [`不是合法的 JSON：${err.message}`];
      }
      out.className = `sc-result ${issues.length ? 'is-bad' : 'is-ok'}`;
      out.innerHTML = (issues.length
        ? `<strong>✗ 驗證失敗（${issues.length} 項）</strong><ul>${issues.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`
        : '<strong>✓ 通過：可以安心交給後面的程式</strong>') + (note ? `<p class="jw-note">${md(note)}</p>` : '');
    }
    function load(i) { const p = props.presets[i]; input.value = p.json; pressOnly(el, 'data-sc-preset', i); draw(p.note); }
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-sc-preset]'); if (b) load(Number(b.dataset.scPreset)); });
    input.addEventListener('input', () => { pressOnly(el, 'data-sc-preset', -1); draw(); });
    if (props.presets) load(0); else draw();
  },
};

/* ---------- toolloop：工具迴圈逐步走過（使用者自己按下一步） ---------- */
// props: { lanes: [名稱 ×3], steps: [{ from, to, label, msg?, note }], alt?: { label, steps }, mainLabel }
// from／to 是 lanes 的索引；from === to 代表在那一方內部做事
const TL_LANE_COLORS = ['var(--m0)', 'var(--m2)', 'var(--m4)'];
function toolloopBody(lanes) {
  return `${stepperControls('工具迴圈控制')}
    <div class="tl-grid">
      <div class="tl-lanes" style="--n:${lanes.length}"><span></span>${lanes.map((l, i) => `<span class="tl-lane" style="--c:${TL_LANE_COLORS[i]}">${esc(l)}</span>`).join('')}</div>
      <ol class="tl-rows" style="--n:${lanes.length}"></ol>
    </div>
    <div class="tl-side">
      <p class="tw-note tl-note" aria-live="polite"></p>
      <div class="tl-msgs"><span class="sc-cap">messages 陣列目前的樣子</span><pre class="tl-pre" tabindex="0" aria-label="messages 陣列"></pre></div>
    </div>`;
}
Widgets.toolloop = {
  render(props) {
    return `<div class="jw tl">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">工具迴圈</span><span class="grow">${esc(props.title || '一步一步看訊息怎麼來回')}</span></div>
      ${props.alt ? chipGroup('情境', [['main', props.mainLabel || '一切順利'], ['alt', props.alt.label]], 'data-tl-mode', 'main') : ''}
      <div class="tl-body"></div>
    </div>`;
  },
  hydrate(el, props) {
    const lanes = props.lanes || ['你的程式', 'Claude（API）', '工具'];
    // 換情境時換掉整個內層節點，舊的事件監聽跟著舊節點一起丟掉
    function mount(mode) {
      const steps = mode === 'alt' ? props.alt.steps : props.steps;
      const body = document.createElement('div');
      body.className = 'tl-body';
      body.innerHTML = toolloopBody(lanes);
      $('.tl-body', el).replaceWith(body);
      const rows = $('.tl-rows', body);
      const note = $('.tl-note', body);
      const pre = $('.tl-pre', body);
      function row(s, k, isNow) {
        const a = Math.min(s.from, s.to);
        const b = Math.max(s.from, s.to);
        const dir = s.from === s.to ? 'self' : (s.from < s.to ? 'r' : 'l');
        return `<li class="tl-row${isNow ? ' is-now' : ''}${s.isError ? ' is-error' : ''}"><span class="tl-n">${k + 1}</span><span class="tl-arrow" data-dir="${dir}" style="grid-column:${a + 2} / ${b + 3}">${esc(s.label)}</span></li>`;
      }
      makeStepper(body, steps.length, (step) => {
        rows.innerHTML = steps.slice(0, step + 1).map((s, k) => row(s, k, k === step)).join('');
        note.innerHTML = `<span class="step">步驟 ${step + 1} / ${steps.length}</span>${md(steps[step].note || '')}`;
        const msgs = steps.slice(0, step + 1).filter((s) => s.msg).map((s) => s.msg);
        pre.textContent = msgs.length ? `[\n${msgs.map((m) => `  ${m.replace(/\n/g, '\n  ')}`).join(',\n')}\n]` : '[]';
        pre.scrollTop = pre.scrollHeight;
      });
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tl-mode]');
      if (!b) return;
      pressOnly(el, 'data-tl-mode', b.dataset.tlMode);
      mount(b.dataset.tlMode);
    });
    mount('main');
  },
};

/* ---------- vecplot：二維向量平面，拖動查詢點看相似度 ---------- */
// props: { points: [{ label, x, y, group? }], query: { label, x, y }, k, metrics?: ['cosine','dot','euclid'], filters?: [{ id, label }] }
// 座標在 -1～1 之間；真正的 embedding 有上千維，這裡只畫兩維示意
const VP_SIZE = 400;
const VP_CENTER = VP_SIZE / 2;
const VP_SCALE = 165;
const METRIC_TEXT = { cosine: 'cosine 相似度', dot: '點積', euclid: '歐氏距離' };
const toPx = (v) => VP_CENTER + v * VP_SCALE;
const toPy = (v) => VP_CENTER - v * VP_SCALE;
function vecScore(metric, a, b) {
  const dot = a.x * b.x + a.y * b.y;
  if (metric === 'dot') return dot;
  if (metric === 'euclid') return Math.hypot(a.x - b.x, a.y - b.y);
  const norm = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return norm ? dot / norm : 0;
}
Widgets.vecplot = {
  render(props) {
    const metrics = props.metrics || ['cosine'];
    return `<div class="jw vp">
      <div class="jw-head"><span class="label" style="--chip:var(--m5)">向量平面</span><span class="grow">黃色的「問」是查詢「${esc(props.query.label)}」：拖動它，或按 Tab 選到它再用方向鍵移動</span></div>
      ${metrics.length > 1 ? chipGroup('相似度算法', metrics.map((m) => [m, METRIC_TEXT[m]]), 'data-vp-metric', metrics[0]) : ''}
      ${props.filters ? `<div class="jw-row" role="group" aria-label="只搜尋這一類">${props.filters.map((f) => `<button type="button" class="btn small nb-press" data-vp-filter="${esc(f.id)}" aria-pressed="false">只看${esc(f.label)}</button>`).join('')}</div>` : ''}
      <div class="vp-grid">
        <svg class="vp-svg" viewBox="0 0 ${VP_SIZE} ${VP_SIZE}" role="img" aria-label="二維向量平面：每個點是一段文字，查詢點可以拖動">
          <line class="vp-axis" x1="0" y1="${VP_CENTER}" x2="${VP_SIZE}" y2="${VP_CENTER}"/><line class="vp-axis" x1="${VP_CENTER}" y1="0" x2="${VP_CENTER}" y2="${VP_SIZE}"/>
          <g class="vp-links"></g><g class="vp-points"></g>
          <g class="vp-query" tabindex="0" role="slider" aria-label="查詢點「${esc(props.query.label)}」的位置" aria-valuetext=""><line class="vp-qline" x1="${VP_CENTER}" y1="${VP_CENTER}"/><circle r="15"/><text class="vp-qlabel" font-size="16" text-anchor="middle">問</text></g>
        </svg>
        <div class="vp-side"><span class="sc-cap">最接近的 ${props.k || 3} 筆</span><ol class="vp-list" aria-live="polite"></ol></div>
      </div>
    </div>`;
  },
  hydrate(el, props) {
    const svg = $('.vp-svg', el);
    const q = { ...props.query };
    const k = props.k || 3;
    let metric = (props.metrics || ['cosine'])[0];
    let filter = null;
    const qg = $('.vp-query', el);
    function draw() {
      const pool = props.points.filter((p) => !filter || p.group === filter);
      const ranked = pool.map((p) => ({ ...p, s: vecScore(metric, q, p) })).sort((a, b) => (metric === 'euclid' ? a.s - b.s : b.s - a.s));
      const top = new Set(ranked.slice(0, k).map((p) => p.label));
      $('.vp-points', el).innerHTML = props.points.map((p) => {
        const dim = filter && p.group !== filter;
        return `<g class="vp-pt${top.has(p.label) ? ' is-top' : ''}${dim ? ' is-dim' : ''}"><circle cx="${toPx(p.x).toFixed(1)}" cy="${toPy(p.y).toFixed(1)}" r="8"/><text x="${(toPx(p.x) + (p.x > 0.55 ? -12 : 12)).toFixed(1)}" y="${(toPy(p.y) + 5).toFixed(1)}" font-size="15" text-anchor="${p.x > 0.55 ? 'end' : 'start'}">${esc(p.label)}</text></g>`;
      }).join('');
      $('.vp-links', el).innerHTML = metric === 'euclid'
        ? ranked.slice(0, k).map((p) => `<line class="vp-link" x1="${toPx(q.x).toFixed(1)}" y1="${toPy(q.y).toFixed(1)}" x2="${toPx(p.x).toFixed(1)}" y2="${toPy(p.y).toFixed(1)}"/>`).join('')
        : ranked.slice(0, k).map((p) => `<line class="vp-link" x1="${VP_CENTER}" y1="${VP_CENTER}" x2="${toPx(p.x).toFixed(1)}" y2="${toPy(p.y).toFixed(1)}"/>`).join('');
      $('circle', qg).setAttribute('cx', toPx(q.x).toFixed(1));
      $('circle', qg).setAttribute('cy', toPy(q.y).toFixed(1));
      const qline = $('.vp-qline', qg);
      qline.setAttribute('x2', toPx(q.x).toFixed(1));
      qline.setAttribute('y2', toPy(q.y).toFixed(1));
      qline.style.display = metric === 'euclid' ? 'none' : '';
      const label = $('.vp-qlabel', qg);
      label.setAttribute('x', toPx(q.x).toFixed(1));
      label.setAttribute('y', (toPy(q.y) + 6).toFixed(1));
      qg.setAttribute('aria-valuetext', `x ${q.x.toFixed(2)}，y ${q.y.toFixed(2)}`);
      $('.vp-list', el).innerHTML = ranked.slice(0, k).map((p) => `<li><strong>${esc(p.label)}</strong><span class="mono">${METRIC_TEXT[metric]} ${p.s.toFixed(2)}</span></li>`).join('');
    }
    function moveTo(clientX, clientY) {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * VP_SIZE;
      const y = ((clientY - r.top) / r.height) * VP_SIZE;
      q.x = Math.max(-1, Math.min(1, (x - VP_CENTER) / VP_SCALE));
      q.y = Math.max(-1, Math.min(1, (VP_CENTER - y) / VP_SCALE));
      draw();
    }
    qg.addEventListener('pointerdown', (e) => { qg.setPointerCapture(e.pointerId); e.preventDefault(); });
    qg.addEventListener('pointermove', (e) => { if (qg.hasPointerCapture(e.pointerId)) moveTo(e.clientX, e.clientY); });
    svg.addEventListener('click', (e) => { if (!e.target.closest('.vp-query')) moveTo(e.clientX, e.clientY); });
    const KEY_STEP = 0.05;
    qg.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, KEY_STEP], ArrowDown: [0, -KEY_STEP] }[e.key];
      if (!d) return;
      e.preventDefault();
      q.x = Math.max(-1, Math.min(1, q.x + d[0]));
      q.y = Math.max(-1, Math.min(1, q.y + d[1]));
      draw();
    });
    el.addEventListener('click', (e) => {
      const m = e.target.closest('[data-vp-metric]');
      if (m) { metric = m.dataset.vpMetric; pressOnly(el, 'data-vp-metric', metric); draw(); }
      const f = e.target.closest('[data-vp-filter]');
      if (f) { filter = filter === f.dataset.vpFilter ? null : f.dataset.vpFilter; pressOnly(el, 'data-vp-filter', filter); draw(); }
    });
    draw();
  },
};

/* ---------- chunker：切塊大小與重疊 ---------- */
// props: { doc: [{ h, p }], question, answer }；answer 必須是 doc 裡某段文字的子字串
Widgets.chunker = {
  render(props, id) {
    return `<div class="jw ck">
      <div class="jw-head"><span class="label" style="--chip:var(--m6)">切塊器</span><span class="grow">問題：${esc(props.question)}</span></div>
      ${chipGroup('切法', [['fixed', '固定長度'], ['heading', '依標題分段']], 'data-ck-mode', 'fixed')}
      <div class="lv-sliders">
        <div class="lv-row"><label for="${id}-size">每塊最多：<output data-ck-out="size"></output> 字</label><input type="range" id="${id}-size" data-ck="size" min="40" max="400" step="10" value="${props.size || 120}"></div>
        <div class="lv-row"><label for="${id}-ov">重疊：<output data-ck-out="overlap"></output> 字</label><input type="range" id="${id}-ov" data-ck="overlap" min="0" max="80" step="5" value="${props.overlap || 0}"></div>
      </div>
      <p class="tw-note ck-sum" aria-live="polite"></p>
      <ol class="ck-list"></ol>
    </div>`;
  },
  hydrate(el, props) {
    const v = { size: props.size || 120, overlap: props.overlap || 0, mode: 'fixed' };
    const full = props.doc.map((s) => `${s.h ? `${s.h}\n` : ''}${s.p}`).join('\n\n');
    const ansStart = full.indexOf(props.answer);
    const ansEnd = ansStart + props.answer.length;
    function fixedChunks(text, offset) {
      const out = [];
      const stride = Math.max(10, v.size - v.overlap);
      for (let s = 0; s < text.length; s += stride) {
        out.push({ start: offset + s, end: offset + Math.min(text.length, s + v.size) });
        if (s + v.size >= text.length) break;
      }
      return out;
    }
    function chunks() {
      if (v.mode === 'fixed') return fixedChunks(full, 0);
      let offset = 0;
      return props.doc.flatMap((s) => {
        const text = `${s.h ? `${s.h}\n` : ''}${s.p}`;
        const list = text.length <= v.size ? [{ start: offset, end: offset + text.length }] : fixedChunks(text, offset);
        offset += text.length + 2;
        return list;
      });
    }
    function draw() {
      const list = chunks();
      const holders = list.map((c, i) => ({ ...c, i })).filter((c) => c.start < ansEnd && c.end > ansStart);
      const whole = holders.find((c) => c.start <= ansStart && c.end >= ansEnd);
      $('.ck-list', el).innerHTML = list.map((c, i) => {
        const text = full.slice(c.start, c.end);
        const a = Math.max(ansStart, c.start) - c.start;
        const b = Math.min(ansEnd, c.end) - c.start;
        const hasAns = b > a;
        const body = hasAns ? `${esc(text.slice(0, a))}<mark>${esc(text.slice(a, b))}</mark>${esc(text.slice(b))}` : esc(text);
        return `<li class="ck-item${whole && whole.i === i ? ' is-hit' : hasAns ? ' is-part' : ''}"><span class="ck-n">#${i + 1}・${text.length} 字</span><div class="ck-text">${body}</div></li>`;
      }).join('');
      $('.ck-sum', el).innerHTML = whole
        ? md(`共 **${list.length}** 塊。答案完整落在 **#${whole.i + 1}**，檢索到這一塊就答得出來。`)
        : md(`共 **${list.length}** 塊。答案被切在 **${holders.map((c) => `#${c.i + 1}`).join('、')}**：只檢索到其中一塊，模型拿到的是半句話。試試加大重疊或改成依標題切。`);
      $('[data-ck-out="size"]', el).textContent = v.size;
      $('[data-ck-out="overlap"]', el).textContent = v.overlap;
      $('[data-ck="overlap"]', el).disabled = false;
    }
    el.addEventListener('input', (e) => { const s = e.target.closest('[data-ck]'); if (s) { v[s.dataset.ck] = Number(s.value); draw(); } });
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-ck-mode]'); if (b) { v.mode = b.dataset.ckMode; pressOnly(el, 'data-ck-mode', v.mode); draw(); } });
    draw();
  },
};

/* ---------- ragtrace：一個問題走過 RAG 的每一站 ---------- */
// props: { title, scenarios: [{ label, stages: [{ title, body: [blocks] }] }] }
Widgets.ragtrace = {
  render(props) {
    return `<div class="jw rt">
      <div class="jw-head"><span class="label" style="--chip:var(--m6)">${esc(props.chip || "RAG 追蹤")}</span><span class="grow">${esc(props.title || "一個問題，一站一站看")}</span></div>
      ${props.scenarios.length > 1 ? chipGroup('情境', props.scenarios.map((s, i) => [String(i), s.label]), 'data-rt', '0') : ''}
      <div class="rt-inner"></div>
    </div>`;
  },
  hydrate(el, props) {
    function mount(index) {
      const scenario = props.scenarios[index];
      const inner = document.createElement('div');
      inner.className = 'rt-inner';
      inner.innerHTML = `${stepperControls('RAG 追蹤控制')}
        <ol class="rt-stations" aria-hidden="true">${scenario.stages.map((s) => `<li>${esc(s.title)}</li>`).join('')}</ol>
        <div class="rt-body blocks" aria-live="polite"></div>`;
      $('.rt-inner', el).replaceWith(inner);
      const body = $('.rt-body', inner);
      makeStepper(inner, scenario.stages.length, (step) => {
        $$('.rt-stations li', inner).forEach((li, i) => {
          li.classList.toggle('is-now', i === step);
          li.classList.toggle('is-done', i < step);
        });
        const s = scenario.stages[step];
        body.innerHTML = `<p class="rt-title"><span class="step">第 ${step + 1} 站 / 共 ${scenario.stages.length} 站</span>${esc(s.title)}</p>${renderBlocks(s.body)}`;
        Hydrators.forEach((fn) => fn(body));
      }, { interval: 3200 });
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rt]');
      if (!b) return;
      pressOnly(el, 'data-rt', b.dataset.rt);
      mount(Number(b.dataset.rt));
    });
    mount(0);
  },
};

/* ---------- sampler：下一個 token 的機率，以及取樣（每按一次真的抽一次） ---------- */
// props: { title, steps: [{ context, candidates: [{ t, logit }] }], temperature: true, topP: true, note }
// 機率＝softmax(logit / T)；top-p 只保留累積機率達到門檻的前幾名再重新分配
const SAMPLER_T = { min: 0.1, max: 2, step: 0.1, start: 1 };
const SAMPLER_P = { min: 0.5, max: 1, step: 0.05, start: 1 };
function samplerProbs(candidates, temperature, topP) {
  const scaled = candidates.map((c) => c.logit / temperature);
  const top = Math.max(...scaled);
  const exps = scaled.map((v) => Math.exp(v - top)); // 先減最大值，避免數字溢位
  const total = exps.reduce((a, b) => a + b, 0);
  const ranked = candidates.map((c, i) => ({ ...c, p: exps[i] / total })).sort((a, b) => b.p - a.p);
  let cumulative = 0;
  ranked.forEach((c) => { c.kept = cumulative < topP - 1e-9; cumulative += c.p; });
  const keptTotal = ranked.filter((c) => c.kept).reduce((a, c) => a + c.p, 0);
  ranked.forEach((c) => { c.final = c.kept ? c.p / keptTotal : 0; });
  return ranked;
}
Widgets.sampler = {
  render(props, id) {
    return `<div class="jw sp">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">下一個 token</span><span class="grow">${esc(props.title || '模型算出機率，再從中抽一個')}</span></div>
      <p class="sp-sentence" aria-live="polite"></p>
      <ol class="sp-bars"></ol>
      <div class="lv-sliders">
        ${props.temperature === false ? '' : `<div class="lv-row"><label for="${id}-t">temperature：<output data-sp-out="t"></output></label><input type="range" id="${id}-t" data-sp="t" min="${SAMPLER_T.min}" max="${SAMPLER_T.max}" step="${SAMPLER_T.step}" value="${SAMPLER_T.start}"><div class="lv-ends"><span>集中：幾乎都挑第一名</span><span>分散：冷門字也有機會</span></div></div>`}
        ${props.topP ? `<div class="lv-row"><label for="${id}-p">top-p：<output data-sp-out="p"></output></label><input type="range" id="${id}-p" data-sp="p" min="${SAMPLER_P.min}" max="${SAMPLER_P.max}" step="${SAMPLER_P.step}" value="${SAMPLER_P.start}"><div class="lv-ends"><span>只留前幾名</span><span>全部都留</span></div></div>` : ''}
      </div>
      <div class="tw-controls" role="group" aria-label="取樣">
        <button type="button" class="btn small primary nb-press" data-sp-act="sample">抽一個</button>
        <button type="button" class="btn small nb-press" data-sp-act="greedy">挑最高的</button>
        <button type="button" class="btn small nb-press" data-sp-act="reset">重來</button>
      </div>
      <p class="jw-note">${md(props.note || '機率是示意的數字，不是真實模型的輸出。')}</p>
    </div>`;
  },
  hydrate(el, props) {
    const v = { t: SAMPLER_T.start, p: SAMPLER_P.start };
    let step = 0;
    let chosen = [];
    const sentence = $('.sp-sentence', el);
    const bars = $('.sp-bars', el);
    function draw() {
      const done = step >= props.steps.length;
      sentence.innerHTML = `${esc(props.steps[0].context)}<mark>${esc(chosen.join(''))}</mark>${done ? '<span class="sp-done">（完成）</span>' : '<span class="sp-cursor" aria-hidden="true">▍</span>'}`;
      if (done) { bars.innerHTML = ''; } else {
        const ranked = samplerProbs(props.steps[step].candidates, v.t, v.p);
        bars.innerHTML = ranked.map((c) => `<li class="sp-row${c.kept ? '' : ' is-cut'}"><code>${esc(c.t)}</code><span class="lv-meter"><span class="lv-fill" style="transform:scaleX(${c.final.toFixed(3)})"></span></span><strong>${(c.final * 100).toFixed(1)}%</strong></li>`).join('');
      }
      $$('[data-sp-act="sample"], [data-sp-act="greedy"]', el).forEach((b) => { b.disabled = done; });
      const outT = $('[data-sp-out="t"]', el); if (outT) outT.textContent = v.t.toFixed(1);
      const outP = $('[data-sp-out="p"]', el); if (outP) outP.textContent = v.p.toFixed(2);
    }
    function pick(mode) {
      const ranked = samplerProbs(props.steps[step].candidates, v.t, v.p);
      let choice = ranked[0];
      if (mode === 'sample') {
        let r = Math.random();
        choice = ranked.find((c) => { r -= c.final; return r <= 0 && c.final > 0; }) || ranked[0];
      }
      chosen.push(choice.t);
      step += 1;
      draw();
    }
    el.addEventListener('input', (e) => { const s = e.target.closest('[data-sp]'); if (s) { v[s.dataset.sp] = Number(s.value); draw(); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sp-act]');
      if (!b) return;
      if (b.dataset.spAct === 'reset') { step = 0; chosen = []; draw(); return; }
      if (step < props.steps.length) pick(b.dataset.spAct);
    });
    draw();
  },
};

/* ---------- evalgrid：自己先打分，再和各種自動評分比 ---------- */
// props: { task, items: [{ input, output, exact, rule, judge }] }；judge 是 1–5 分，4 分以上算合格
const JUDGE_PASS = 4;
Widgets.evalgrid = {
  render(props) {
    return `<div class="jw eg">
      <div class="jw-head"><span class="label" style="--chip:var(--m8)">評估表</span><span class="grow">${md(props.task)}</span></div>
      <ol class="eg-list">${props.items.map((it, i) => `<li class="eg-item">
        <div class="eg-io"><span class="sc-cap">輸入</span><p>${md(it.input)}</p><span class="sc-cap">模型輸出</span><p class="eg-out">${md(it.output)}</p></div>
        ${chipGroup('你的判斷', [[`${i}:1`, '✓ 合格'], [`${i}:0`, '✗ 不合格']], 'data-eg', '')}
      </li>`).join('')}</ol>
      <button type="button" class="btn primary nb-press" data-eg-compare style="justify-self:start">和自動評分比一比</button>
      <div class="eg-result" aria-live="polite"></div>
    </div>`;
  },
  hydrate(el, props) {
    const mine = new Map();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-eg]');
      if (b) {
        const [i, v] = b.dataset.eg.split(':');
        mine.set(Number(i), v === '1');
        $$(`[data-eg^="${i}:"]`, el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        return;
      }
      if (!e.target.closest('[data-eg-compare]')) return;
      const out = $('.eg-result', el);
      if (mine.size < props.items.length) { out.innerHTML = md(`還有 **${props.items.length - mine.size}** 筆沒打分，先自己判斷完再比。`); return; }
      const methods = [['精確比對', (it) => it.exact], ['規則檢查', (it) => it.rule], ['LLM 裁判（≥ 4 分）', (it) => it.judge >= JUDGE_PASS]];
      const agree = (fn) => props.items.filter((it, i) => fn(it) === mine.get(i)).length;
      out.innerHTML = tableBlock({
        head: ['評分方式', '判定合格', '和你一致'],
        rows: [['你', `${[...mine.values()].filter(Boolean).length} / ${props.items.length}`, '—'],
          ...methods.map(([name, fn]) => [name, `${props.items.filter(fn).length} / ${props.items.length}`, `${agree(fn)} / ${props.items.length}`])],
      }) + (props.note ? `<p class="jw-note">${md(props.note)}</p>` : '');
    });
  },
};

/* ---------- knobs：拉桿改參數，看結果怎麼變（compute 由課程資料提供） ---------- */
// props: { title, sliders: [{ id, label, min, max, step, value, unit, ends? }], compute(values) => { rows: [{ label, value, ratio }], note } }
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

/* ---------- classify：分類練習（沿用 adhd-planning-course） ---------- */
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

/* ---------- 首頁：一個請求送出去，回應一段一段串流回來 ---------- */
const HERO_SAMPLES = [
  { ask: '用一句話解釋什麼是 token', reply: 'token 是模型讀寫文字的最小單位，一個中文字大約一到兩個 token，計費也是用它算。' },
  { ask: '把這封客訴分類成 JSON', reply: '{ "category": "退款", "urgency": "high", "needsHuman": true }' },
  { ask: '台北明天會下雨嗎？', reply: '我先呼叫 get_weather 工具查台北明天的預報，再根據結果回答你。' },
];
const HERO_PAUSE_MS = 2600;
const HERO_CHUNK_MS = 70;
Widgets.herodemo = {
  render() {
    return `<div class="herodemo" aria-hidden="true">
      <div class="hd-req"><span class="label" style="--chip:var(--m1)">POST /v1/messages</span><pre class="hd-json"></pre></div>
      <div class="hd-arrow"><span>串流回應</span></div>
      <div class="hd-res"><span class="label" style="--chip:var(--m2)">text_delta</span><p class="hd-text"></p></div>
    </div>`;
  },
  hydrate(el) {
    const json = $('.hd-json', el);
    const text = $('.hd-text', el);
    const body = (s) => `{\n  "model": "claude-opus-5-5",\n  "max_tokens": 1024,\n  "messages": [\n    { "role": "user",\n      "content": "${s.ask}" }\n  ]\n}`;
    let n = 0;
    // 先放第一個請求，等第一個字之前畫面不會是空的
    json.textContent = body(HERO_SAMPLES[0]);
    if (prefersReducedMotion()) { json.textContent = body(HERO_SAMPLES[0]); text.textContent = HERO_SAMPLES[0].reply; return; }
    function next() {
      if (!document.body.contains(el)) return;
      const s = HERO_SAMPLES[n % HERO_SAMPLES.length];
      n += 1;
      json.textContent = body(s);
      text.textContent = '';
      text.classList.add('is-typing');
      const parts = splitChunks(s.reply);
      let k = 0;
      const timer = window.setInterval(() => {
        if (!document.body.contains(el)) { window.clearInterval(timer); return; }
        text.textContent += parts[k];
        k += 1;
        if (k >= parts.length) { window.clearInterval(timer); text.classList.remove('is-typing'); window.setTimeout(next, HERO_PAUSE_MS); }
      }, HERO_CHUNK_MS);
    }
    window.setTimeout(next, SSE_DEFAULT_TTFT_MS);
  },
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

/* ==========================================================================
   第五部新增：記憶體估算（實際公式）
   ========================================================================== */

/* ---------- memfit：模型放不放得下這張卡 ---------- */
// props: { title, gpus: [{ name, gb, note }], params, bits, mode: 'infer'|'train', other }
// 推論：權重＝參數 × 位元 ÷ 8；訓練（混合精度＋Adam）：約 16 位元組／參數（權重 2、梯度 2、FP32 主權重與 Adam 兩個狀態 12）
const TRAIN_BYTES_PER_PARAM = 16;
Widgets.memfit = {
  render(props, id) {
    return `<div class="jw mf">
      <div class="jw-head"><span class="label" style="--chip:var(--m2)">記憶體估算</span><span class="grow">${esc(props.title || '這個模型放得進這張卡嗎')}</span></div>
      ${chipGroup('硬體', props.gpus.map((g, i) => [String(i), g.name]), 'data-mf-gpu', '0')}
      ${chipGroup('用途', [['infer', '推論'], ['train', '訓練（Adam）']], 'data-mf-mode', props.mode || 'infer')}
      ${chipGroup('權重精度', [['16', '16 位元'], ['8', '8 位元'], ['4', '4 位元']], 'data-mf-bits', String(props.bits || 16))}
      <div class="lv-sliders">
        <div class="lv-row"><label for="${id}-p">參數量：<output data-mf-out="p"></output> 十億</label><input type="range" id="${id}-p" data-mf="p" min="0.5" max="700" step="0.5" value="${props.params || 8}"></div>
        <div class="lv-row"><label for="${id}-o">其他（KV cache、activation 等）：<output data-mf-out="o"></output> GB</label><input type="range" id="${id}-o" data-mf="o" min="0" max="200" step="1" value="${props.other ?? 2}"></div>
      </div>
      <div class="mf-bar" aria-hidden="true"></div>
      <div class="kn-rows mf-stats" aria-live="polite"></div>
      <p class="jw-note mf-note"></p>
    </div>`;
  },
  hydrate(el, props) {
    const v = { gpu: 0, mode: props.mode || 'infer', bits: props.bits || 16, p: props.params || 8, o: props.other ?? 2 };
    function draw() {
      const g = props.gpus[v.gpu];
      const weights = v.mode === 'train' ? v.p * TRAIN_BYTES_PER_PARAM : (v.p * v.bits) / 8;
      const total = weights + v.o;
      const n = Math.ceil(total / g.gb);
      const scale = Math.max(total, g.gb);
      $('.mf-bar', el).innerHTML = `<span class="mf-seg" style="--w:${(weights / scale) * 100}%;--c:var(--m3)"></span><span class="mf-seg" style="--w:${(v.o / scale) * 100}%;--c:var(--m4)"></span><span class="mf-cap" style="--x:${(g.gb / scale) * 100}%"></span>`;
      $('.mf-stats', el).innerHTML = [
        [v.mode === 'train' ? '權重＋梯度＋優化器（16 位元組／參數）' : `權重（${v.bits} 位元）`, `${weights.toFixed(1)} GB`, weights / scale],
        ['其他', `${v.o} GB`, v.o / scale],
        ['合計', `${total.toFixed(1)} GB`, total / scale],
        [`${g.name} 容量`, `${g.gb} GB`, g.gb / scale],
        ['至少需要幾張（只看容量）', String(n), Math.min(1, n / 16)],
      ].map(([l, val, r]) => `<div class="kn-row"><span>${esc(l)}</span><span class="lv-meter"><span class="lv-fill" style="transform:scaleX(${Math.min(1, r)})"></span></span><strong>${esc(val)}</strong></div>`).join('');
      $('.mf-note', el).innerHTML = md(`${g.note ? `${g.note}　` : ''}${n <= 1 ? '**放得下**。' : `**一張放不下**，至少要 ${n} 張，而且還要考慮卡與卡之間的通訊（3-2）。`}估算只看容量，實際還有框架與暫存的額外開銷。`);
      $('[data-mf-out="p"]', el).textContent = v.p;
      $('[data-mf-out="o"]', el).textContent = v.o;
      $$('[data-mf-bits]', el).forEach((b) => { b.disabled = v.mode === 'train'; });
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mf-gpu],[data-mf-mode],[data-mf-bits]');
      if (!b) return;
      if (b.dataset.mfGpu !== undefined) { v.gpu = Number(b.dataset.mfGpu); pressOnly(el, 'data-mf-gpu', b.dataset.mfGpu); }
      if (b.dataset.mfMode !== undefined) { v.mode = b.dataset.mfMode; pressOnly(el, 'data-mf-mode', v.mode); }
      if (b.dataset.mfBits !== undefined) { v.bits = Number(b.dataset.mfBits); pressOnly(el, 'data-mf-bits', b.dataset.mfBits); }
      draw();
    });
    el.addEventListener('input', (e) => { const s = e.target.closest('[data-mf]'); if (s) { v[s.dataset.mf] = Number(s.value); draw(); } });
    draw();
  },
};
