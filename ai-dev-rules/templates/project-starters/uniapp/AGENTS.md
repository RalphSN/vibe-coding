# {{PROJECT_NAME}}

一句話說明：（填入這個專案做什麼）

## 技術棧

- uni-app（Vue 3 + `<script setup lang="ts">`）、Pinia、Vite
- 目標平台：H5、微信小程式（依實際調整）

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝相依套件 |
| `npm run dev:h5` | H5 開發 |
| `npm run dev:mp-weixin` | 微信小程式開發，用微信開發者工具開 `dist/dev/mp-weixin` |
| `npm run build:h5` | 建置 H5 |
| `npm run build:mp-weixin` | 建置小程式 |
| `npx vue-tsc --noEmit` | 型別檢查 |

指令跟 `package.json` 不一致時，以 `package.json` 為準，並更新這張表。

## 專案結構

- `src/pages/`：頁面，路由在 `src/pages.json` 註冊
- `src/components/`：共用元件
- `src/stores/`：Pinia store
- `src/static/`：靜態資源

## 專案慣例

- 用 `uni.*` API，不用 `window`、`document`、`fetch`、`localStorage`。
- 尺寸用 `rpx`。
- 平台差異用條件編譯（`#ifdef H5`、`#ifdef MP-WEIXIN`）。
- 新頁面要在 `pages.json` 註冊。
- 改動後至少在 H5 和一個小程式模擬器各跑一次。

## 適用的領域規範

- 網頁前端：Claude Code 與 Antigravity 在讀到 `.vue` / `.ts` 時自動載入；Codex 用 `$domain-web-frontend`。
- 建頁面或元件用 `vue-component` skill。
