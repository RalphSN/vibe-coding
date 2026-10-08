
/* ==========================================================================
   終端機主題的互動元件
   ========================================================================== */
const SHELLS = {
  pwsh: { name: 'PowerShell', chip: 'var(--info)', cwd: 'C:\\Users\\you' },
  zsh: { name: 'zsh・macOS', chip: 'var(--m3)', cwd: '~' },
  bash: { name: 'bash', chip: 'var(--m8)', cwd: '~' },
  cmd: { name: 'cmd・命令提示字元', chip: 'var(--neutral)', cwd: 'C:\\Users\\you' },
};
function promptFor(shell, cwd) {
  const dir = cwd || SHELLS[shell].cwd;
  if (shell === 'pwsh') return `PS ${dir}> `;
  if (shell === 'cmd') return `${dir}>`;
  if (shell === 'zsh') return `you@mac ${dir} % `;
  return `you@linux:${dir}$ `;
}
const TYPE_MS = 34;
const STEP_MS = 2400;

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

/* 把指令逐字打進 target；回傳取消函式 */
function typeInto(target, text, done) {
  let i = 0;
  const timer = window.setInterval(() => {
    if (!document.body.contains(target)) { window.clearInterval(timer); return; }
    i += 1;
    target.textContent = text.slice(0, i);
    if (i >= text.length) { window.clearInterval(timer); if (done) done(); }
  }, TYPE_MS);
  return () => window.clearInterval(timer);
}

/* ---------- 終端機播放器 ---------- */
// props: { shell, title, cwd, caption, steps: [{ cmd, out, err, note, cwd }] }
function termOutHtml(s, extraClass = '') {
  if (s.out == null || s.out === '') return '';
  return `<span class="ln o${s.err ? ' err' : ''}${s.dim ? ' dim' : ''}${extraClass}">${esc(s.out)}</span>`;
}
Widgets.term = {
  render(props) {
    const shell = SHELLS[props.shell] ? props.shell : 'bash';
    const info = SHELLS[shell];
    return `<div class="tw${props.steps.length > 1 ? ' side' : ''}">
      <div class="tw-win">
        <div class="tw-bar"><span class="label" style="--chip:${info.chip}">${esc(info.name)}</span><span class="ttl">${esc(props.title || '終端機')}</span></div>
        <pre class="tw-screen" tabindex="0" aria-label="終端機畫面"></pre>
      </div>
      <div class="tw-panel">
        ${props.steps.length > 1 ? stepperControls('終端機播放控制') : ''}
        <div class="tw-dots" aria-hidden="true">${props.steps.map(() => '<span></span>').join('')}</div>
        <p class="tw-note" aria-live="polite"></p>
        ${props.caption ? `<p style="margin:0;font-size:var(--fs-small);color:var(--ink-muted)">${md(props.caption)}</p>` : ''}
      </div>
    </div>`;
  },
  hydrate(el, props) {
    const shell = SHELLS[props.shell] ? props.shell : 'bash';
    const screen = $('.tw-screen', el);
    const note = $('.tw-note', el);
    const dots = $$('.tw-dots span', el);
    let cancel = null;
    const prompt = (s) => promptFor(shell, s.cwd || props.cwd);
    const lineHtml = (s) => `<span class="ln"><span class="p">${esc(prompt(s))}</span><span class="c">${esc(s.cmd)}</span></span>${termOutHtml(s)}`;
    function draw(step, animate) {
      if (cancel) { cancel(); cancel = null; }
      const steps = props.steps;
      const s = steps[step];
      screen.innerHTML = steps.slice(0, step).map(lineHtml).join('');
      dots.forEach((d, i) => d.classList.toggle('on', i <= step));
      note.innerHTML = `<span class="step">步驟 ${step + 1} / ${steps.length}</span>${md(s.note || '')}`;
      const line = document.createElement('span');
      line.className = 'ln';
      line.innerHTML = `<span class="p">${esc(prompt(s))}</span><span class="c"></span>`;
      screen.appendChild(line);
      const cmdEl = $('.c', line);
      const finish = () => {
        screen.insertAdjacentHTML('beforeend', termOutHtml(s, animate ? ' enter' : ''));
        if (step === steps.length - 1) screen.insertAdjacentHTML('beforeend', `<span class="ln"><span class="p">${esc(prompt(s))}</span><span class="caret"></span></span>`);
        screen.scrollTop = screen.scrollHeight;
      };
      if (animate && s.cmd) cancel = typeInto(cmdEl, s.cmd, finish);
      else { cmdEl.textContent = s.cmd || ''; finish(); }
      screen.scrollTop = screen.scrollHeight;
    }
    if (props.steps.length > 1) makeStepper(el, props.steps.length, draw);
    else draw(0, false);
  },
};

