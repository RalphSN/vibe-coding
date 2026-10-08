#!/usr/bin/env node
// 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡
/**
 * 書櫃入口的停格截圖：產生測試副本，用無頭 Chrome / Edge 拍書櫃與開書動畫各階段。
 * 用法：node shoot.mjs [入口 index.html 路徑] [輸出資料夾]
 * 需要 Node 18+ 與本機的 Chrome 或 Edge（Windows / macOS / Linux 都可）。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(process.argv[2] || 'index.html');
const outDir = resolve(process.argv[3] || join(tmpdir(), 'bookshelf-shots'));

const BROWSERS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'],
};

const browser = (BROWSERS[process.platform] || []).find((p) => existsSync(p));
if (!browser) {
  console.error(`找不到 Chrome 或 Edge（平台：${process.platform}），請在 BROWSERS 加上路徑。`);
  process.exit(1);
}
if (!existsSync(pagePath)) {
  console.error(`找不到入口頁：${pagePath}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
copyFileSync(join(here, 'anim-harness.js'), join(outDir, 'anim-harness.js'));
copyFileSync(join(here, 'measure-handoff.js'), join(outDir, 'measure-handoff.js'));

// 測試副本：不跳轉、不讓舞台點擊跳轉，最後載入停格腳本
const source = readFileSync(pagePath, 'utf8');
const harness = source
  .replace(/^ {2}window\.location\.href = book\.href;$/m, '  document.title = "WOULD-NAVIGATE";')
  .replace(/^ {2}stage\.addEventListener\('click'.*$/m, '')
  .replace('</body>', '<script src="anim-harness.js"></script>\n</body>');
if (harness === source) {
  console.error('範本結構和預期不同：找不到跳轉那一行，停格測試可能會真的跳走。');
  process.exit(1);
}
writeFileSync(join(outDir, 'harness.html'), harness);
writeFileSync(join(outDir, 'measure.html'), harness.replace('</body>', '<script src="measure-handoff.js"></script>\n</body>'));

const harnessUrl = pathToFileURL(join(outDir, 'harness.html')).href;
const measureUrl = pathToFileURL(join(outDir, 'measure.html')).href;
const baseArgs = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=2500'];

// 序號：1 抽出；2–4 空中轉身；5–8 翻封面與扉頁；9 讀取條
const SHOTS = [
  ['01-shelf-light', 'noclick', 1, '1440,900'],
  ['02-shelf-dark-hover', 'noclick&inspect', 0, '1440,900'],
  ['03-handoff', 'start=2&f=0', 1, '1200,820'],
  ['04-flight', 'start=2&f=0.5', 1, '1200,820'],
  ['05-cover-opening', 'start=5&f=0.3', 1, '1200,820'],
  ['06-leaf-turning', 'start=5&f=0.62', 1, '1200,820'],
  ['07-spread', 'start=9&f=0.5', 1, '1200,820'],
  ['08-spread-dark', 'start=9&f=0.5', 0, '1200,820'],
];

for (const [name, query, colorScheme, size] of SHOTS) {
  const file = join(outDir, `${name}.png`);
  execFileSync(browser, [...baseArgs, `--blink-settings=preferredColorScheme=${colorScheme}`, `--window-size=${size}`, `--screenshot=${file}`, `${harnessUrl}?${query}`], { stdio: 'ignore' });
  console.log(`拍好：${file}`);
}

const dom = execFileSync(browser, [...baseArgs, '--window-size=1200,820', '--dump-dom', `${measureUrl}?start=2&f=0`], { encoding: 'utf8' });
const match = dom.match(/id="measure">([^<]*)/);
console.log(`交接量測：${match ? match[1] : '沒有輸出'}`);
console.log(`手機寬度請另外用瀏覽器的裝置模擬檢查（無頭模式的視窗有最小寬度，窄於約 500px 會被裁切）。`);
