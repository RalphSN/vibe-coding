# {{PROJECT_NAME}}

一句話說明：（填入這個 API 服務做什麼）

## 技術棧

- Node.js（LTS）+ TypeScript strict
- 框架：（填入 Express / Fastify / Hono）
- 驗證：zod；資料庫：（填入 PostgreSQL / SQLite 與 ORM）
- 測試：Vitest + supertest（或框架內建的 inject）

## 常用指令

| 指令 | 用途 |
|---|---|
| `npm install` | 安裝相依套件 |
| `npm run dev` | 開發伺服器（watch） |
| `npm run build` | 編譯 |
| `npx tsc --noEmit` | 型別檢查 |
| `npm run lint` | ESLint |
| `npm test` | 測試 |
| `npm run db:migrate` | 執行 migration（先問使用者） |

指令跟 `package.json` 不一致時，以 `package.json` 為準，並更新這張表。

## 專案結構

- `src/routes/`：路由與 handler
- `src/services/`：商業邏輯，不碰 HTTP 物件
- `src/db/`：schema、migration、查詢
- `src/schemas/`：zod schema
- `tests/`：測試，檔名對應 `src/`

## 專案慣例

- 啟動時驗證環境變數，缺少就退出；所有變數列在 `.env.example`。
- 錯誤格式統一為 `{ error: { code, message, details } }`。
- migration 要能 rollback，執行前先告訴使用者會改什麼。

## 適用的領域規範

- 後端 API：Claude Code 每次都會載入（`.claude/rules/backend-api.md`）；Antigravity 依描述判斷載入；Codex 用 `$domain-backend-api`。
- 新增端點用 `api-endpoint` skill。
