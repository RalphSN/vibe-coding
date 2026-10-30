/* ==========================================================================
   ADHD 規劃課程專用互動元件
   每個元件：render(props, id) 只產生字串；hydrate(el, props) 才綁事件
   讀者寫下的內容存在 SystemStore（獨立的 localStorage key），可在「我的系統」頁清除
   ========================================================================== */

/* ---------- 我的系統：讀者在元件裡存下的東西 ---------- */
const SYSTEM_KEY = 'adhd-planning-course.system.v1';
const SystemStore = createStore(SYSTEM_KEY, { steps: [], plans: [], estimates: [], projects: [], prompts: [], woops: [] });
const SYSTEM_KINDS = [
  { key: 'steps', label: '第一步', lesson: '1-1' },
  { key: 'plans', label: '如果…就…計畫', lesson: '1-2' },
  { key: 'woops', label: '預想障礙（WOOP）', lesson: '4-4' },
  { key: 'projects', label: '專案拆解', lesson: '3-2' },
  { key: 'estimates', label: '估時紀錄', lesson: '2-3' },
  { key: 'prompts', label: '請 AI 拆任務的 prompt', lesson: '3-3' },
];
const MAX_ITEMS_PER_KIND = 50;

function saveToSystem(kind, entry) {
  SystemStore.update((s) => {
    s[kind] = [{ ...entry, id: uid('s'), created: new Date().toISOString() }, ...(s[kind] || [])].slice(0, MAX_ITEMS_PER_KIND);
  });
  announce('已存進「我的系統」');
}

/* 太模糊、沒辦法直接開始的動詞：出現時提醒改寫成看得到的動作 */
const VAGUE_WORDS = ['處理', '搞定', '弄', '想一下', '研究', '規劃', '準備', '整理一下', '思考', '努力', '加油', '盡量', '完成'];
function findVague(text) {
  return VAGUE_WORDS.filter((w) => text.includes(w));
}
/* 好的「如果」要有具體的時間、地點或前一個動作 */
const CUE_PATTERN = /\d|點|早上|中午|下午|晚上|午餐|午休|下班|上班|進公司|到家|會議|開完|吃完|一打開|一坐下|一到|之後|結束/;

/* ---------- stuckcheck：卡在哪一段 ---------- */
// props: { title? }
const STUCK_TREE = {
  start: { q: '你知道這件事「下一個實際動作」是什麼嗎？', options: [['不知道，或很模糊', 'unclear'], ['知道', 'q2']] },
  q2: { q: '這件事你開始過嗎？', options: [['還沒開始', 'q3'], ['開始過，但中途斷掉了', 'interrupted']] },
  q3: { q: '你是一直忘了它，還是記得、但就是開不了頭？', options: [['常常忘了', 'forgot'], ['記得，但開不了頭', 'launch']] },
};
const STUCK_RESULTS = {
  unclear: { label: '想不清楚', now: '花 2 分鐘，只寫下一個「動詞開頭、看得到」的動作，例如「打開上週的簡報檔」。', lessons: ['3-1', '3-2', '3-3'] },
  launch: { label: '開不了頭', now: '把第一步縮到 2 分鐘內做得完，現在就做那 2 分鐘，不承諾要做更多。', lessons: ['1-1', '1-2', '1-4'] },
  interrupted: { label: '做到一半斷掉', now: '寫一行麵包屑：「我做到＿＿，下一步是＿＿」，再決定現在要不要接著做。', lessons: ['5-1', '5-2', '5-3'] },
  forgot: { label: '根本忘了', now: '把它放到「要做的那一刻」看得到的地方：寫一條「如果＿＿，我就＿＿」，或設一個帶著第一步的提醒。', lessons: ['1-2', '2-2', '4-1'] },
};
Widgets.stuckcheck = {
  render(props) {
    return `<div class="jw sc">
      <div class="jw-head"><span class="label" style="--chip:var(--m0)">診斷</span><span class="grow">${esc(props.title || '卡在哪一段？')}</span></div>
      <div class="sc-body" aria-live="polite"></div>
      <div class="jw-row"><button type="button" class="btn small nb-press" data-sc-reset>重新回答</button></div>
    </div>`;
  },
  hydrate(el) {
    const body = $('.sc-body', el);
    function showNode(key) {
      const node = STUCK_TREE[key];
      body.innerHTML = `<p class="sc-q">${esc(node.q)}</p><div class="jw-row">${node.options.map(([text, next]) => `<button type="button" class="btn nb-press" data-sc-next="${next}">${esc(text)}</button>`).join('')}</div>`;
    }
    function showResult(key) {
      const r = STUCK_RESULTS[key];
      body.innerHTML = `<p class="sc-result"><span class="label" style="--chip:var(--accent)">你卡在：${esc(r.label)}</span></p>
        <p><strong>現在就做：</strong>${esc(r.now)}</p>
        <p class="sc-links">對應的課：${r.lessons.map((id) => `<a href="#/l/${id}">${id} ${esc(plainTitle(LESSON_BY_ID[id].title))}</a>`).join('、')}</p>`;
    }
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-sc-reset]')) { showNode('start'); return; }
      const b = e.target.closest('[data-sc-next]');
      if (!b) return;
      const next = b.dataset.scNext;
      if (STUCK_TREE[next]) showNode(next); else showResult(next);
    });
    showNode('start');
  },
};

