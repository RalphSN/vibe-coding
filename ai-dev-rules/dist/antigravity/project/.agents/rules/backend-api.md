---
trigger: model_decision
description: 後端與 API 規範（REST 設計、狀態碼、錯誤格式、分頁、資料庫、驗證授權、日誌、環境變數）。寫伺服器、API 端點、資料庫 schema 或 migration、Node.js 後端時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 後端 API

## REST 設計

- 路徑用名詞複數、kebab-case：`/api/v1/order-items`。
- 動作用 HTTP 方法表達：`GET` 讀、`POST` 建、`PATCH` 部分更新、`PUT` 整筆取代、`DELETE` 刪。
- 版本放在路徑：`/api/v1/`。
- JSON 欄位用 camelCase。

## 狀態碼

| 情況 | 狀態碼 |
|---|---|
| 讀取成功 | 200 |
| 建立成功 | 201 |
| 成功但無內容 | 204 |
| JSON 解析失敗、缺少必要欄位 | 400 |
| 未登入 | 401 |
| 沒權限 | 403 |
| 找不到 | 404 |
| 衝突（重複建立） | 409 |
| 欄位齊全但值不符規則（格式、範圍） | 422 |
| 伺服器錯誤 | 500 |

## 錯誤格式

所有錯誤回應用同一個格式：

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "email 格式不正確", "details": [] } }
```

- `code` 是給程式判斷的固定字串；`message` 給人看。
- 500 錯誤不把 stack trace 回傳給客戶端。

## 分頁

- 清單端點一律分頁；預設 `limit=20`，上限 100。
- 預期超過 1 萬筆或會即時新增時用 cursor 分頁（`?cursor=...`），否則可用 `?page=&limit=`。
- 回應附上 `nextCursor` 或 `total`。

## 資料庫

- schema 變更一律寫 migration，不手動改資料庫。
- migration 要能 rollback；執行前先告訴使用者會改什麼。
- 出現在 `WHERE`、`JOIN`、`ORDER BY` 的欄位建索引，並用 `EXPLAIN` 確認查詢有用到。
- 多筆寫入必須一起成功或一起失敗時，包在交易（transaction）裡。

## 驗證與授權

- 所有輸入在伺服器端用 schema 驗證（例如 zod）。
- 每個端點檢查授權：這個使用者能不能存取這筆資料。
- 密碼用 bcrypt / argon2 雜湊，不自己寫加密。

## 日誌

- 用結構化日誌（JSON），包含時間、等級、request id。
- 不記錄密碼、token、完整信用卡號、個資。

## 環境變數

- 所有設定從環境變數讀，啟動時驗證必要變數都存在，缺少就直接報錯退出。
- 提供 `.env.example` 列出所有變數與假值。
