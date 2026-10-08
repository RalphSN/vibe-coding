/* ---------- 單元各段 ---------- */
Sections.review = (c, lesson) => `<p style="font-size:var(--fs-small);color:var(--ink-muted)">先回想前面學過的內容，再往下讀。</p>${quizList(c.review, `${lesson.id}:review`)}`;
Sections.analogy = (c) => `<div class="pair">
  <div class="callout analogy drop-in" style="--i:0"><span class="label">比喻</span><div class="body blocks">${renderBlocks(c.analogy.text)}</div></div>
  <div class="callout limit drop-in" style="--i:1"><span class="label">這個比喻的限制</span><div class="body blocks">${renderBlocks(c.analogy.limit)}</div></div>
</div>`;
Sections.model = (c) => `<div class="blocks">${c.model.svg ? renderBlock({ type: 'svg', svg: c.model.svg, caption: c.model.caption }) : ''}${renderBlocks(c.model.blocks)}</div>`;
Sections.define = (c) => `<dl class="defs">${c.define.map((d) => `<div><dt>${esc(d.term)}<span class="en">${esc(d.en || '')}</span></dt><dd>${md(d.def)}${d.example ? `<br><small><strong>例子：</strong>${md(d.example)}</small>` : ''}</dd></div>`).join('')}</dl>`;
Sections.examples = (c) => {
  const ex = c.examples;
  return `<div class="blocks">
    ${(ex.compare || []).map((cmp) => compareBlock(cmp)).join('')}
    ${renderBlocks(ex.blocks)}
    ${ex.tryit ? tryitBlock(ex.tryit) : ''}
  </div>`;
};
Sections.mistakes = (c) => `<ol class="mistakes">${c.mistakes.map((m) => `<li>
  <div class="row"><span class="k wrong">錯誤做法</span><div>${md(m.wrong)}</div></div>
  <div class="row"><span class="k why">為什麼錯</span><div>${md(m.why)}</div></div>
  <div class="row"><span class="k right">正確做法</span><div>${md(m.right)}</div></div>