/* ---------- levers：想做的程度＝做得到 × 重要或有趣 ÷（衝動 × 距離） ---------- */
// props: { start?: { e, v, i, d } }；依 Steel（2007）的時間動機理論，只做相對比較，不是精確分數
const LEVERS = [
  { key: 'e', label: '做得到的感覺', low: '完全沒把握', high: '很有把握', tip: '把第一步縮小，直到「這個我做得到」（1-1）。', lesson: '1-1' },
  { key: 'v', label: '重要或有趣', low: '無聊又無感', high: '很重要或很有趣', tip: '讓它現在就有回饋：做完立刻打勾、配一首喜歡的歌、跟人約好（1-4）。', lesson: '1-4' },
  { key: 'i', label: '分心的拉力', low: '環境很安靜', high: '手機就在手邊', tip: '把分心的東西移出視線，把要做的東西擺在眼前（1-3）。', lesson: '1-3' },
  { key: 'd', label: '離截止日多遠', low: '今天就要', high: '一個月以後', tip: '把截止日拉近：給自己一個今天的小截止點（2-2）。', lesson: '2-2' },
];
const LEVER_MIN = 1;
const LEVER_MAX = 10;
const LEVER_STEP = 2;
// e、v 越高越想做；i、d 越高越不想做
function leverScore({ e, v, i, d }) { return (e * v) / (i * d); }
const SCORE_LOG_MIN = -2;
const SCORE_LOG_RANGE = 4;
function leverPercent(values) {
  const pct = ((Math.log10(leverScore(values)) - SCORE_LOG_MIN) / SCORE_LOG_RANGE) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
function bestLever(values) {
  const tries = LEVERS.map((lv) => {
    const sign = lv.key === 'e' || lv.key === 'v' ? 1 : -1;
    const next = { ...values, [lv.key]: Math.max(LEVER_MIN, Math.min(LEVER_MAX, values[lv.key] + sign * LEVER_STEP)) };
    return { lv, gain: leverScore(next) / leverScore(values) };
  });
  return tries.sort((a, b) => b.gain - a.gain)[0].lv;
}
Widgets.levers = {
  render(props, id) {
    const start = props.start || { e: 3, v: 4, i: 7, d: 8 };
    return `<div class="jw lv">
      <div class="jw-head"><span class="label" style="--chip:var(--m0)">拉拉看</span><span class="grow">想一件你一直拖著的事，照實際感覺調四個拉桿</span></div>
      <div class="lv-sliders">${LEVERS.map((lv) => `<label class="lv-row" for="${id}-${lv.key}">
        <span class="lv-name">${esc(lv.label)}</span>
        <input type="range" id="${id}-${lv.key}" min="${LEVER_MIN}" max="${LEVER_MAX}" step="1" value="${start[lv.key]}" data-lv="${lv.key}">
        <span class="lv-ends"><span>${esc(lv.low)}</span><span>${esc(lv.high)}</span></span>
      </label>`).join('')}</div>
      <div class="lv-meter" role="img" aria-label="想做的程度"><span class="lv-fill"></span></div>
      <p class="lv-out" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el, props) {
    const values = { ...(props.start || { e: 3, v: 4, i: 7, d: 8 }) };
    const fill = $('.lv-fill', el);
    const meter = $('.lv-meter', el);
    function draw() {
      const pct = leverPercent(values);
      fill.style.transform = `scaleX(${pct / 100})`;
      meter.setAttribute('aria-label', `想做的程度 ${pct}%`);
      const lv = bestLever(values);
      $('.lv-out', el).innerHTML = `想做的程度：<strong>${pct}%</strong>。現在最有效的槓桿是「${esc(lv.label)}」：${md(lv.tip)}`;
    }
    el.addEventListener('input', (e) => {
      const k = e.target.dataset.lv;
      if (!k) return;
      values[k] = Number(e.target.value);
      draw();
    });
    draw();
  },
};

/* ---------- shrinker：把第一步縮到 2 分鐘內做得到 ---------- */
const SHRINK_PROMPTS = [
  '如果只有 2 分鐘，你會先做哪一小塊？',
  '開始之前，第一個要打開的東西是什麼？（檔案、網頁、App、抽屜）',
  '把它寫成「動詞＋看得到的東西」，例如「打開報告檔，寫下標題」。',
  '再小一點：這一步裡面，最前面的那個動作是什麼？',
];
Widgets.shrinker = {
  render(props, id) {
    return `<div class="jw sh">
      <div class="jw-head"><span class="label" style="--chip:var(--m1)">縮小</span><span class="grow">把一件事縮到「現在 2 分鐘內就能開始」</span></div>
      <label for="${id}-in" class="sh-q">一直拖著的那件事是：</label>
      <input class="fb-input" id="${id}-in" autocomplete="off" placeholder="${esc(props.placeholder || '例如：寫季度報告')}">
      <ol class="sh-ladder"></ol>
      <p class="jw-note sh-warn" aria-live="polite"></p>
      <div class="jw-row">
        <button type="button" class="btn small nb-press" data-sh="smaller">還是太大，再縮小</button>
        <button type="button" class="btn small primary nb-press" data-sh="done">這個我現在做得到</button>
        <button type="button" class="btn small nb-press" data-sh="reset">重來</button>
      </div>
      <p class="jw-note sh-out" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el) {
    const input = $('input', el);
    const ladder = $('.sh-ladder', el);
    const steps = [];
    function current() { return input.value.trim(); }
    function warn(text) {
      const vague = findVague(text);
      $('.sh-warn', el).textContent = vague.length ? `「${vague.join('、')}」有點模糊，改成看得到的動作會更容易開始。` : '';
    }
    function nextPrompt() {
      const q = SHRINK_PROMPTS[Math.min(steps.length - 1, SHRINK_PROMPTS.length - 1)];
      $('.sh-q', el).textContent = q;
      input.value = '';
      input.focus();
    }
    el.addEventListener('input', () => warn(current()));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sh]');
      if (!b) return;
      const act = b.dataset.sh;
      if (act === 'reset') { steps.length = 0; ladder.innerHTML = ''; $('.sh-q', el).textContent = '一直拖著的那件事是：'; $('.sh-out', el).textContent = ''; input.value = ''; return; }
      const text = current();
      if (!text) { $('.sh-warn', el).textContent = '先寫下一點東西，再按按鈕。'; return; }
      steps.push(text);
      ladder.innerHTML = steps.map((s) => `<li>${esc(s)}</li>`).join('');
      if (act === 'smaller') { nextPrompt(); return; }
      saveToSystem('steps', { task: steps[0], step: text });
      $('.sh-out', el).innerHTML = `<strong>你的第一步：</strong>${esc(text)}。現在就做，計時 2 分鐘；做完可以停，也可以接著做。`;
    });
  },
};

