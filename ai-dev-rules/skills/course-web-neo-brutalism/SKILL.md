---
name: course-web-neo-brutalism
description: 製作新野獸派（Neo-Brutalism）風格的互動課程網站：單一 HTML、資料驅動的模組與單元、高對比色塊與硬陰影、可拖曳寬度的側欄與字級調整、術語 hover 解釋、有鑑別度且每個選項都附解析的選擇題、大量 SVG 圖解，內容查證到當下日期。使用者要做線上課程網站、教學網站、互動講義站、「像 ai-chat-prompt-agent-course 那樣的課程」、或新野獸派風格的教材網頁時使用。
---

# 新野獸派課程網站

視覺方向：「工地告示牌 × 手作貼紙本」。純黑粗框、零模糊硬陰影、高飽和平塗色塊、刻意的不對稱。
教學方向：零基礎與 ADHD 友善，一個單元只教一件事，先具體後抽象，答案先藏起來。

這個 skill 疊加在下列規範之上，衝突時以這份為準：
- `domain-education-content`：每課結構、練習題、學習科學
- `course-lesson`：單課模板與檢查清單
- `domain-web-frontend`：RWD、無障礙、設計品質
- `web-animation`：動畫工具與 reduced-motion
- `verify-done`：完成的定義

## 流程

分四個階段，每個階段結束都要等使用者確認才進下一階段。

1. 研究：記下今天日期，查證所有工具、版本、指令、數據，寫成 `research-notes.md`。規則見 [content-rules.md](references/content-rules.md) 第 4 節。
2. 架構：寫 `outline.md`，列出模組、單元、每單元的目標與圖解構想、間隔複習排程、與既有規範的取捨表。
3. 設計與實作：
   1. 寫 `design-system.md`，token 照 [design-tokens.md](references/design-tokens.md)，先跑對比度檢查。
   2. 做骨架：token、版面、側欄（含拖曳與字級）、路由、進度儲存、標題的詞組斷行。
   3. 做元件與元件樣式表頁（`#/styleguide`），照 [components.md](references/components.md)。互動元件從共用元件庫搬，見 [build-and-widgets.md](references/build-and-widgets.md)。
   4. 逐模組填內容，超過 5 個模組時用分段檔加 `scripts/build.sh` 組合（build-and-widgets.md 第 1 節）。每 2–3 個模組跑一次 `scripts/audit.mjs` 並自我檢查：console、缺漏術語、360px 溢出、選擇題長度、SVG 線段端點與文字（[layout-geometry.md](references/layout-geometry.md) 6.5 節）。圖畫完當下就檢查，不要留到最後。
4. 驗證：照 [verification.md](references/verification.md) 全部走一次，再回報。

品質目標：以 Awwwards、Webby Awards、FWA 得獎程度為目標。第 3 階段做完、第 4 階段之前，照 `domain-web-frontend` 的「品質目標：得獎等級」自我檢查迴圈反覆提升，直到四個維度都達標；十五條硬性規則是底線，不能為了創意分數犧牲。

任務超過一個對話時，寫 `HANDOFF.md`：一句話現況、接手 3 步驟、需求 checklist、資料格式、驗證方法、已知問題、下一步。

## 技術骨架

- 單一 `index.html`，CSS 與 JS 內嵌，不需要建置工具；原生 JavaScript。
- 外部資源只載入 Google Fonts 與 cdnjs（例如 highlight.js），script 附 SRI。
- 課程內容用資料結構管理：`COURSES`（模組與單元標題）＋ `defineLessons({ id: {...} })` ＋ `defineTerms()` ＋ `defineSources()`。每個模組一個 `<script>` 資料區塊。
- 內文用自訂迷你標記 `md()`：先跳脫 HTML 再套標記，所以內容不能直接寫 HTML。支援 `**粗體**`、`==螢光==`、`` `code` ``、`{kbd:Esc}`、`[[術語]]`、`[文字](https://…)`。
- Hash 路由：`#/`、`#/m/N`、`#/l/ID`、`#/styleguide`、`#/references`。換課後焦點移到 `h1`（`tabindex="-1"`）。
- 偏好與進度存 localStorage，key 加版本號（例如 `<course-slug>.v1`）；讀寫包 try/catch，失敗時退回記憶體並 `console.warn` 記錄原因。

## 十五條硬性規則

第 1–4、11、12 條是視覺與互動，第 5–8 條是內容，第 9、10 條沿用參考站的做法，第 13–15 條來自 2026-10 的使用者回饋。每條的細節在 references。