/* ---------- 指令拆解器 ---------- */
const KIND_TEXT = { prog: '程式', sub: '子指令', opt: '選項', arg: '參數', op: '連接符號', var: '變數' };
const SUBCOMMAND_PROGRAMS = new Set(['git', 'npm', 'pnpm', 'yarn', 'pip', 'pip3', 'winget', 'brew', 'apt', 'apt-get', 'docker', 'codex', 'gh', 'conda', 'choco', 'scoop', 'kubectl', 'cargo', 'go', 'dotnet']);
const PROGRAM_NOTES = {
  git: '版本控制工具', npm: 'Node.js 的套件管理工具', npx: '不安裝就直接執行套件裡的指令', node: 'JavaScript 執行環境',
  python: 'Python 直譯器', python3: 'Python 直譯器（macOS／Linux 常見名稱）', py: 'Windows 的 Python 啟動器', pip: 'Python 的套件管理工具',
  ls: '列出資料夾內容', dir: '列出資料夾內容（cmd／PowerShell 別名）', cd: '切換目前所在的資料夾', pwd: '印出目前所在的資料夾',
  cat: '印出檔案內容', type: '印出檔案內容（cmd）', grep: '在文字裡找符合的行', find: '依條件找檔案', rm: '刪除檔案（不進資源回收筒）',
  cp: '複製', mv: '移動或改名', mkdir: '建立資料夾', echo: '把文字印出來', curl: '透過網址傳送或下載資料', ssh: '登入遠端電腦',
  claude: 'Claude Code', codex: 'OpenAI Codex CLI', agy: 'Google Antigravity CLI', winget: 'Windows 的套件管理工具',
  brew: 'macOS 的套件管理工具 Homebrew', apt: 'Debian／Ubuntu 的套件管理工具', sudo: '用管理員權限執行後面那整個指令',
  head: '只看開頭幾行', tail: '只看最後幾行', wc: '計算行數、字數', sort: '排序', uniq: '去掉相鄰的重複行', chmod: '修改檔案權限',
  which: '查指令實際對應到哪個檔案', where: '查指令實際對應到哪個檔案（Windows）', 'where.exe': '查指令實際對應到哪個檔案（Windows）',
  touch: '建立空檔案或更新修改時間', code: '用 VS Code 開啟', docker: '容器工具', irm: 'Invoke-RestMethod 的別名：下載網址內容', iex: 'Invoke-Expression 的別名：把文字當成指令執行',
  bash: '啟動 bash 並執行後面的內容', sh: '啟動 sh 並執行後面的內容', del: '刪除檔案（cmd）', copy: '複製（cmd）', set: '設定變數（cmd）', export: '設定環境變數並傳給子程式',
  source: '在目前的 shell 裡執行一個腳本', history: '列出指令歷史', clear: '清除畫面', cls: '清除畫面（Windows）', man: '開啟說明手冊',
};
const OP_NOTES = {
  '|': '管線：把左邊的輸出接到右邊當輸入', '>': '重新導向：把輸出寫進檔案（覆寫）', '>>': '重新導向：把輸出加到檔案最後（附加）',
  '2>': '把錯誤訊息寫進檔案', '2>&1': '把錯誤訊息併進正常輸出', '<': '從檔案讀入，當成輸入', '&&': '左邊成功才執行右邊',
  '||': '左邊失敗才執行右邊', ';': '不管成敗，依序執行', '&': '背景執行（bash）；在 cmd 是依序執行',
};
const OPERATORS = ['2>&1', '&&', '||', '>>', '2>', '|', '>', '<', ';', '&'];
const REDIRECT_OPS = new Set(['>', '>>', '2>', '<']);
function shellTokens(src) {
  const out = [];
  let cur = '';
  let quote = null;
  const flush = () => { if (cur) out.push(cur); cur = ''; };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (/\s/.test(ch)) { flush(); continue; }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    // 2> 只在字首才算運算子，避免把 file2>out 拆錯
    if (op && !(op.startsWith('2') && cur)) { flush(); out.push(op); i += op.length - 1; continue; }
    cur += ch;
  }
  flush();
  return out;
}
function classifyTokens(tokens, overrides = {}) {
  const result = [];
  let expectProgram = true;
  let program = null;
  let sawSub = false;
  let afterRedirect = false;
  let prevOpt = null;
  tokens.forEach((t) => {
    let kind;
    let note;
    if (OP_NOTES[t]) {
      kind = 'op'; note = OP_NOTES[t];
      afterRedirect = REDIRECT_OPS.has(t);
      expectProgram = !afterRedirect && t !== '2>&1';
      prevOpt = null;
    } else if (afterRedirect) {
      kind = 'arg'; note = '重新導向的目標檔案'; afterRedirect = false;
    } else if (/^(\$env:\w+|\$\{?\w+\}?|%\w+%)$/.test(t)) {
      kind = 'var'; note = '變數：執行前 shell 會先換成它的值';
    } else if (expectProgram) {
      kind = 'prog';
      program = t.toLowerCase();
      note = PROGRAM_NOTES[program] ? `程式：${PROGRAM_NOTES[program]}` : '程式：shell 會到 PATH 裡找這個名字的程式';
      expectProgram = program === 'sudo';
      sawSub = false;
    } else if (/^--?[A-Za-z]/.test(t)) {
      kind = 'opt';
      if (t.startsWith('--')) note = t.includes('=') ? '長選項，等號後面是它的值' : '長選項：用完整單字寫的開關';
      else if (/^-[a-z]{2,}$/.test(t)) note = `短選項合併寫法：等於 ${t.slice(1).split('').map((c) => `-${c}`).join(' ')}`;
      else note = /^-[A-Z][a-z]/.test(t) ? 'PowerShell 參數名稱（-開頭的單字）' : '短選項：一個字母的開關';
      prevOpt = t;
      return result.push({ t, kind, note: overrides[t] || note });
    } else if (SUBCOMMAND_PROGRAMS.has(program) && !sawSub) {
      kind = 'sub'; note = `子指令：告訴 ${program} 這次要做哪一種工作`; sawSub = true;
    } else {
      kind = 'arg';
      note = /^["']/.test(t) && prevOpt ? `參數：前一個選項 ${prevOpt} 的值（有空白所以加引號）` : /^["']/.test(t) ? '參數：引號把含空白的文字包成一個參數' : '參數：這次要處理的對象';
    }
    prevOpt = null;
    result.push({ t, kind, note: overrides[t] || note });
  });
  return result;
}
function tokenChips(parts, withNotes = true) {
  return parts.map((p, i) => `<span class="tok" data-k="${p.kind}" style="--i:${i}"><code>${esc(p.t)}</code><small>${esc(KIND_TEXT[p.kind])}</small></span>`).join('');
}
const LEGEND_HTML = `<div class="legend" aria-label="顏色說明">${Object.entries(KIND_TEXT).map(([k, v]) => `<span><i style="--kc:var(--k-${k})"></i>${v}</span>`).join('')}</div>`;
Widgets.anatomy = {
  render(props, id) {
    return `<div class="anat">
      ${LEGEND_HTML}
      <div class="anat-presets" role="group" aria-label="範例指令">${props.presets.map((p, i) => `<button type="button" class="btn small nb-press" data-preset="${i}" aria-pressed="${i === 0}">${esc(p.cmd)}</button>`).join('')}</div>
      ${props.input === false ? '' : `<div class="anat-input"><label class="visually-hidden" for="${id}-in">輸入一行指令</label><input id="${id}-in" type="text" autocomplete="off" spellcheck="false" placeholder="也可以貼上你看到的指令"><button type="button" class="btn small primary nb-press" data-go>拆解</button></div>`}
      <div class="anat-line" aria-hidden="true"></div>
      <ol class="anat-list" aria-live="polite"></ol>
      <p style="margin:0;font-size:var(--fs-small);color:var(--ink-muted)">自己輸入的指令用簡化規則判斷，像「這個參數其實是前一個選項的值」這種情況，要看該程式的說明才能確定（1-3）。</p>
    </div>`;
  },
  hydrate(el, props) {
    const line = $('.anat-line', el);
    const list = $('.anat-list', el);
    const input = $('input', el);
    function show(cmd, overrides) {
      const parts = classifyTokens(shellTokens(cmd), overrides || {});
      line.innerHTML = tokenChips(parts);
      list.innerHTML = parts.map((p) => `<li><code class="k" style="--kc:var(--k-${p.kind})">${esc(p.t)}</code><span><strong>${esc(KIND_TEXT[p.kind])}</strong>・${md(p.note.replace(/^[^：]{1,12}：/, ''))}</span></li>`).join('');
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-preset]');
      if (b) {
        const p = props.presets[Number(b.dataset.preset)];
        $$('[data-preset]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (input) input.value = p.cmd;
        show(p.cmd, p.notes);
        return;
      }
      if (e.target.closest('[data-go]') && input.value.trim()) {
        $$('[data-preset]', el).forEach((x) => x.setAttribute('aria-pressed', 'false'));
        show(input.value.trim());
      }
    });
    if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); show(input.value.trim()); } });
    if (input) input.value = props.presets[0].cmd;
    show(props.presets[0].cmd, props.presets[0].notes);
  },
};

