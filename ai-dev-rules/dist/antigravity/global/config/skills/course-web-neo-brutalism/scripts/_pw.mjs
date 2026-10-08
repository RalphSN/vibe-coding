// 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡
// 共用：載入 Playwright（專案沒裝時改用全域安裝）、解析課程路徑
import { createRequire } from 'module';
import { execSync } from 'child_process';
import path from 'path';

function loadPlaywright() {
  try { return createRequire(import.meta.url)('playwright'); } catch {}
  const root = process.env.PW_ROOT || execSync('npm root -g').toString().trim();
  return createRequire(path.join(root, '/'))('playwright');
}
export const { chromium, devices } = loadPlaywright();

const target = process.argv[2];
if (!target) { console.error('用法：node <script> <課程 index.html 路徑>'); process.exit(2); }
export const base = 'file://' + path.resolve(target);

// 沙箱連不到 CDN 與 Google Fonts 時直接中止，避免逾時拖慢
export const blockExternal = (p) => p.route(/cdnjs|fonts\.g/, (r) => r.abort());
export const launch = () => chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