/* ---------- ifthen：如果…就…產生器 ---------- */
// props: { ifHint?, thenHint? }
Widgets.ifthen = {
  render(props, id) {
    return `<div class="jw it">
      <div class="jw-head"><span class="label" style="--chip:var(--m1)">寫一條</span><span class="grow">讓情境替你按下開始</span></div>
      <label for="${id}-if">如果（什麼時候、在哪裡、做完什麼之後）</label>
      <input class="fb-input" id="${id}-if" autocomplete="off" placeholder="${esc(props.ifHint || '例如：午餐回到座位、一坐下')}">
      <label for="${id}-then">我就（第一個看得到的動作）</label>
      <input class="fb-input" id="${id}-then" autocomplete="off" placeholder="${esc(props.thenHint || '例如：打開報告檔，寫下今天要補的三個數字')}">
      <ul class="it-checks" aria-live="polite"></ul>
      <p class="it-preview"></p>
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-it-save>存進我的系統</button></div>
    </div>`;
  },
  hydrate(el) {
    const [ifIn, thenIn] = $$('input', el);
    function checks() {
      const cond = ifIn.value.trim();
      const act = thenIn.value.trim();
      const vague = findVague(act);
      return [
        [cond && CUE_PATTERN.test(cond), '「如果」有具體的時間、地點或前一個動作'],
        [act.length > 0 && vague.length === 0, vague.length ? `「我就」裡的「${vague.join('、')}」太模糊` : '「我就」是一個看得到的動作'],
        [act.length > 0 && act.length <= 40, '「我就」短到一眼看得完（40 字內）'],
      ];
    }
    function draw() {
      $('.it-checks', el).innerHTML = checks().map(([ok, text]) => `<li class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(text)}</li>`).join('');
      const cond = ifIn.value.trim();
      const act = thenIn.value.trim();
      $('.it-preview', el).innerHTML = cond && act ? `<strong>如果</strong>${esc(cond)}，<strong>我就</strong>${esc(act)}。` : '';
    }
    el.addEventListener('input', draw);
    el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-it-save]')) return;
      if (!checks().every(([ok]) => ok)) { announce('還有沒通過的檢查，改好再存'); return; }
      saveToSystem('plans', { cond: ifIn.value.trim(), act: thenIn.value.trim() });
    });
    draw();
  },
};

