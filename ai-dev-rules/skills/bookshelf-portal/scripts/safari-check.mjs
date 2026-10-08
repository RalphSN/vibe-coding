#!/usr/bin/env node
/**
 * Safari 實機檢查：用 macOS 內建的 safaridriver 開真的 Safari，量書名標籤、拍書櫃與開書交接截圖。
 * Playwright 的 WebKit 和 Safari 排版結果不同（直排書名消失這個問題它量不出來），所以要用真的 Safari。
 *
 * 用法：node safari-check.mjs <入口網址> [輸出資料夾] [寬度,寬度…]
 *   例：node safari-check.mjs http://127.0.0.1:8770/index.html
 * 事前準備（使用者自己做，各一次）：
 *   1. Safari →「設定」→「進階」勾選「顯示網頁開發者功能」，再到「開發」選單勾選「允許遠端自動化」
 *   2. 終端機執行 `safaridriver --enable`（要輸入管理者密碼）
 * 測完請使用者取消勾選「允許遠端自動化」。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const pageUrl = process.argv[2];
const outDir = resolve(process.argv[3] || join(tmpdir(), 'bookshelf-safari'));
const widths = (process.argv[4] || '1440,1280,1024,768,600').split(',').map(Number);
const PORT = 4445;
const WD = `http://127.0.0.1:${PORT}`;

if (!pageUrl) {
  console.error('請給入口網址，例如 http://127.0.0.1:8770/index.html（safaridriver 不能開 file://）');
  process.exit(1);
}
if (process.platform !== 'darwin') {
  console.error('Safari 實機檢查只能在 macOS 跑。');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function wd(method, path, body) {
  const res = await fetch(WD + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (json.value && json.value.error) throw new Error(`${path}：${json.value.message}`);
  return json.value;
}

// 每本書的書名標籤：標籤內寬要放得下直排書名，否則書名被 overflow 裁掉
const AUDIT = `
  const books = [...document.querySelectorAll('.books .book')].map((book) => {
    const label = book.querySelector('.spine-label');
    const title = book.querySelector('.spine-title');
    const clipped = label.clientWidth < title.offsetWidth || label.clientHeight + 1 < title.offsetHeight;
    return { id: book.dataset.id, label: label.offsetWidth + 'x' + label.offsetHeight, title: title.offsetWidth + 'x' + title.offsetHeight, fontSize: getComputedStyle(title).fontSize, clipped };
  });
  const hScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
  return { width: innerWidth, hScroll, books };`;

const driver = spawn('safaridriver', ['-p', String(PORT)], { stdio: 'ignore' });
let sessionId;
let failed = false;
try {
  await sleep(1500);
  try {
    ({ sessionId } = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }));
  } catch (err) {
    console.error(`無法開啟 Safari 自動化：${err.message}`);
    console.error('逾時的話：確認已執行 safaridriver --enable，並把 Safari 完全結束（⌘Q，或 osascript -e \'tell application "Safari" to quit\'）後再試。');
    process.exitCode = 1;
    throw err;
  }
  const s = (p) => `/session/${sessionId}${p}`;
  for (const width of widths) {
    await wd('POST', s('/window/rect'), { width, height: 900, x: 0, y: 25 });
    await wd('POST', s('/url'), { url: pageUrl });
    await sleep(1500);
    const result = await wd('POST', s('/execute/sync'), { script: AUDIT, args: [] });
    const bad = result.hScroll || result.books.some((b) => b.clipped);
    failed ||= bad;
    console.log(`${bad ? 'FAIL' : 'OK  '} 視窗 ${width}px（內容 ${result.width}px）`, JSON.stringify(result.books), result.hScroll ? '有水平捲軸' : '');
    writeFileSync(join(outDir, `safari-${width}.png`), Buffer.from(await wd('GET', s('/screenshot')), 'base64'));
  }
  console.log(`截圖在 ${outDir}，請逐張看過書名是否清楚。`);
  console.log('翻頁閃動這類合成問題截圖拍不到：請在 Safari 打開停格測試頁加 ?rate=0.25 慢速播放，親眼確認。');
} catch (err) {
  if (!process.exitCode) console.error(err.message);
  process.exitCode = 1;
} finally {
  if (sessionId) await wd('DELETE', `/session/${sessionId}`).catch(() => {});
  driver.kill();
}
if (failed) process.exitCode = 1;
