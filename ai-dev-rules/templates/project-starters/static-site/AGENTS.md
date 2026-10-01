# {{PROJECT_NAME}}

一句話說明：（填入網站用途與對象）

## 技術棧

- HTML、CSS、原生 JavaScript（或 TypeScript）
- 開發伺服器與建置：Vite（沒有建置流程時直接開 `index.html`）
- 部署：（填入 GitHub Pages / Netlify / Cloudflare Pages）

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝相依套件 |
| `npm run dev` | 開發伺服器 |
| `npm run build` | 建置到 `dist/` |
| `npm run preview` | 預覽建置結果 |

## 專案結構

- `index.html`、其他頁面放根目錄或 `pages/`
- `src/styles/`：CSS，設計 tokens 放 `tokens.css`
- `src/scripts/`：JS 模組
- `public/`：圖片、字型、favicon

## 專案慣例

- 先定視覺方向再動手，寫在 README。
- 色彩、間距、字級用 CSS 變數。
- 圖片用 WebP、寫明寬高、首屏以外加 `loading="lazy"`。
- 動畫處理 `prefers-reduced-motion`。
- 完成前用 Lighthouse 檢查：效能、無障礙都要 90 分以上。

## 適用的領域規範

- 網頁前端：Claude Code 與 Antigravity 讀到 `.html` / `.css` / `.ts` 時自動載入；Codex 用 `$domain-web-frontend`。
- 圖片與動畫：Claude Code 每次都會載入；Antigravity 依描述判斷；Codex 用 `$domain-media-image-video-animation`。
- 動畫用 `web-animation` skill；生成圖片用 `image-prompt` skill。