/* ---------- timebox：看得見的倒數（時間真的在流逝，所以用動畫） ---------- */
const TIMEBOX_OPTIONS = [5, 10, 25];
const MS_PER_MINUTE = 60000;
const MS_PER_SECOND = 1000;
Widgets.timebox = {
  render() {
    return `<div class="jw tb">
      <div class="jw-head"><span class="label" style="--chip:var(--m2)">倒數</span><span class="grow">選一個長度，看著時間變少</span></div>
      <div class="jw-row">${TIMEBOX_OPTIONS.map((m) => `<button type="button" class="btn small nb-press" data-tb-start="${m}">${m} 分鐘</button>`).join('')}
        <button type="button" class="btn small nb-press" data-tb-pause disabled>暫停</button></div>
      <div class="tb-track"><span class="tb-fill"></span></div>
      <p class="tb-time" aria-live="off">--:--</p>
      <p class="jw-note tb-status" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el) {
    const fill = $('.tb-fill', el);
    const time = $('.tb-time', el);
    const pauseBtn = $('[data-tb-pause]', el);
    let total = 0; let left = 0; let last = 0; let timer = 0; let running = false;
    const fmt = (ms) => { const sec = Math.ceil(ms / MS_PER_SECOND); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
    function paint() {
      // reduced-motion：只在整分鐘更新長條，不做連續縮小
      const ratio = prefersReducedMotion() ? Math.ceil(left / MS_PER_MINUTE) * MS_PER_MINUTE / total : left / total;
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
      time.textContent = fmt(left);
    }
    function tick() {
      if (!document.body.contains(el)) { window.clearInterval(timer); return; }
      const now = performance.now();
      left -= now - last; last = now;
      if (left <= 0) { left = 0; stop(); $('.tb-status', el).textContent = '時間到。做到哪裡都算數：留一行麵包屑，再決定要不要再來一輪。'; }
      paint();
    }
    function stop() { running = false; window.clearInterval(timer); pauseBtn.textContent = '暫停'; pauseBtn.disabled = left <= 0; }
    function run() { running = true; last = performance.now(); timer = window.setInterval(tick, MS_PER_SECOND / 4); pauseBtn.textContent = '暫停'; pauseBtn.disabled = false; }
    el.addEventListener('click', (e) => {
      const s = e.target.closest('[data-tb-start]');
      if (s) { stop(); total = Number(s.dataset.tbStart) * MS_PER_MINUTE; left = total; $('.tb-status', el).textContent = `開始 ${s.dataset.tbStart} 分鐘。`; paint(); run(); return; }
      if (e.target.closest('[data-tb-pause]')) {
        if (running) { stop(); pauseBtn.textContent = '繼續'; pauseBtn.disabled = false; $('.tb-status', el).textContent = '已暫停。'; } else if (left > 0) { run(); $('.tb-status', el).textContent = '繼續。'; }
      }
    });
  },
};

/* ---------- estimator：估時校正倍數 ---------- */
const MIN_RECORDS_FOR_RATIO = 3;
function medianOf(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
Widgets.estimator = {
  render(props, id) {
    return `<div class="jw es">
      <div class="jw-head"><span class="label" style="--chip:var(--m2)">記錄</span><span class="grow">我以為要多久 vs. 實際多久</span></div>
      <div class="es-form">
        <label for="${id}-t">做了什麼</label><input class="fb-input" id="${id}-t" autocomplete="off" placeholder="例如：回覆客戶 email">
        <label for="${id}-g">預估（分鐘）</label><input class="fb-input" id="${id}-g" type="number" min="1" inputmode="numeric">
        <label for="${id}-a">實際（分鐘）</label><input class="fb-input" id="${id}-a" type="number" min="1" inputmode="numeric">
      </div>
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-es-add>加一筆</button></div>
      <p class="es-ratio" aria-live="polite"></p>
      <ol class="es-list"></ol>
    </div>`;
  },
  hydrate(el) {
    const [taskIn, guessIn, actualIn] = $$('input', el);
    function draw() {
      const rows = SystemStore.get().estimates;
      $('.es-list', el).innerHTML = rows.map((r) => `<li>${esc(r.task)}：預估 ${r.guess} 分、實際 ${r.actual} 分（×${(r.actual / r.guess).toFixed(1)}） <button type="button" class="btn small nb-press" data-es-del="${esc(r.id)}" aria-label="刪除「${esc(r.task)}」">刪除</button></li>`).join('');
      const ratio = rows.length >= MIN_RECORDS_FOR_RATIO ? medianOf(rows.map((r) => r.actual / r.guess)) : null;
      $('.es-ratio', el).innerHTML = ratio
        ? `你的校正倍數（${rows.length} 筆的中位數）：<strong>×${ratio.toFixed(1)}</strong>。下次預估 30 分鐘的事，排 ${Math.round(30 * ratio)} 分鐘。`
        : `再記 ${MIN_RECORDS_FOR_RATIO - rows.length} 筆，就能算出你的校正倍數。`;
    }
    el.addEventListener('click', (e) => {
      const del = e.target.closest('[data-es-del]');
      if (del) { SystemStore.update((s) => { s.estimates = s.estimates.filter((r) => r.id !== del.dataset.esDel); }); draw(); return; }
      if (!e.target.closest('[data-es-add]')) return;
      const guess = Number(guessIn.value);
      const actual = Number(actualIn.value);
      if (!taskIn.value.trim() || !(guess > 0) || !(actual > 0)) { announce('三格都要填，分鐘要大於 0'); return; }
      saveToSystem('estimates', { task: taskIn.value.trim(), guess, actual });
      taskIn.value = ''; guessIn.value = ''; actualIn.value = '';
      draw();
    });
    draw();
  },
};

/* ---------- breakdown：專案 → 里程碑 → 下一步 ---------- */
Widgets.breakdown = {
  render(props, id) {
    return `<div class="jw bd">
      <div class="jw-head"><span class="label" style="--chip:var(--m3)">拆解</span><span class="grow">只有最底層需要具體</span></div>
      <label for="${id}-p">專案</label>
      <input class="fb-input" id="${id}-p" autocomplete="off" placeholder="${esc(props.placeholder || '例如：Q4 產品發表會')}">
      <div class="bd-tree"></div>
      <div class="jw-row">
        <button type="button" class="btn small nb-press" data-bd-ms>加一個里程碑</button>
        <button type="button" class="btn small primary nb-press" data-bd-save>存進我的系統</button>
      </div>
      <p class="jw-note bd-warn" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el) {
    const tree = $('.bd-tree', el);
    const milestones = [{ name: '', next: [''] }];
    function draw() {
      tree.innerHTML = milestones.map((m, i) => `<div class="bd-ms">
        <label>里程碑 ${i + 1}<input class="fb-input" data-bd-name="${i}" value="${esc(m.name)}" placeholder="例如：場地確定"></label>
        <ul>${m.next.map((n, j) => `<li><label>下一步<input class="fb-input" data-bd-next="${i}:${j}" value="${esc(n)}" placeholder="動詞開頭，例如：打電話問 A 場地 11/20 有沒有空"></label></li>`).join('')}</ul>
        <button type="button" class="btn small nb-press" data-bd-add="${i}">加一個下一步</button>
      </div>`).join('');
    }
    function warn() {
      const vague = milestones.flatMap((m) => m.next).filter(Boolean).flatMap(findVague);
      $('.bd-warn', el).textContent = vague.length ? `下一步裡的「${[...new Set(vague)].join('、')}」太模糊，改成看得到的動作。` : '';
    }
    el.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.bdName) milestones[Number(t.dataset.bdName)].name = t.value;
      if (t.dataset.bdNext) { const [i, j] = t.dataset.bdNext.split(':').map(Number); milestones[i].next[j] = t.value; }
      warn();
    });
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-bd-ms]')) { milestones.push({ name: '', next: [''] }); draw(); return; }
      const add = e.target.closest('[data-bd-add]');
      if (add) { milestones[Number(add.dataset.bdAdd)].next.push(''); draw(); return; }
      if (!e.target.closest('[data-bd-save]')) return;
      const project = $('input', el).value.trim();
      const clean = milestones.map((m) => ({ name: m.name.trim(), next: m.next.map((n) => n.trim()).filter(Boolean) })).filter((m) => m.name || m.next.length);
      if (!project || !clean.length) { announce('至少要有專案名稱和一個里程碑'); return; }
      saveToSystem('projects', { project, milestones: clean });
    });
    draw();
  },
};

