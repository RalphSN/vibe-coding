// 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡
// 逐課總表：版型、圖數、互動元件、程式碼區塊、閱讀分鐘
// 用法：node lesson-table.mjs course-web/<slug>/index.html
import { base, blockExternal, launch } from './_pw.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await blockExternal(page);
await page.goto(`${base}#/`); await page.waitForTimeout(400);
const ids = await page.evaluate(() => LESSONS.map((l) => l.id));
const rows = ['id\t版型\t圖\t互動元件\t程式碼\t分鐘\t標題'];
for (const id of ids) {
  await page.goto(`${base}#/l/${id}`); await page.waitForTimeout(150);
  rows.push(await page.evaluate((id) => {
    const l = LESSON_BY_ID[id]; const c = l.content;
    const w = [...document.querySelectorAll('main [data-widget]')].map((x) => x.dataset.widget).join(',') || '-';
    return [id, c ? (c.layout || 'std') : 'EMPTY', document.querySelectorAll('main figure svg').length, w,
      document.querySelectorAll('main pre').length, App.readingMinutes(l), l.plain].join('\t');
  }, id));
}
console.log(rows.join('\n'));
await browser.close();
