# {{PROJECT_NAME}}

一句話說明：（填入這個專案做什麼）

## 技術棧

- Vue 3（`<script setup lang="ts">`）、TypeScript strict、Vite、Pinia、Vue Router
- 測試：Vitest + Vue Test Utils；E2E：Playwright（有的話）
- 格式化：Prettier；lint：ESLint

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝相依套件 |
| `npm run dev` | 開發伺服器 |
| `npm run build` | 建置（含 `vue-tsc` 型別檢查） |
| `npx vue-tsc --noEmit` | 只跑型別檢查 |
| `npm run lint` | ESLint |
| `npm run test:unit` | 單元測試 |

指令跟 `package.json` 不一致時，以 `package.json` 為準，並更新這張表。

## 專案結構

- `src/components/`：共用元件，PascalCase 檔名
- `src/views/`：路由頁面
- `src/stores/`：Pinia store，setup store 寫法
- `src/composables/`：`useXxx.ts`
- `src/api/`：API 呼叫，集中處理錯誤

## 專案慣例

- 路徑別名 `@/` 指向 `src/`。
- 環境變數只用 `VITE_` 開頭的，定義在 `.env.example`；秘密不放前端。
- 完成前跑：`npx vue-tsc --noEmit`、`npm run lint`、`npm run test:unit`。

## 適用的領域規範

- 網頁前端：Claude Code 與 Antigravity 在讀到 `.vue` / `.ts` / `.css` 時自動載入；Codex 用 `$domain-web-frontend`。
- 建元件用 `vue-component` skill。