/* ---------- promptkit：組一段請 AI 拆任務的 prompt ---------- */
const PROMPT_SITUATIONS = {
  start: { label: '專案剛開始', ask: '幫我把這個專案拆成 3–5 個里程碑，每個里程碑再給 1–3 個「動詞開頭、30 分鐘內做得完」的下一步。最後告訴我：今天最該先做的那一步是哪一個。' },
  stuck: { label: '卡住的任務', ask: '我一直開不了頭。請只給我一個 2 分鐘內就能開始的第一步，要具體到我知道要打開什麼、寫什麼。不要給我一整份計畫。' },
  meeting: { label: '會議後的待辦', ask: '這是我會議後記下的待辦。請把每一項改寫成「動詞開頭的下一步＋建議的完成時間」，看不出負責人或期限的，列成「要問的問題」。' },
  write: { label: '要寫的文件', ask: '幫我列出這份文件的大綱（最多 6 段），每段寫一句它要回答的問題。再告訴我：哪一段最容易先寫。' },
};
Widgets.promptkit = {
  render(props, id) {
    return `<div class="jw pk">
      <div class="jw-head"><span class="label" style="--chip:var(--m3)">組 prompt</span><span class="grow">給 AI 足夠的情境，它才拆得準</span></div>
      <div class="jw-row" role="group" aria-label="情境">${Object.entries(PROMPT_SITUATIONS).map(([k, v], i) => `<button type="button" class="btn small nb-press" data-pk="${k}" aria-pressed="${i === 0}">${esc(v.label)}</button>`).join('')}</div>
      <label for="${id}-goal">要做的事、目標</label><input class="fb-input" id="${id}-goal" autocomplete="off" placeholder="例如：11 月底前辦完 50 人的產品發表會">
      <label for="${id}-ctx">已知的情況（期限、資源、限制）</label><input class="fb-input" id="${id}-ctx" autocomplete="off" placeholder="例如：預算 10 萬、只有我和一位同事">
      <label for="${id}-me">我容易卡在哪裡</label><input class="fb-input" id="${id}-me" autocomplete="off" placeholder="例如：一開始要聯絡廠商時會一直拖">
      <pre class="pk-out" tabindex="0" aria-label="組好的 prompt"></pre>
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-pk-copy>複製</button><button type="button" class="btn small nb-press" data-pk-save>存進我的系統</button></div>
      <p class="jw-note">不要貼上公司機密、客戶個資或密碼；需要時改用代稱。</p>
    </div>`;
  },
  hydrate(el) {
    let situation = 'start';
    const [goal, ctx, me] = $$('input', el);
    function text() {
      return [
        `我有 ADHD，開始做事和排計畫對我比較難。${PROMPT_SITUATIONS[situation].ask}`,
        `要做的事：${goal.value.trim() || '（還沒填）'}`,
        `已知情況：${ctx.value.trim() || '（還沒填）'}`,
        `我容易卡在：${me.value.trim() || '（還沒填）'}`,
        '請用條列回答，每一步都要具體到我知道第一個動作是什麼。',
      ].join('\n');
    }
    function draw() { $('.pk-out', el).textContent = text(); }
    el.addEventListener('input', draw);
    el.addEventListener('click', async (e) => {
      const pick = e.target.closest('[data-pk]');
      if (pick) { situation = pick.dataset.pk; $$('[data-pk]', el).forEach((b) => b.setAttribute('aria-pressed', String(b === pick))); draw(); return; }
      if (e.target.closest('[data-pk-copy]')) { announce((await copyText(text())) ? '已複製' : '複製失敗，請手動選取文字'); return; }
      if (e.target.closest('[data-pk-save]')) saveToSystem('prompts', { situation: PROMPT_SITUATIONS[situation].label, text: text() });
    });
    draw();
  },
};

