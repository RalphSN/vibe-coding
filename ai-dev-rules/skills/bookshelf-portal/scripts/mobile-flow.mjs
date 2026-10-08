#!/usr/bin/env node
/**
 * 3D 書櫃的手機流程測試（Playwright，模擬 iPhone）：
 * 載入時間 → 點書出現羊皮紙介紹與「前往閱讀」→ 點外部連結的書 → 書櫃自動重置。
 * 用法：node mobile-flow.mjs <入口 index.html> [外部書的 id] [截圖資料夾]
 * 環境變數：
 *   PW_ROOT       全域 node_modules 路徑（專案沒裝 Playwright 時）
 *   CHROMIUM_PATH 指定 Chromium 執行檔
 *   BLOCK_FONTS   設為 1 時中止 Google Fonts 請求（沙箱、離線環境）
 *   THREE_DIR     本機 three 套件資料夾（node_modules/three）；CDN 連不到時用它代替
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  const root = process.env.PW_ROOT || execSync('npm root -g').toString().trim();
  return createRequire(join(root, '/'))('playwright');
}
const { chromium, devices } = loadPlaywright();

const page0 = 'file://' + resolve(process.argv[2] || 'index.html');
const externalId = process.argv[3] || 'papaya';
const out = resolve(process.argv[4] || 'mobile-shots');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], // 無 GPU 環境也能跑 WebGL
});
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
if (process.env.THREE_DIR) {
  // 把 import map 的 three CDN 網址改指向本機檔案（版本要和頁面一致）
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\//, (r) => {
    const rel = r.request().url().replace(/^.*three@[^/]+\//, '');
    r.fulfill({ path: join(process.env.THREE_DIR, rel), contentType: 'application/javascript' });
  });
}
// Google Fonts 連不到時直接中止，不然 goto 會等到逾時（頁面本身有 3 秒字型逾時）
if (process.env.BLOCK_FONTS) await ctx.route(/fonts\.g/, (r) => r.abort());
// 外部網址回 204：頁面不會離開，模擬「跳去外部 app、原頁面留在背景」
await ctx.route(/^https?:\/\/(?!cdn\.jsdelivr|fonts\.g)/, (r) => r.fulfill({ status: 204 }));

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const state = () => page.evaluate(() => ({
  loading: document.getElementById('bookcase')?.classList.contains('is-loading'),
  card: document.getElementById('book-card')?.className,
  canvas: document.querySelectorAll('canvas').length,
}));

const t0 = Date.now();
await page.goto(page0);
await page.waitForFunction(() => !document.getElementById('bookcase').classList.contains('is-loading'), null, { timeout: 20000 });
console.log(`載入：${Date.now() - t0} ms`, await state());
await page.screenshot({ path: join(out, '0-shelf.png') });

await page.locator(`[data-id="${externalId}"]`).first().tap({ force: true });
await page.waitForTimeout(800);
const enter = page.locator('.card-enter');
console.log('點書後：前往閱讀按鈕數', await enter.count(), await state());
await page.screenshot({ path: join(out, '1-card.png') });

await enter.first().tap({ force: true });
await page.waitForTimeout(900);
await page.screenshot({ path: join(out, '2-opening.png') });
await page.waitForTimeout(5000);
const after = await state();
console.log('外部跳轉 6 秒後：', after);
await page.screenshot({ path: join(out, '3-after.png') });

const ok = !after.loading && !/is-visible/.test(after.card || '') && errors.length === 0;
console.log(ok ? '通過：書櫃已重置、0 個 JS 錯誤' : `失敗：${errors.join(' / ') || '書櫃沒有重置'}`);
console.log('截圖：', out);
await browser.close();
process.exit(ok ? 0 : 1);
