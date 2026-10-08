
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

/* ---------- 資料夾樹 ---------- */
// props: { style: 'unix'|'win', tree: { 名稱: { ... } 或 null（檔案） }, home: [...], start: [...], actions: [指令] }
function fsGet(tree, path) {
  let node = tree;
  for (const part of path) {
    if (!node || typeof node !== 'object' || !(part in node)) return undefined;
    node = node[part];
  }
  return node;
}
function fsFormat(style, path) {
  if (style === 'win') return `C:\\${path.join('\\')}`;
  return `/${path.join('/')}`;
}
function fsShort(style, path, home) {
  if (style === 'win') return fsFormat(style, path);
  const isHome = home.every((p, i) => path[i] === p);
  if (isHome) return `~${path.length > home.length ? `/${path.slice(home.length).join('/')}` : ''}`;
  return fsFormat(style, path);
}
function fsResolve(style, cwd, home, raw) {
  let text = raw.trim().replace(/^["']|["']$/g, '');
  let base;
  if (text === '~' || text.startsWith('~/') || text.startsWith('~\\')) { base = [...home]; text = text.slice(1); }
  else if (/^[A-Za-z]:/.test(text)) { base = []; text = text.slice(2); }
  else if (text.startsWith('/') || text.startsWith('\\')) base = [];
  else base = [...cwd];
  text.split(/[\\/]+/).filter(Boolean).forEach((part) => {
    if (part === '.') return;
    if (part === '..') base.pop();
    else base.push(part);
  });
  return base;
}
const FS_DIR_ICON = '<svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true"><path d="M1 2h5l2 2h7v9H1z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const FS_FILE_ICON = '<svg width="12" height="14" viewBox="0 0 12 14" aria-hidden="true"><path d="M1 1h7l3 3v9H1z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
function fsTreeHtml(node, path, cwd, depth = 0) {
  return Object.entries(node).map(([name, child]) => {
    const p = [...path, name];
    const isDir = child && typeof child === 'object';
    const here = isDir && p.length === cwd.length && p.every((x, i) => x === cwd[i]);
    const trail = isDir && !here && p.length < cwd.length && p.every((x, i) => x === cwd[i]);
    const label = `<span class="fs-node${isDir ? '' : ' is-file'}${here ? ' is-here' : ''}${trail ? ' is-trail' : ''}">${isDir ? FS_DIR_ICON : FS_FILE_ICON}${esc(name)}${isDir ? '/' : ''}${here ? '<span class="here-tag">你在這裡</span>' : ''}</span>`;
    return `<li>${label}${isDir && Object.keys(child).length ? `<ul>${fsTreeHtml(child, p, cwd, depth + 1)}</ul>` : ''}</li>`;
  }).join('');
}
Widgets.fstree = {
  render(props, id) {
    const shell = props.style === 'win' ? 'pwsh' : 'zsh';
    return `<div class="fs">
      <ul class="fs-tree" aria-label="資料夾樹"></ul>
      <div class="fs-side">
        <div class="fs-actions" role="group" aria-label="試試這些指令">${props.actions.map((a) => `<button type="button" class="btn small nb-press" data-fs="${esc(a)}">${esc(a)}</button>`).join('')}</div>
        <div class="anat-input"><label class="visually-hidden" for="${id}-in">輸入 cd、ls 或 pwd 指令</label><input id="${id}-in" type="text" autocomplete="off" spellcheck="false" placeholder="自己輸入：cd、ls、pwd"><button type="button" class="btn small primary nb-press" data-fs-go>執行</button></div>
        <div class="tw-win"><div class="tw-bar"><span class="label" style="--chip:${SHELLS[shell].chip}">${esc(SHELLS[shell].name)}</span><span class="ttl">模擬，不影響你的電腦</span></div><pre class="tw-screen" tabindex="0" aria-label="終端機畫面" aria-live="polite"></pre></div>
        <button type="button" class="btn small nb-press" data-fs-reset style="justify-self:start">回到起點</button>
      </div>
    </div>`;
  },
  hydrate(el, props) {
    const style = props.style === 'win' ? 'win' : 'unix';
    const shell = style === 'win' ? 'pwsh' : 'zsh';
    const tree = $('.fs-tree', el);
    const screen = $('.tw-screen', el);
    const input = $('input', el);
    let cwd = [...props.start];
    const promptNow = () => promptFor(shell, style === 'win' ? fsFormat(style, cwd) : fsShort(style, cwd, props.home));
    function drawTree() { tree.innerHTML = fsTreeHtml(props.tree, [], cwd); }
    function print(cmd, out, err) {
      screen.insertAdjacentHTML('beforeend', `<span class="ln"><span class="p">${esc(promptNow.prev || promptNow())}</span><span class="c">${esc(cmd)}</span></span>${out ? `<span class="ln o enter${err ? ' err' : ''}">${esc(out)}</span>` : ''}`);
      screen.scrollTop = screen.scrollHeight;
    }
    function run(raw) {
      const cmd = raw.trim();
      if (!cmd) return;
      const [name, ...rest] = cmd.split(/\s+/);
      const arg = rest.join(' ');
      const lower = name.toLowerCase();
      const before = promptNow();
      promptNow.prev = before;
      if (['cd', 'set-location', 'sl', 'chdir'].includes(lower)) {
        if (!arg) {
          if (style === 'unix') { cwd = [...props.home]; print(cmd, ''); }
          else print(cmd, '（這個模擬器裡請在 cd 後面加上路徑，例如 cd ~）', true);
        } else {
          const target = fsResolve(style, cwd, props.home, arg);
          const node = fsGet(props.tree, target);
          if (node && typeof node === 'object') { cwd = target; print(cmd, ''); }
          else if (node === null) print(cmd, style === 'win' ? `Set-Location: '${arg}' 不是資料夾，是檔案。` : `cd: not a directory: ${arg}`, true);
          else print(cmd, style === 'win' ? `Set-Location: Cannot find path '${fsFormat(style, target)}' because it does not exist.` : `cd: no such file or directory: ${arg}`, true);
        }
      } else if (['ls', 'dir', 'gci', 'get-childitem'].includes(lower)) {
        const target = arg && !arg.startsWith('-') ? fsResolve(style, cwd, props.home, arg) : cwd;
        const node = fsGet(props.tree, target);
        if (node && typeof node === 'object') {
          const names = Object.entries(node).map(([n, c]) => (c && typeof c === 'object' ? `${n}${style === 'win' ? '' : '/'}` : n));
          print(cmd, names.length ? (style === 'win' ? names.map((n) => `${fsGet(props.tree, [...target, n]) && typeof fsGet(props.tree, [...target, n]) === 'object' ? 'd----' : '-a---'}  ${n}`).join('\n') : names.join('   ')) : '（空的資料夾）');
        } else print(cmd, style === 'win' ? `Get-ChildItem: Cannot find path '${fsFormat(style, target)}' because it does not exist.` : `ls: ${arg}: No such file or directory`, true);
      } else if (['pwd', 'get-location', 'gl'].includes(lower)) {
        print(cmd, fsFormat(style, cwd));
      } else {
        print(cmd, '這個模擬器只認得 cd、ls（dir）、pwd。', true);
      }
      promptNow.prev = null;
      drawTree();
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-fs]');
      if (b) { run(b.dataset.fs); return; }
      if (e.target.closest('[data-fs-go]')) { run(input.value); input.value = ''; input.focus(); }
      if (e.target.closest('[data-fs-reset]')) { cwd = [...props.start]; screen.innerHTML = ''; drawTree(); }
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(input.value); input.value = ''; } });
    drawTree();
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

/* ---------- PATH 搜尋 ---------- */
// props: { shell, dirs: [{ path, has: [程式名稱] }], presets: [名稱] }
const PATH_STEP_MS = 650;
Widgets.pathfinder = {
  render(props, id) {
    return `<div class="pathf">
      <div class="anat-presets" role="group" aria-label="要找的指令">${props.presets.map((p) => `<button type="button" class="btn small nb-press" data-find="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="anat-input"><label class="visually-hidden" for="${id}-in">輸入指令名稱</label><input id="${id}-in" type="text" autocomplete="off" spellcheck="false" placeholder="輸入一個指令名稱"><button type="button" class="btn small primary nb-press" data-find-go>開始找</button></div>
      <ol class="pathf-dirs">${props.dirs.map((d) => `<li><span>${esc(d.path)}</span><span class="res"></span></li>`).join('')}</ol>
      <p class="tw-note" aria-live="polite">選一個指令，看 shell 怎麼依照 PATH 的順序一個一個資料夾找。</p>
    </div>`;
  },
  hydrate(el, props) {
    const rows = $$('.pathf-dirs li', el);
    const note = $('.tw-note', el);
    const input = $('input', el);
    let timer = null;
    const exe = props.shell === 'pwsh' || props.shell === 'cmd';
    function reset() { window.clearInterval(timer); rows.forEach((r) => { r.className = ''; $('.res', r).textContent = ''; }); }
    function find(raw) {
      const name = raw.trim();
      if (!name) return;
      reset();
      const lower = name.toLowerCase().replace(/\.exe$/, '');
      const hitIndex = props.dirs.findIndex((d) => d.has.map((h) => h.toLowerCase()).includes(lower));
      const last = hitIndex === -1 ? rows.length - 1 : hitIndex;
      const finish = () => {
        if (hitIndex === -1) {
          note.innerHTML = md(exe
            ? `每個資料夾都沒有 \`${name}\`。PowerShell 會說：「The term '${name}' is not recognized as a name of a cmdlet, function, script file, or executable program.」`
            : `每個資料夾都沒有 \`${name}\`。zsh 會說：「zsh: command not found: ${name}」。`);
        } else {
          note.innerHTML = md(`在第 ${hitIndex + 1} 個資料夾找到 \`${name}${exe ? '.exe' : ''}\`，**後面的資料夾不再找**。實際執行的是 \`${props.dirs[hitIndex].path}${exe ? '\\' : '/'}${name}${exe ? '.exe' : ''}\`。`);
        }
      };
      const mark = (i) => {
        const r = rows[i];
        r.className = i === hitIndex ? 'is-hit' : 'is-miss';
        $('.res', r).textContent = i === hitIndex ? '✓ 找到' : '✗ 沒有';
      };
      if (prefersReducedMotion()) { for (let i = 0; i <= last; i += 1) mark(i); finish(); return; }
      let i = 0;
      note.textContent = `尋找 ${name} 中…`;
      rows[0].className = 'is-checking';
      timer = window.setInterval(() => {
        if (!document.body.contains(el)) { window.clearInterval(timer); return; }
        mark(i);
        i += 1;
        if (i > last) { window.clearInterval(timer); finish(); return; }
        rows[i].className = 'is-checking';
      }, PATH_STEP_MS);
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-find]');
      if (b) { input.value = b.dataset.find; find(b.dataset.find); }
      if (e.target.closest('[data-find-go]')) find(input.value);
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); find(input.value); } });
  },
};

