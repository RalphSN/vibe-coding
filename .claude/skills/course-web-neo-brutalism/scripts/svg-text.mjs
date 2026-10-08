// 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡
// SVG 文字檢查：超出 viewBox、壓出所在的框
// 用法：node svg-text.mjs course-web/<slug>/index.html
import { base, blockExternal, launch } from './_pw.mjs';

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await blockExternal(page);
await page.goto(`${base}#/`); await page.waitForTimeout(300);
const ids = await page.evaluate(() => LESSONS.map((l) => l.id));
const out = [];
for (const id of ids) {
  await page.goto(`${base}#/l/${id}`); await page.waitForTimeout(200);
  const r = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('main figure svg').forEach((svg, si) => {
      const vb = svg.viewBox.baseVal;
      const rects = [...svg.querySelectorAll('rect')].map((r) => r.getBBox());
      svg.querySelectorAll('text').forEach((t) => {
        const b = t.getBBox();
        if (b.x < vb.x - 1 || b.x + b.width > vb.x + vb.width + 1 || b.y < vb.y - 1 || b.y + b.height > vb.y + vb.height + 1) bad.push(`svg${si} 超出邊界：${t.textContent.slice(0, 30)}`);
        // 文字起點落在某個框裡，整段就要在那個框裡（取最小的框）
        const host = rects.filter((r) => b.x >= r.x && b.x <= r.x + r.width && b.y + b.height / 2 >= r.y && b.y + b.height / 2 <= r.y + r.height)
          .sort((a, c) => a.width * a.height - c.width * c.height)[0];
        if (host && b.x + b.width > host.x + host.width + 1) bad.push(`svg${si} 壓框：${t.textContent.slice(0, 30)}（${Math.round(b.x + b.width - host.x - host.width)}px）`);
      });
    });
    return bad;
  });
  if (r.length) out.push(`${id}\n  ${r.join('\n  ')}`);
}
console.log(out.join('\n') || 'SVG 文字全部通過');
await browser.close();
process.exit(out.length ? 1 : 0);
