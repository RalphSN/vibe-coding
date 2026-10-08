// 列出「正確答案剛好是最長選項」的題目與領先字數，用來挑要改寫的題目
// 用法：node longest-answer.mjs course-web/<slug>/index.html
import { base, blockExternal, launch } from './_pw.mjs';

const browser = await launch();
const page = await browser.newPage();
await blockExternal(page);
await page.goto(`${base}#/`); await page.waitForTimeout(400);
const list = await page.evaluate(() => {
  const len = (t) => t.replace(/`/g, '').length;
  const res = [];
  LESSONS.forEach((l) => {
    const c = l.content || {};
    const qs = [...(c.practice || []), ...(c.review || []), ...((c.blocks || []).filter((b) => b.type === 'quiz').flatMap((b) => b.items))];
    qs.filter((q) => q.type === 'mc').forEach((q) => {
      const lens = q.options.map((o) => len(o.text));
      const max = Math.max(...lens);
      const ci = q.options.findIndex((o) => o.correct);
      if (lens[ci] === max && lens.filter((x) => x === max).length === 1) {
        const second = Math.max(...lens.filter((_, i) => i !== ci));
        res.push(`${l.id}\t領先 ${lens[ci] - second} 字\t${q.options[ci].text}`);
      }
    });
  });
  return res.sort((a, b) => +b.split('領先 ')[1].split(' ')[0] - +a.split('領先 ')[1].split(' ')[0]);
});
console.log(list.join('\n') || '沒有正確答案最長的題目');
await browser.close();