/* ---------- 方言對照 ---------- */
// props: { tasks: [{ label, pwsh, zsh, bash, cmd, note }] }；zsh 省略代表和 bash 相同；cmd 為 null 代表沒有直接對應
const ROSETTA_ORDER = ['pwsh', 'zsh', 'bash', 'cmd'];
Widgets.rosetta = {
  render(props) {
    return `<div class="ros">
      <div class="chip-row" role="group" aria-label="選一件任務">${props.tasks.map((t, i) => `<button type="button" class="btn small nb-press" data-task="${i}" aria-pressed="${i === 0}">${esc(t.label)}</button>`).join('')}</div>
      <div class="ros-grid" aria-live="polite"></div>
      <p class="ros-note" style="margin:0"></p>
    </div>`;
  },
  hydrate(el, props) {
    const grid = $('.ros-grid', el);
    const noteEl = $('.ros-note', el);
    function show(i) {
      const t = props.tasks[i];
      grid.innerHTML = ROSETTA_ORDER.map((sh, j) => {
        let code = t[sh];
        let small = '';
        if (sh === 'zsh' && code == null) { code = t.bash; small = '和 bash 相同'; }
        if (code == null) { code = '（沒有直接對應的寫法）'; small = '—'; }
        return `<section class="ros-card${sh === 'cmd' ? ' is-legacy' : ''}" style="--i:${j}"><header><span class="label" style="--chip:${SHELLS[sh].chip}">${esc(SHELLS[sh].name)}</span>${small ? `<small>${esc(small)}</small>` : ''}</header><pre tabindex="0">${esc(code)}</pre></section>`;
      }).join('');
      noteEl.innerHTML = t.note ? md(t.note) : '';
      $$('[data-task]', el).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.task) === i)));
    }
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-task]'); if (b) show(Number(b.dataset.task)); });
    show(0);
  },
};

