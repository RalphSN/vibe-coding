# 交接文件：Claude Code × 安全開發實戰課

> 更新：2026-10-02
> 一句話現況：**29 個單元全部完成並通過自動檢查；下次重新查證日期 2027-01-02。**

## 1. 接手的 3 個步驟

1. 啟動預覽：Claude Code 桌面版用 `preview_start`，名稱 `secure-dev-course`（設定在 `../.claude/launch.json`，port 8766）。或自己執行：

   ```bash
   python -m http.server 8766 --bind 127.0.0.1 --directory claude-code-secure-dev-course
   ```

2. 讀 `outline.md`（課程架構）與 `research-notes.md`（每個事實的來源）。
3. 改內容：每個模組是 `index.html` 裡一個 `<script>` 資料區塊（搜尋「模組 N：」）。新增單元先在 `COURSES` 加標題，再用 `defineLessons` 補內容。

## 2. 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 課程網站（單一檔案，CSS 與 JS 內嵌） |
| `research-notes.md` | 研究筆記，查證於 2026-10-02 |
| `outline.md` | 模組、單元、間隔複習排程、取捨表 |
| `design-system.md` | 色彩 token、對比檢查結果、與參考站的差異 |

課程資料夾以外的改動：`../.claude/launch.json` 新增了 `secure-dev-course` 設定。尚未 commit。

## 3. 資料格式（摘要）

- 標題用 `|` 標詞組斷點：`'Claude Code|與 Cowork|各做什麼'`。
- 內文用 `md()` 標記：`**粗體**`、`` `code` ``、`{kbd:Esc}`、`[[術語]]`、`[文字](https://…)`；不能直接寫 HTML。
- 選擇題：`{ type: 'mc', q, options: [{ text, why, correct? }] }`，每個選項都要有 `why`，正確答案剛好一個。
- 區塊類型：`list`、`code`、`table`、`callout`、`unverified`、`timely`、`legacy`、`svg`、`compare`、`tabs`、`reveal`、`quiz`、`widget`、`heading`、`tryit`。
- 互動元件：`loop`（1-1）、`permsim`（4-2）、`ctxcost`（6-1）、`checklist`（2-3、8-1）。

## 4. 驗證方法

用 skill `course-web-neo-brutalism` 的 `references/verification.md` 與 `line-breaking.md` 4.2 的腳本，在瀏覽器 console 執行。2026-10-02 的結果：

- 29 個單元：0 個 console 錯誤、0 個缺漏術語、0 個水平溢出、每課至少 2 張圖（共 58 張）。
- 139 題選擇題：0 個結構問題；正確答案是最長選項的比例 44/139（32%）。
- 換行：375、768、1280 × 字級 100%、150%，0 個孤行、0 個拆詞。
- 互動：側欄鍵盤調整與重新整理後還原、模組收合、術語 popup（hover 寬限、Esc、點擊固定、翻轉）、測驗、分頁、深色模式、真實點擊複製。

注意：Claude 的視窗被隱藏時，`requestAnimationFrame` 與動畫不會跑，測換行要呼叫 `App.fitAll()`。

## 5. 已知問題

- 5 個單元的估計閱讀時間超過 12 分鐘：3-1、4-3、7-3（13 分）、7-1（14 分）、8-2（15 分，含 15 題測驗）。主要是程式碼範例較長。
- 沒有截圖：測試時視窗被隱藏，截圖逾時。畫面以 DOM 與計算後的樣式檢查。
- `prefers-reduced-motion` 只檢查了 CSS，沒有在瀏覽器裡開啟系統設定實測。
- `details` 的高度動畫用 `interpolate-size` 與 `::details-content`，Firefox、Safari 的支援度未查證；不支援時會直接展開，不會壞。
- Cowork 相關內容只有說明中心的摘要來源（🟡），課程內已加註。

## 6. 下一步

- **2027-01-02 重新查證**：Claude Code 版本與權限模式、Cowork 的執行環境、fast mode 價格、Code Review 方案與價格、Haiku 4.5 退役後 `haiku` 別名對應的版本。
- 想縮短超過 12 分鐘的單元，優先把 7-1 的 workflow 範例改成連到 8-1 範本庫。
