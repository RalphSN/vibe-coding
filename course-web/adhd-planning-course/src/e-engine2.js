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
// 今天就用：{ minutes, task: [段落], blocks: [互動元件等] }；練習量和改善程度相關（solanto-2010）
Sections.today = (c) => `<div class="callout today"><span class="label" style="--chip:var(--accent)">今天就用・約 ${c.today.minutes || 3} 分鐘</span><div class="body blocks">${renderBlocks(c.today.task)}</div></div>
  ${c.today.blocks ? `<div class="blocks" style="margin-top:var(--sp-4)">${renderBlocks(c.today.blocks)}</div>` : ''}`;
Sections.keypoints =(c) => `<div class="callout keypoints"><span class="label">三個重點</span><div class="body"><ol style="margin:0">${c.keypoints.map((k) => `<li>${md(k)}</li>`).join('')}</ol></div></div>`;
Sections.sources = (c) => `<aside class="sources" aria-label="本課來源"><span class="label" style="--chip:var(--neutral)">來源（查證於 ${SITE.verifiedOn}）</span>
  <ol>${c.sources.map((k) => {
    const s = SOURCES[k];
    if (!s) { console.error('找不到來源：', k); return ''; }
    return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`;
  }).join('')}</ol></aside>`;
Sections.reference = (c, lesson) => `<div class="blocks" style="--chip:var(--m${lesson.moduleId})">${renderBlocks(c.blocks)}</div>`;

/* ---------- 元件樣式表 ---------- */
Views.styleguide = () => {
  const sampleQuiz = { type: 'mc', level: '應用', q: '下面哪一個是「下一步」？', options: [
    { text: '處理報告', why: '「處理」看不出第一個動作是什麼。' },
    { text: '打開報告檔，寫下標題', correct: true, why: '動詞開頭、看得到，坐下就能做。' },
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
        ${['analogy', 'limit', 'define', 'mistake', 'keypoints', 'legacy', 'tip', 'danger'].map((v) => renderBlock({ type: 'callout', variant: v, title: v, body: ['提示框內文，可以放 `程式碼`、==螢光標記== 和 [連結](https://nice.org.uk/guidance/ng87/documents/evidence-review-5)。'] })).join('')}
        ${renderBlock({ type: 'unverified', body: ['這是未確認的項目。'] })}
        ${renderBlock({ type: 'timely', body: ['這是會過期的資訊。'] })}
        ${renderBlock({ type: 'legacy', rows: [['「明天再說」', '「明天 9 點一坐下就打開報告檔」'], ['「我要努力」', '「如果下午 3 點，我就先寫 5 分鐘」']] })}
      </div>
    </section>

    <section class="sg-block"><h2>術語 popup</h2>
      <p>${md('把滑鼠移到 [[執行功能]] 或 [[執行意圖]] 上，或按 Tab 聚焦；滑鼠可以移進 popup，點擊會固定，按 {kbd:Esc} 關閉。')}</p>
    </section>

    <section class="sg-block"><h2>對照器</h2>
      ${compareBlock({ title: '同一件事的兩種寫法', bad: '{{1:處理}}報告', good: '{{1:打開}}報告檔，寫下標題', why: ['動詞要看得到，坐下就能做'] })}
    </section>

    <section class="sg-block"><h2>分頁</h2>
      ${tabsBlock({ label: '卡在哪一段', tabs: [{ label: '想不清楚', blocks: ['先找下一步（3-1）'] }, { label: '開不了頭', blocks: ['把第一步縮小（1-1）'] }, { label: '中途斷掉', blocks: ['留麵包屑（5-2）'] }] })}
    </section>

    <section class="sg-block"><h2>摺疊與測驗</h2>
      <div class="quiz-list">
        ${quizItem(sampleQuiz, 'styleguide:q:0')}
        ${quizItem({ type: 'reveal', level: '遷移', q: '先想一想：為什麼答案要先藏起來？', answer: ['先嘗試提取記憶，再看答案，記得比較牢（提取練習）。'] }, 'styleguide:r:0')}
      </div>
    </section>

    <section class="sg-block"><h2>表格</h2>
      ${tableBlock({ head: ['槓桿', '往哪調', '對應的課'], rows: [['做得到的感覺', '把第一步縮小', '1-1'], ['重要或有趣', '讓現在就有回饋', '1-4'], ['分心的拉力', '把分心的東西移走', '1-3']] })}
    </section>

    <section class="sg-block"><h2>檢查清單</h2>
      ${renderWidget({ name: 'checklist', props: { key: 'sg', items: ['第一項', '第二項', '第三項'] } })}
    </section>

    <section class="sg-block"><h2>stuckcheck</h2>
      ${renderWidget({ name: 'stuckcheck', props: {} })}
    </section>
    <section class="sg-block"><h2>levers</h2>
      ${renderWidget({ name: 'levers', props: {} })}
    </section>
    <section class="sg-block"><h2>shrinker</h2>
      ${renderWidget({ name: 'shrinker', props: {} })}
    </section>
    <section class="sg-block"><h2>ifthen</h2>
      ${renderWidget({ name: 'ifthen', props: {} })}
    </section>
    <section class="sg-block"><h2>timebox</h2>
      ${renderWidget({ name: 'timebox', props: {} })}
    </section>
    <section class="sg-block"><h2>estimator</h2>
      ${renderWidget({ name: 'estimator', props: {} })}
    </section>
    <section class="sg-block"><h2>breakdown</h2>
      ${renderWidget({ name: 'breakdown', props: {} })}
    </section>
    <section class="sg-block"><h2>promptkit</h2>
      ${renderWidget({ name: 'promptkit', props: {} })}
    </section>
    <section class="sg-block"><h2>woop</h2>
      ${renderWidget({ name: 'woop', props: {} })}
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