/* ---------- 首頁：逐字打出指令，再拆成彩色的部件 ---------- */
const HERO_SAMPLES = [
  'git commit -m "第一版"',
  'ls -la ~/Downloads | grep pdf',
  'npm install && npm run dev',
  'claude -p "解釋這個專案" > notes.md',
];
const HERO_PAUSE_MS = 2600;
Widgets.herodemo = {
  render() {
    return `<div class="herodemo" aria-hidden="true">
      <div class="tw-bar"><span class="label" style="--chip:var(--m3)">zsh・macOS</span><span class="ttl">一行指令＝幾個零件</span></div>
      <pre class="tw-screen"><span class="ln"><span class="p">you@mac ~ % </span><span class="c"></span><span class="caret"></span></span></pre>
      <div class="hd-parts"></div>
    </div>`;
  },
  hydrate(el) {
    const cmdEl = $('.c', el);
    const parts = $('.hd-parts', el);
    let n = 0;
    const show = (cmd) => { parts.innerHTML = tokenChips(classifyTokens(shellTokens(cmd))); };
    if (prefersReducedMotion()) { cmdEl.textContent = HERO_SAMPLES[0]; show(HERO_SAMPLES[0]); return; }
    function next() {
      if (!document.body.contains(el)) return;
      const cmd = HERO_SAMPLES[n % HERO_SAMPLES.length];
      n += 1;
      parts.innerHTML = '';
      typeInto(cmdEl, cmd, () => {
        show(cmd);
        window.setTimeout(next, HERO_PAUSE_MS);
      });
    }
    next();
  },
};