/* ---------- 管線動畫 ---------- */
// props: { shell, stages: [{ cmd, out: [行], note, err?: [行] }] }
Widgets.pipeflow = {
  // static: true → 一次顯示全部階段的靜態圖（概念步驟用）；否則逐站播放（資料真的在流動時用）
  render(props) {
    const st = !!props.static;
    return `<div class="pf${st ? ' is-static' : ''}">
      <div class="pf-stages">
        ${props.stages.map((s, i) => `<div class="pf-stage" data-i="${i}">
          <div class="pf-head">${st ? '' : `<span class="pf-label">第 ${i + 1} 站</span>`}<code class="cmd">${esc(s.cmd)}</code></div>
          <div class="pf-head"><span class="pf-label">${st ? '重點' : '流出的資料'}</span><ul class="pf-lines"></ul>${st && s.note ? `<p class="pf-note">${md(s.note)}</p>` : ''}</div>
        </div>`).join('')}
      </div>
      ${st ? '' : `${stepperControls('管線播放控制')}<p class="tw-note" aria-live="polite"></p>`}
    </div>`;
  },
  hydrate(el, props) {
    const stages = $$('.pf-stage', el);
    const fill = (st, s) => {
      $('.pf-lines', st).innerHTML = s.out.map((l, j) => `<li style="--i:${j}">${esc(l)}</li>`).join('')
        + (s.err || []).map((l, j) => `<li class="err" style="--i:${s.out.length + j}">${esc(l)}</li>`).join('');
    };
    if (props.static) { stages.forEach((st, i) => fill(st, props.stages[i])); return; }
    const note = $('.tw-note', el);
    function draw(step) {
      stages.forEach((st, i) => {
        st.classList.toggle('is-active', i === step);
        st.classList.toggle('is-pending', i > step);
        if (i > step) { $('.pf-lines', st).innerHTML = ''; return; }
        if (i === step || !$('.pf-lines', st).innerHTML) fill(st, props.stages[i]);
      });
      note.innerHTML = `<span class="step">第 ${step + 1} 站 / 共 ${props.stages.length} 站</span>${md(props.stages[step].note || '')}`;
    }
    makeStepper(el, props.stages.length, draw, { interval: 2800 });
  },
};