/* ---------- woop：願望、結果、障礙、計畫 ---------- */
const WOOP_FIELDS = [
  ['wish', '願望 Wish', '這週想做到的一件事（有點難但做得到）'],
  ['outcome', '結果 Outcome', '做到之後最好的結果是什麼？想像一下那個畫面'],
  ['obstacle', '障礙 Obstacle', '最可能擋住你的、在你自己身上的障礙是什麼？'],
  ['plan', '計畫 Plan', '如果＿＿（障礙出現），我就＿＿（一個動作）'],
];
Widgets.woop = {
  render(props, id) {
    return `<div class="jw wp">
      <div class="jw-head"><span class="label" style="--chip:var(--m4)">四格</span><span class="grow">先想好結果，再想好障礙</span></div>
      ${WOOP_FIELDS.map(([k, label, hint]) => `<label for="${id}-${k}">${esc(label)}</label><input class="fb-input" id="${id}-${k}" data-wp="${k}" autocomplete="off" placeholder="${esc(hint)}">`).join('')}
      <div class="jw-row"><button type="button" class="btn small primary nb-press" data-wp-save>存進我的系統</button></div>
    </div>`;
  },
  hydrate(el) {
    el.addEventListener('click', (e) => {
      if (!e.target.closest('[data-wp-save]')) return;
      const entry = Object.fromEntries($$('[data-wp]', el).map((i) => [i.dataset.wp, i.value.trim()]));
      if (WOOP_FIELDS.some(([k]) => !entry[k])) { announce('四格都要填'); return; }
      saveToSystem('woops', entry);
    });
  },
};

