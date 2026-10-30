// 全課審查：不得有測驗、深入段落、深入思考題數量、缺漏段落、每課圖數、互動數、缺漏術語、360px 溢出、JS 錯誤
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
  const out = { deep: 0, thinking: 0, problems: [] };
  // 2026-10-29 起不出測驗：選擇題、回顧、補完、預測、分類練習、quiz 區塊都算違規
  const walk = (v, fn) => { if (Array.isArray(v)) v.forEach((x) => walk(x, fn)); else if (v && typeof v === 'object') { fn(v); Object.values(v).forEach((x) => walk(x, fn)); } };
  LESSONS.forEach((l) => {
    const c = l.content;
    if (!c) { out.problems.push(`${l.id}: 沒有內容`); return; }
    if (c.review) out.problems.push(`${l.id}: 仍有暖身回顧`);
    walk(c, (o) => {
      if (o.type === 'mc') out.problems.push(`${l.id}: 仍有選擇題`);
      if (o.type === 'quiz') out.problems.push(`${l.id}: 仍有 quiz 區塊`);
      if (o.type === 'tryit') out.problems.push(`${l.id}: 仍有補完題`);
      if (o.name === 'classify') out.problems.push(`${l.id}: 仍有分類練習`);
      if (o.predict) out.problems.push(`${l.id}: 仍有預測題`);
    });
    if (c.examples && c.examples.tryit) out.problems.push(`${l.id}: 仍有補完題`);
    const thinking = (c.practice || []).length;
    out.thinking += thinking;
    if (thinking > 2) out.problems.push(`${l.id}: 深入思考題 ${thinking} 題（上限 2）`);
    if (c.layout !== 'reference') {
      ['goals', 'analogy', 'model', 'define', 'examples', 'mistakes', 'keypoints', 'sources'].forEach((k) => { if (!c[k]) out.problems.push(`${l.id}: 缺 ${k}`); });
      if ((c.mistakes || []).length < 3) out.problems.push(`${l.id}: 常見錯誤少於 3`);
      const blocks = (c.examples && c.examples.blocks) || [];
      const hasDeep = blocks.some((b) => b && b.type === 'heading' && /^深入/.test(b.text || ''));
      if (hasDeep) out.deep++; else out.problems.push(`${l.id}: 缺「深入」段落`);
    }
  });
  return out;
});
console.log(`深入段落 ${stats.deep} 課，深入思考題 ${stats.thinking} 題`);
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
      widgets: document.querySelectorAll('main [data-widget]').length,
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
process.exit(errors.length || issues.length || stats.problems.length ? 1 : 0);