</li>`).join('')}</ol>`;
Sections.practice = (c, lesson) => quizList(c.practice, `${lesson.id}:practice`);
Sections.keypoints = (c) => `<div class="callout keypoints"><span class="label">三個重點</span><div class="body"><ol style="margin:0">${c.keypoints.map((k) => `<li>${md(k)}</li>`).join('')}</ol></div></div>`;
Sections.sources = (c) => `<aside class="sources" aria-label="本課來源"><span class="label" style="--chip:var(--neutral)">來源（查證於 ${SITE.verifiedOn}）</span>
  <ol>${c.sources.map((k) => {
    const s = SOURCES[k];
    if (!s) { console.error('找不到來源：', k); return ''; }
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`;
  }).join('')}</ol></aside>`;
Sections.reference = (c, lesson) => `<div class="blocks" style="--chip:var(--m${lesson.moduleId})">${renderBlocks(c.blocks)}</div>`;

/* ---------- 元件樣式表 ---------- */
Views.styleguide = () => {
  const sampleQuiz = { type: 'mc', level: '應用', q: '`ls -la` 裡的 `-la` 是哪一種零件？', options: [
    { text: '參數，代表要列出的資料夾', why: '參數通常是要處理的對象；-開頭的是選項。' },
    { text: '兩個短選項合併寫成一個', correct: true, why: '`-la` 等於 `-l -a`：詳細格式＋包含隱藏檔。' },
  ] };
  return `<div class="content">
    <header class="lesson-head" style="--chip:var(--neutral)"><span class="lid-big">SG</span><h1>元件樣式表</h1></header>
    <p>這頁列出全站共用元件與它們的狀態。改樣式後先看這頁，深淺色各看一次。</p>

    <section class="sg-block"><h2>按鈕：預設／hover／按下／焦點／停用</h2>
      <div class="sg-row">
        <button class="btn primary nb-press" type="button">預設</button>
        <button class="btn primary nb-press force-hover" type="button">hover</button>
        <button class="btn primary nb-press force-active" type="button">按下</button>
        <button class="btn primary nb-press force-focus" type="button">焦點</button>
        <button class="btn primary nb-press" type="button" disabled>已停用</button>
      </div>
      <div class="sg-row" style="margin-top:var(--sp-4)">
        <button class="btn nb-press" type="button">次要</button>
        <button class="btn success nb-press" type="button">成功</button>
        <button class="btn danger nb-press" type="button">危險</button>
        <button class="btn small nb-press" type="button">小按鈕</button>
        <button class="btn big primary nb-press" type="button">大按鈕</button>
      </div>
    </section>

    <section class="sg-block"><h2>徽章與狀態</h2>
      <div class="sg-row">
        <span class="label">預設</span><span class="label tilt" style="--chip:var(--accent)">傾斜</span>
        ${COURSES.map((m) => `<span class="label" style="--chip:var(--m${m.id})">M${m.id}</span>`).join('')}
      </div>
      <div class="sg-row" style="margin-top:var(--sp-4)">
        <span class="status" data-state="new" role="img" aria-label="未讀"></span> 未讀
        <span class="status" data-state="visited" role="img" aria-label="讀到一半"></span> 讀到一半
        <span class="status" data-state="done" role="img" aria-label="已完成"></span> 已完成
        <span class="stamp">已完成 ✓</span>
      </div>
    </section>

    <section class="sg-block"><h2>進度條</h2>
      <div class="progress" style="--p:.35" role="progressbar" aria-valuenow="35" aria-valuemin="0" aria-valuemax="100" aria-label="範例進度"><span></span></div>
    </section>

    <section class="sg-block"><h2>卡片與提示框</h2>
      <div class="blocks">
        <div class="card"><h3 class="card-title">卡片</h3><p style="margin:0">4px 框、6px 硬陰影。</p></div>
        ${['analogy', 'limit', 'define', 'mistake', 'keypoints', 'legacy', 'tip', 'danger'].map((v) => renderBlock({ type: 'callout', variant: v, title: v, body: ['提示框內文，可以放 `程式碼`、==螢光標記== 和 [連結](https://learn.microsoft.com/en-us/powershell/)。'] })).join('')}
        ${renderBlock({ type: 'unverified', body: ['這是未確認的項目。'] })}
        ${renderBlock({ type: 'timely', body: ['這是會過期的資訊。'] })}
        ${renderBlock({ type: 'legacy', rows: [['`/cost`', '`/usage`（`/cost` 是別名）'], ['參考站固定寬度側欄', '可拖曳側欄']] })}
      </div>
    </section>

    <section class="sg-block"><h2>術語 popup</h2>
      <p>${md('把滑鼠移到 [[KV cache]] 或 [[token]] 上，或按 Tab 聚焦；滑鼠可以移進 popup，點擊會固定，按 {kbd:Esc} 關閉。')}</p>
    </section>

    <section class="sg-block"><h2>程式碼區塊</h2>
      ${codeBlock({ lang: 'bash', title: 'zsh', code: '# 列出下載資料夾裡的 PDF\nls -la ~/Downloads | grep pdf' })}
      <div style="height:var(--sp-5)"></div>
      ${codeBlock({ lang: 'powershell', title: 'PowerShell', code: 'Get-ChildItem ~\\Downloads -Filter *.pdf' })}
      <div style="height:var(--sp-5)"></div>
      ${codeBlock({ lang: 'cmd', title: 'cmd', code: 'dir %USERPROFILE%\\Downloads\\*.pdf' })}
    </section>

    <section class="sg-block"><h2>對照器</h2>
      ${compareBlock({ title: '路徑有空白', code: true, bad: 'cd {{1:My Documents}}', good: 'cd {{1:"My Documents"}}', why: ['引號把含空白的路徑包成一個參數'] })}
    </section>

    <section class="sg-block"><h2>分頁</h2>
      ${tabsBlock({ label: '作業系統', tabs: [{ label: 'macOS', blocks: ['Seatbelt 沙箱'] }, { label: 'Linux／WSL2', blocks: ['bubblewrap ＋ socat'] }, { label: 'Windows', blocks: ['原生不支援，改用 WSL2'] }] })}
    </section>

    <section class="sg-block"><h2>摺疊與測驗</h2>
      <div class="quiz-list">
        ${quizItem(sampleQuiz, 'styleguide:q:0')}
        ${quizItem({ type: 'reveal', level: '遷移', q: '先想一想：為什麼答案要先藏起來？', answer: ['先嘗試提取記憶，再看答案，記得比較牢（提取練習）。'] }, 'styleguide:r:0')}
      </div>
    </section>

    <section class="sg-block"><h2>表格</h2>
      ${tableBlock({ head: ['模式', '不經詢問', '適用'], rows: [['`default`', '只有讀取', '敏感工作'], ['`auto`', '全部＋分類器審查', '長任務'], ['`bypassPermissions`', '全部', '只限隔離環境']] })}
    </section>

    <section class="sg-block"><h2>檢查清單</h2>
      ${renderWidget({ name: 'checklist', props: { key: 'sg', items: ['第一項', '第二項', '第三項'] } })}
    </section>

    

    <section class="sg-block"><h2>鍵盤提示</h2>
      <p><kbd>←</kbd> <kbd>→</kbd> 換課、<kbd>/</kbd> 搜尋、<kbd>Esc</kbd> 關閉</p>
    </section>
  </div>`;
};

window.App.renderBlocks = renderBlocks;
window.App.Widgets = Widgets;
window.App.renderWidget = renderWidget;
window.App.uid = uid;
window.App.COPY_TEXT = COPY_TEXT;
})();
</script>
</body>
</html>