/* ---------- 「我的系統」頁 ---------- */
function systemItemText(kind, it) {
  if (kind === 'steps') return `${it.task} → 第一步：${it.step}`;
  if (kind === 'plans') return `如果${it.cond}，我就${it.act}`;
  if (kind === 'woops') return `願望：${it.wish}／結果：${it.outcome}／障礙：${it.obstacle}／計畫：${it.plan}`;
  if (kind === 'projects') return `${it.project}：${it.milestones.map((m) => `${m.name || '（未命名）'}［${m.next.join('；')}］`).join('、')}`;
  if (kind === 'estimates') return `${it.task}：預估 ${it.guess} 分、實際 ${it.actual} 分`;
  if (kind === 'prompts') return `（${it.situation}）${it.text}`;
  return '';
}
function systemExport() {
  const s = SystemStore.get();
  return SYSTEM_KINDS.map(({ key, label }) => [`## ${label}`, ...(s[key] || []).map((it) => `- ${systemItemText(key, it)}`)].join('\n')).join('\n\n');
}
Views.system = () => {
  const s = SystemStore.get();
  const total = SYSTEM_KINDS.reduce((n, k) => n + (s[k.key] || []).length, 0);
  return `<div class="content">
    <header class="lesson-head" style="--chip:var(--m8)"><span class="lid-big">我的</span><h1 tabindex="-1">我的系統</h1></header>
    <p>你在各課「今天就用」存下的東西都在這裡，共 ${total} 筆。資料只存在這台電腦的瀏覽器${SystemStore.persistent() ? '' : '（目前瀏覽器不允許儲存，關閉分頁後會消失）'}，不會上傳。</p>
    <div class="jw-row"><button type="button" class="btn nb-press" data-sys-copy>全部複製成文字</button><button type="button" class="btn danger nb-press" data-sys-clear>清除我的資料</button></div>
    ${SYSTEM_KINDS.map(({ key, label, lesson }) => {
      const items = s[key] || [];
      return `<section class="sys-sec"><h2><span class="label" style="--chip:var(--m${lesson[0]})">${esc(label)}</span></h2>
        ${items.length ? `<ul class="sys-list">${items.map((it) => `<li>${esc(systemItemText(key, it))} <button type="button" class="btn small nb-press" data-sys-del="${key}:${esc(it.id)}" aria-label="刪除這一筆">刪除</button></li>`).join('')}</ul>` : `<p class="sys-empty">還沒有。到 <a href="#/l/${lesson}">${lesson}</a> 做一次。</p>`}
      </section>`;
    }).join('')}
  </div>`;
};
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-sys-copy]')) { announce((await copyText(systemExport())) ? '已複製全部內容' : '複製失敗'); return; }
  if (e.target.closest('[data-sys-clear]')) {
    if (!window.confirm('要清除「我的系統」裡的所有資料嗎？課程進度不會被清除。這個動作不能復原。')) return;
    SystemStore.update((s) => { SYSTEM_KINDS.forEach(({ key }) => { s[key] = []; }); });
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    announce('已清除');
    return;
  }
  const del = e.target.closest('[data-sys-del]');
  if (!del) return;
  const [kind, id] = del.dataset.sysDel.split(':');
  SystemStore.update((s) => { s[kind] = (s[kind] || []).filter((it) => it.id !== id); });
  del.closest('li').remove();
});

/* ---------- knobs：試算拉桿（沿用 finance-psychology-course） ---------- */
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
