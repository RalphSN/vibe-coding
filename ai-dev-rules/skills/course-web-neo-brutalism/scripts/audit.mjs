// 全課審查：選擇題結構、正確答案最長比例、缺漏段落、每課圖數、缺漏術語、360px 溢出、JS 錯誤
// 用法：node audit.mjs course-web/<slug>/index.html
import { base, blockExternal, launch } from './_pw.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// 被 blockExternal 中止的 CDN 請求會印 Failed to load resource，不算程式錯誤
page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
await blockExternal(page);
await page.goto(`${base}#/`);
await page.waitForTimeout(500);
const stats = await page.evaluate(() => {
  const out = { mc: 0, longest: 0, problems: [] };
  const len = (t) => t.replace(/`/g, '').length;
  const checkMc = (q, where) => {
    if (q.type !== 'mc') return;
    out.mc++;
    const correct = q.options.filter((o) => o.correct);
    if (correct.length !== 1) out.problems.push(`${where}: 正確答案數 ${correct.length}`);
    q.options.forEach((o, i) => { if (!o.why) out.problems.push(`${where}: 選項 ${i} 沒有 why`); });
    const max = Math.max(...q.options.map((o) => len(o.text)));
    if (correct[0] && len(correct[0].text) === max && q.options.filter((o) => len(o.text) === max).length === 1) out.longest++;
  };
  LESSONS.forEach((l) => {
    const c = l.content;
    if (!c) { out.problems.push(`${l.id}: 沒有內容`); return; }
    (c.practice || []).forEach((q, i) => checkMc(q, `${l.id} practice ${i}`));
    (c.review || []).forEach((q, i) => checkMc(q, `${l.id} review ${i}`));
    (c.blocks || []).filter((b) => b.type === 'quiz').forEach((b) => b.items.forEach((q, i) => checkMc(q, `${l.id} quiz ${i}`)));
    if (c.layout !== 'reference') {
      ['goals', 'analogy', 'model', 'define', 'examples', 'mistakes', 'practice', 'keypoints', 'sources'].forEach((k) => { if (!c[k]) out.problems.push(`${l.id}: 缺 ${k}`); });
      if ((c.mistakes || []).length < 3) out.problems.push(`${l.id}: 常見錯誤少於 3`);
      if ((c.practice || []).length < 3) out.problems.push(`${l.id}: 練習少於 3`);
    }
  });
  return out;
});
const ratio = stats.mc ? (100 * stats.longest / stats.mc) : 0;
console.log(`選擇題 ${stats.mc} 題，正確答案最長 ${stats.longest} 題（${ratio.toFixed(1)}%，上限 35%）${ratio > 35 ? ' ← 超標' : ''}`);
console.log('結構問題', stats.problems.length ? '\n' + stats.problems.join('\n') : '無');

const ids = await page.evaluate(() => LESSONS.map((l) => l.id));
const small = await browser.newPage({ viewport: { width: 360, height: 800 } });
small.on('pageerror', (e) => errors.push('360: ' + e.message));
await blockExternal(small);
const issues = [];
for (const id of ids) {
  await small.goto(`${base}#/l/${id}`);
  await small.waitForTimeout(250);
  const r = await small.evaluate(() => {
    const over = [...document.querySelectorAll('main *')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.table-wrap, pre, .tw-screen, .anat-line');
    }).map((el) => el.className || el.tagName).slice(0, 3);
    return {
      figs: document.querySelectorAll('main figure svg').length,
      widgets: document.querySelectorAll('main [data-widget], main .quiz').length,
      missing: [...document.querySelectorAll('.term-missing')].map((e) => e.textContent),
      scroll: document.documentElement.scrollWidth > window.innerWidth,
      over,
    };
  });
  if (r.figs < 2 || !r.widgets || r.missing.length || r.scroll || r.over.length) issues.push(`${id} ${JSON.stringify(r)}`);
}
console.log('每課（圖 ≥ 2、互動 ≥ 1、無缺漏術語、360px 無溢出）', issues.length ? '\n' + issues.join('\n') : '全部通過');
console.log('JS 錯誤', errors.length ? '\n' + errors.join('\n') : '0');
await browser.close();
process.exit(errors.length || issues.length || stats.problems.length || ratio > 35 ? 1 : 0);