/* ---------- 分類練習：每個項目點一個類別，立刻看對錯與解析 ---------- */
// props: { buckets: [{ id, label, color? }], items: [{ text, answer, why }] }
Widgets.classify = {
  render(props) {
    const btns = (i) => props.buckets.map((b) => `<button type="button" class="btn small nb-press" data-cls="${i}:${esc(b.id)}">${esc(b.label)}</button>`).join('');
    return `<div class="cls">
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

/* ==========================================================================
   本書專用：四級階梯、句子規則檢查、KV cache 參數示範、提示詞產生器
   ========================================================================== */
const FORMATS = [
  { n: 1, name: '規範文字', sub: 'ASD-STE100', color: 'var(--f1)' },
  { n: 2, name: '一張圖', sub: '圖表、Mermaid', color: 'var(--f2)' },
  { n: 3, name: '互動網頁', sub: 'HTML', color: 'var(--f3)' },
  { n: 4, name: '解說影片', sub: 'Manim', color: 'var(--f4)' },
];
const LADDER_NOTES = [
  '第 1 級：還是文字，但照航太維修手冊的規範寫：句子短、一句一件事、同一個概念用同一個詞。',
  '「But even better」→ 第 2 級：乾脆不要文字，請 AI 畫一張圖，元件、關係、流程方向一眼看完。',
  '「But even better」→ 第 3 級：請 AI 用 HTML 做一個互動網頁，可以點開說明、調參數看結果。',
  '「But even better」→ 第 4 級：量身打造一支 3Blue1Brown 風格的解說影片，卡帕西最看好的形式。',
];
Widgets.ladder = {
  // 靜態圖：4 級一次全部呈現（概念比較，不需要動畫）
  render(props) {
    return `<div class="ladder${props.hero ? ' is-hero' : ''}">
      <div class="ladder-steps" aria-hidden="true">${FORMATS.map((f, i) => `<div class="ladder-step is-on" data-i="${i}" style="--h:${(i + 1) * 25}%;--c:${f.color}">
        ${i > 0 ? '<span class="ladder-better">But even better</span>' : ''}
        <div class="ladder-bar"><span class="ladder-n">${f.n}</span><strong>${esc(f.name)}</strong><small>${esc(f.sub)}</small></div>
      </div>`).join('')}</div>
      ${props.hero ? '<p class="tw-note">一級比一級好懂，也一級比一級更費工。</p>' : `<ol class="ladder-notes">${LADDER_NOTES.map((n) => `<li>${md(n)}</li>`).join('')}</ol>`}
    </div>`;
  },
};

/* 句子規則檢查：依原文放寬版的 5 條規則，自動檢查前兩條（字數、一句一事） */
const RULE_PRESETS = [
  { label: '一般提問版', text: '如果沒有任何快取，模型得把前面1,000個token的K和V全部重新算一遍。生成第1,002個時又要再算1,001個……計算量會隨長度不斷堆高，非常浪費。' },
  { label: '點名 ASD-STE100 版', text: '沒有KV cache時，模型每產生一個新token，就要重新計算前面所有token的K和V。前面token的K和V不會改變。所以這些計算都是重複的工作。' },
];
const RULE_MAX = 30;
function splitSentences(text) {
  return text.split(/(?<=[。！？!?；;])|\n+|……/).map((s) => s.trim()).filter((s) => s.replace(/[。！？!?；;，、\s]/g, '').length > 0);
}
Widgets.rulecheck = {
  render(props, id) {
    return `<div class="rc">
      <div class="chip-row" role="group" aria-label="範例">${RULE_PRESETS.map((p, i) => `<button type="button" class="btn small nb-press" data-rc="${i}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join('')}</div>
      <label class="visually-hidden" for="${id}-t">貼上 AI 的回答</label>
      <textarea id="${id}-t" rows="4" spellcheck="false" placeholder="也可以貼上你自己拿到的 AI 回答"></textarea>
      <div class="rc-sum" aria-live="polite"></div>
      <ol class="rc-list"></ol>
      <p style="margin:0;font-size:var(--fs-small);color:var(--ink-muted)">自動檢查規則 1（每句不超過 ${RULE_MAX} 字）與規則 2（一句一件事，以逗號數量粗略估計）；規則 3–5 要靠你自己讀。</p>
    </div>`;
  },
  hydrate(el) {
    const ta = $('textarea', el);
    const sum = $('.rc-sum', el);
    const list = $('.rc-list', el);
    function run() {
      const ss = splitSentences(ta.value);
      if (!ss.length) { sum.textContent = '貼上一段文字看看。'; list.innerHTML = ''; return; }
      const rows = ss.map((s) => {
        const len = s.replace(/\s/g, '').length;
        const commas = (s.replace(/(\d),(\d)/g, '$1$2').match(/[，,]/g) || []).length;
        const long = len > RULE_MAX;
        const many = commas >= 2;
        return { s, len, long, many };
      });
      const avg = Math.round(rows.reduce((a, r) => a + r.len, 0) / rows.length);
      const bad = rows.filter((r) => r.long || r.many).length;
      sum.innerHTML = `<span class="rc-stat"><b>${rows.length}</b> 句</span><span class="rc-stat"><b>${avg}</b> 字／句</span><span class="rc-stat ${bad ? 'warn' : 'ok'}"><b>${bad}</b> 句要改</span>`;
      list.innerHTML = rows.map((r, i) => `<li class="${r.long || r.many ? 'warn' : 'ok'}" style="--i:${i}">
        <span class="rc-bar" style="--p:${Math.min(1, r.len / 60)}"></span>
        <span class="rc-len">${r.len} 字</span>
        <span class="rc-s">${esc(r.s)}</span>
        <span class="rc-tag">${r.long ? '超過 30 字' : ''}${r.long && r.many ? '・' : ''}${r.many ? '可能不只一件事' : ''}${!r.long && !r.many ? '✓' : ''}</span>
      </li>`).join('');
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rc]');
      if (!b) return;
      $$('[data-rc]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      ta.value = RULE_PRESETS[Number(b.dataset.rc)].text;
      run();
    });
    ta.addEventListener('input', () => { $$('[data-rc]', el).forEach((x) => x.setAttribute('aria-pressed', 'false')); run(); });
    ta.value = RULE_PRESETS[0].text;
    run();
  },
};

/* KV cache：拉桿調整要產生幾個 token，比較有沒有快取時，K 和 V 要算幾次 */
const KV_MAX = 24;
Widgets.kvcache = {
  render(props, id) {
    return `<div class="kv">
      <div class="kv-field">
        <label for="${id}-n">要產生幾個 token：<output data-kv-out></output></label>
        <input id="${id}-n" type="range" min="1" max="${KV_MAX}" value="8" data-kv>
      </div>
      <div class="kv-cols">
        <figure class="kv-col"><figcaption><span class="label" style="--chip:var(--danger)">沒有 KV cache</span><span data-kv-a></span></figcaption><div class="kv-grid" data-kv-ga></div></figure>
        <figure class="kv-col"><figcaption><span class="label" style="--chip:var(--success)">有 KV cache</span><span data-kv-b></span></figcaption><div class="kv-grid" data-kv-gb></div></figure>
      </div>
      <p class="tw-note" aria-live="polite"></p>
    </div>`;
  },
  hydrate(el) {
    const input = $('[data-kv]', el);
    function draw() {
      const n = Number(input.value);
      const a = (n * (n + 1)) / 2;
      $('[data-kv-out]', el).textContent = n;
      $('[data-kv-a]', el).textContent = `K、V 算了 ${a} 次`;
      $('[data-kv-b]', el).textContent = `K、V 算了 ${n} 次`;
      // 每一列是「產生第 i 個 token 時」要算的量；深色是重複計算
      const rowA = (i) => `<div class="kv-row">${Array.from({ length: i }, (_, j) => `<i class="${j === i - 1 ? 'new' : 'redo'}"></i>`).join('')}</div>`;
      const rowB = (i) => `<div class="kv-row">${Array.from({ length: i }, (_, j) => `<i class="${j === i - 1 ? 'new' : 'kept'}"></i>`).join('')}</div>`;
      $('[data-kv-ga]', el).innerHTML = Array.from({ length: n }, (_, k) => rowA(k + 1)).join('');
      $('[data-kv-gb]', el).innerHTML = Array.from({ length: n }, (_, k) => rowB(k + 1)).join('');
      const saved = a - n;
      $('.tw-note', el).innerHTML = md(`產生 **${n}** 個 token：沒有快取要算 **${a}** 次，有快取只要 **${n}** 次，省下 **${saved}** 次（${a ? Math.round((saved / a) * 100) : 0}%）。token 越多差距越大；原文的 1,000 個 token，差距就是 50 萬次對 1,000 次。`);
    }
    input.addEventListener('input', draw);
    draw();
  },
};

/* 提示詞產生器：填入主題，從原文的 6 個提示詞範本挑一個 */
const PROMPTS = [
  { key: 'en', label: '1 英文點名規範', color: 'var(--f1)', tpl: 'Explain {T} in ASD-STE100 Simplified Technical English.' },
  { key: 'en80', label: '1 英文放寬 80%', color: 'var(--f1)', tpl: 'Explain {T} 80% of the way to ASD-STE100 Simplified Technical English.' },
  { key: 'zh', label: '1 中文借用原則', color: 'var(--f1)', tpl: '請用ASD-STE100的原則，以中文解釋{T}。' },
  { key: 'zh5', label: '1 中文五條規則', color: 'var(--f1)', tpl: '請用中文解釋{T}。寫作時遵守以下規則：\n1. 句子要短，每句盡量不超過30個字。\n2. 一句只講一件事。\n3. 同一個概念從頭到尾用同一個詞，不要換說法。\n4. 用主動語態，每句的主詞要清楚。\n5. 不要堆疊名詞，一個名詞片語最多三個詞。' },
  { key: 'img', label: '2 一張圖', color: 'var(--f2)', tpl: '請用一張圖解釋{T}，不要用長篇文字。圖上要標出關鍵元件、元件之間的關係和流程方向，每個標籤不超過10個字。' },
  { key: 'html', label: '3 互動網頁', color: 'var(--f3)', tpl: '請用HTML做一個單頁互動網頁解釋{T}。要有可以點開的段落說明，以及一個可以調整參數、即時看到結果變化的互動元件。所有程式碼放在同一個檔案裡。' },
  { key: 'video', label: '4 解說影片', color: 'var(--f4)', tpl: '製作一支主題為{T}、3b1b（3Blue1Brown）風格的解說影片。用我的ElevenLabs API key配音。' },
];
Widgets.promptgen = {
  render(props, id) {
    return `<div class="pg">
      <div class="anat-input"><label for="${id}-t" style="font-weight:700;align-self:center">主題</label><input id="${id}-t" type="text" value="${esc(props.topic || 'KV cache')}" autocomplete="off"></div>
      <div class="chip-row" role="group" aria-label="選一種格式">${PROMPTS.map((p, i) => `<button type="button" class="btn small nb-press" data-pg="${i}" aria-pressed="${i === (props.start || 0)}" style="--dot:${p.color}"><i class="pg-dot" aria-hidden="true"></i>${esc(p.label)}</button>`).join('')}</div>
      <div class="pg-out"><pre tabindex="0" aria-live="polite"></pre><button type="button" class="btn small primary nb-press" data-pg-copy>複製提示詞</button></div>
      <p class="pg-msg" aria-live="polite" style="margin:0;font-size:var(--fs-small)"></p>
    </div>`;
  },
  hydrate(el, props) {
    const input = $('input', el);
    const pre = $('pre', el);
    const msg = $('.pg-msg', el);
    let cur = props.start || 0;
    const fill = () => { pre.textContent = PROMPTS[cur].tpl.replace(/\{T\}/g, input.value.trim() || '[主題]'); msg.textContent = ''; };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-pg]');
      if (b) { cur = Number(b.dataset.pg); $$('[data-pg]', el).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); fill(); return; }
      if (e.target.closest('[data-pg-copy]')) {
        try { await navigator.clipboard.writeText(pre.textContent); msg.textContent = '已複製，貼到 ChatGPT、Claude 或 Gemini 試試。'; }
        catch (err) { const r = document.createRange(); r.selectNodeContents(pre); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); msg.textContent = '瀏覽器不允許自動複製，已幫你選取文字，請按 Ctrl+C／Cmd+C。'; }
      }
    });
    input.addEventListener('input', fill);
    fill();
  },
};