1. 對比：內文對背景至少 7:1，次要文字與小字至少 4.5:1，非文字 UI 至少 3:1。淺色背景配深色字；彩色色塊上一律黑字。詳見 design-tokens.md 第 2 節。
2. 側欄：桌面版右緣有可拖曳的把手（滑鼠、觸控、鍵盤都能調），頂部列有字級調整（至少 5 段）。兩者都記住使用者的選擇。詳見 components.md 第 1、2 節。
3. Hover 只用一個訊號通道：已經換底色或文字色，就不再改底線；要改底線，就不換底色。詳見 components.md 第 3 節。
4. 每個狀態變化都有進場和退場轉場：下拉選單、側欄模組、摺疊區、tooltip、抽屜、分頁都要滑動或淡入淡出，關閉時也一樣。詳見 components.md 第 4 節。
5. 術語：每課第一次出現的術語包成 `[[術語]]`，hover、focus、點擊都能看到詳細解釋的 popup，滑鼠能移進 popup 而不消失。詳見 components.md 第 5 節。
6. 選擇題：錯誤選項來自真實的誤解，長度與具體程度和正確答案相當；每個選項（含正確答案）都附解析。全站正確答案是最長選項的比例不超過 35%（4 個選項隨機約 25%）。詳見 content-rules.md 第 2 節。
7. 視覺化：每個單元至少 2 張圖（心智模型 SVG ＋ 範例或比較的圖表）；每 300–400 字至少一個非文字元素。詳見 content-rules.md 第 3 節。
8. 時效：所有事實查證到今天，記錄查證日期與來源；查不到的標「⚠️ 截至 YYYY-MM 查證狀態：未確認」。詳見 content-rules.md 第 4 節。
9. 動畫只動 `transform`、`opacity`、顏色類屬性；例外只有摺疊區的高度（components.md 第 4 節）與 SVG 的 `stroke-dashoffset`。所有動畫都有 reduced-motion 版本。
10. 不用 emoji 當項目符號；區塊用文字貼紙標籤（「比喻」「限制」「常見錯誤」）。✓ ✗ 只用在對錯標示，且一定搭配文字。
11. 換行以字詞完整為準：標題、按鈕、卡片等短文字不能把詞拆到兩行，斷在詞組邊界，任何一行不能只剩 1–2 個字或單獨的編號。標題在資料裡用 `|` 標出斷點；仍有孤行時，該標題動態縮小字級（下限 80%）。詳見 [line-breaking.md](references/line-breaking.md)。
12. 對齊與幾何：「沒有溢出」不等於「有對齊」。頂部列高度量測後寫回 `--topbar-h`，側欄與把手同格 sticky，捲到頁尾不蓋過頁尾；圖示按鈕在任何寬度都是 44×44；沒有內容的欄位不留空；SVG 每段線的兩端都接在圖形上，文字不壓框、不壓線、不單字成行。在 10 種裝置寬度、頁面最上方與捲到最底各量一次。詳見 [layout-geometry.md](references/layout-geometry.md)。
13. 動畫只給真實機制：有東西真的在移動或變化（電子流動、資料逐筆流過、拉桿改參數）才做動畫；概念步驟、層級、比較一律靜態圖，`pipeflow` 加 `static: true`。詳見 build-and-widgets.md 第 2.3 節。
14. 每課至少一個互動元素，而且是讓讀者「做」一件事：分類、拉桿、切換對照、檢查器。用 `scripts/lesson-table.mjs` 確認沒有漏課。
15. 回書櫃與手機版：頂部列有房屋圖示的「回書櫃」按鈕；手機版把字級、深色模式移到側欄。詳見 build-and-widgets.md 第 5 節。

## 改編外部文章

課程內容來自別人的文章時：不轉載全文，0-1 寫重點摘要與結構導讀，只引用短句並標出處，多處放原文連結；使用者給的原文存檔不進 repo。拿到的檔案和要求的文章不一致（例如網址編號不同）時，先回報再動手。參考實作：`karpathy-output-formats-course/`。

## 參考站

分段建置與互動元件最完整的是 `terminal-commands-course/`（2026-10-07 版，37 課、8 種元件）；改編外部文章看 `karpathy-output-formats-course/`。

版面與引擎優先參考 `claude-code-secure-dev-course/`（2026-10-02 版）：它照本 skill 實作，已修正下表的差異，並通過 layout-geometry.md 的全部檢查。引擎（路由、側欄、字級、術語 popup、測驗、詞組斷行）可以直接沿用，再換掉 `COURSES` 與各模組的資料區塊。

`ai-chat-prompt-agent-course/`（2026-10 版）是這套風格的第一個實作，資料格式相同。下列地方它還不符合本 skill，複製時要改：

| 位置 | 參考站的做法 | 本 skill 要求 |
|---|---|---|
| `.nav-link:hover` | 換底色又加底線 | 只換底色（規則 3） |
| `.nav-lessons[hidden]` | 直接 `display: none`，沒有滑動 | 用 grid-rows 滑動展開與收合（規則 4） |
| `.tooltip` | `pointer-events: none`，滑鼠移進去就消失 | popup 可被 hover，符合 WCAG 1.4.13（規則 5） |
| tooltip、`details` 關閉 | 沒有退場動畫 | 關閉也要轉場（規則 4） |
| 側欄寬度 | 固定 `18rem` | 可拖曳（規則 2） |
| 字級 | 不能調 | 頂部列字級控制（規則 2） |
| 選擇題 `whyWrong` | 選填 | 每個錯誤選項都必填（規則 6） |
| 標題、上一課／下一課 | 瀏覽器預設換行，出現「平行開」／「發」 | 詞組斷行（規則 11） |
| 上一課／下一課（深色模式，2026-10-02 截圖） | 黃底上是白字 | 彩色底一律 `--on-color` 黑字（規則 1） |
| 側欄位置 | `top` 寫死頂部列高度 | 量測後寫回 `--topbar-h`（規則 12） |

## 回報

照個人回報範本，另外寫出：
- 單元數、每單元閱讀時間範圍、圖解總數、選擇題總數
- `scripts/audit.mjs`、`scripts/svg-text.mjs` 的輸出摘要（JS 錯誤數、結構問題數、SVG 問題數）
- 用了哪些互動元件、哪些是動畫、哪些是靜態（規則 13）
- 對比度檢查結果（最低的一組是多少）
- 選擇題：正確答案是最長選項的比例
- 標為「未確認」的項目清單
- 10 種裝置寬度（layout-geometry.md 6.1 節）與深色模式是否都看過；頁面最上方與捲到最底的對齊量測結果
- SVG 檢查：圖數、懸空端點數、文字問題數
- 得獎等級自我檢查：跑了幾輪、每輪四個維度的分數
- 有沒有截圖；視窗被隱藏導致截圖失敗時，寫明改用的檢查方式
