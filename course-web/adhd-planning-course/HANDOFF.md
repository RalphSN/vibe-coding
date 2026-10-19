# 交接文件：先動起來（ADHD 規劃與啟動著作）

> 更新：2026-10-19
> 一句話現況：**研究、大綱、設計系統、骨架、9 個元件、29 課完成，第 4 階段在 Chrome 全部通過，已加進兩個書櫃（排第一本）；剩 Safari 實測與效能量測。**

## 0. 新 session 的開場 prompt（直接貼）

```text
接手 course-web/adhd-planning-course 的工作（使用者說的「ADHD 規劃課程著作」）。
先完整讀這個資料夾的 HANDOFF.md，再讀 outline.md 與 research-notes.md。
規範以 skill course-web-neo-brutalism 為準。
從 HANDOFF.md 第 6 節「下一步」開始，在 feat/adhd-planning-course 分支上做；commit 前先問我。
```

## 1. 接手 3 步驟

1. 讀 `outline.md`（29 課的目標、圖、互動）與 `research-notes.md`（事實、證據強度、未確認清單）。
2. 預覽：`preview_start` 選 `vibe-coding-home`，打開 `http://localhost:8770/course-web/adhd-planning-course/`。
3. 改內容只改 `src/`，在 `course-web/adhd-planning-course/` 底下重建：
   ```sh
   sh ../../ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh src index.html
   ```

## 2. 需求 checklist

- [x] 第 1 階段：research-notes.md（使用者已確認）
- [x] 第 2 階段：outline.md（使用者已確認）
- [x] design-system.md
- [x] 骨架：引擎沿用 javascript-course；新增 `#/system`（我的系統）與每課「今天就用」段落
- [x] 9 個新元件：stuckcheck、levers、shrinker、ifthen、timebox、estimator、breakdown、promptkit、woop（f-widgets.js）
- [x] 模組 0（0-1～0-3）、模組 1（1-1～1-4）、模組 2（2-1～2-3）
- [x] 模組 3（3-1～3-3）、模組 4（4-1～4-4）
- [x] 模組 5（5-1～5-3）、模組 6（6-1～6-3）、模組 7（7-1～7-3）
- [x] 模組 8：8-1 期末實作、8-2 急救卡與 8-3 總複習（reference 版型）
- [x] 全站選擇題比例調回 25.4%（32/126），明顯最長 0 題
- [x] 書櫃入口（index.html 與 index-2d.html，icon `play`；2D 版另外補上 `play` 圖示）
- [x] 第 4 階段驗證（Safari 除外）、得獎等級自我檢查 2 輪

## 3. 資料格式（本課新增）

沿用 javascript-course 的 lesson 格式，多一段：

```js
today: { minutes: 3, task: ['段落…'], blocks: [{ type: 'widget', name: 'ifthen', props: {} }] }
```

元件 props：

| 元件 | props |
|---|---|
| `stuckcheck` | `{ title? }` |
| `levers` | `{ start?: { e, v, i, d } }`（1–10） |
| `shrinker` | `{ placeholder? }` |
| `ifthen` | `{ ifHint?, thenHint? }` |
| `timebox` | `{}`（5／10／25 分鐘） |
| `estimator` | `{}`（資料存 SystemStore.estimates） |
| `breakdown` | `{ placeholder? }` |
| `promptkit` | `{}` |
| `woop` | `{}` |
| `classify`、`checklist` | 同 javascript-course |

讀者存下的資料在 localStorage `adhd-planning-course.system.v1`，「我的系統」頁可複製、刪除、全部清除。

## 4. 每批的檢查流程

1. build 後語法檢查（每段 `<script>` 用 `vm.Script`）。
2. 選擇題：「明顯最長」0 題；正確答案是最長選項（含並列）的比例 ≤ 35%。
3. 內建瀏覽器逐課：SVG ≥ 2、`.term-missing` 0、1280 與 360px 無溢出、元件沒有 placeholder、有「今天就用」。
4. SVG 端點與文字檢查（layout-geometry.md 6.5）。

2026-10-19 模組 5–7：選擇題修正 17 題後 0 題明顯最長；9 課都有 2 張圖、0 缺漏術語、console 0 錯誤；18 張 SVG 0 懸空端點、0 文字問題；360px 無溢出。

2026-10-19 模組 3–4：選擇題 0 題明顯最長；7 課都有 2 張圖、0 缺漏術語；14 張 SVG 修正 6 個懸空端點後為 0；17 課與首頁、樣式表、系統頁在 360px 無溢出。

2026-10-19 模組 0–2：語法 0 錯誤；選擇題 0 題明顯最長；10 課都有 2–3 張圖、0 缺漏術語、無溢出；SVG 21 張，0 懸空端點、0 文字問題。

## 5. 已知問題

### 第 4 階段結果（2026-10-19，Chrome 內建瀏覽器）

| 項目 | 結果 |
|---|---|
| 自動檢查 | 29 課、0 console 錯誤、0 缺漏術語、0 溢出；選擇題 126 題 0 個結構問題，正確答案是最長 25.4% |
| 10 種寬度 × 42 頁 | 0 水平溢出；頂部列 0 重疊、圖示 44×44 |
| 對齊（1280、1920） | 頂部列＝側欄＝把手；捲到底側欄＝把手＝頁尾 |
| 對比 | 淺色與深色最低 7.13（修正品牌 ▶ 原本 1.39，改成黃底黑字的方塊） |
| 換行 | 375／768／1280 × 100%／150%，0 問題 |
| 互動 | 把手鍵盤、術語 popup 開關與 Esc、← → 換課、/ 搜尋、測驗與進度、回書櫃、我的系統的複製與清除 |

得獎等級迴圈：第 1 輪 設計 8／易用 7／創意 8／內容 8（品牌 ▶ 淺色對比不足）→ 修正後第 2 輪 8／8／8／8。效能（Core Web Vitals）沒有量。

測試環境注意：內建瀏覽器的模擬寬度改變時不會觸發 resize 事件；在窄寬度按字級後再放大寬度，側欄會停在窄寬度算出的值（真實瀏覽器會重算）。要測 150% 時，在目標寬度按字級按鈕，或重新整理。術語 popup 在面板不重繪時淡入會停在 opacity 0，關掉動畫後確認是 1。

- 2026-10-19 修正：`b-widgets.css` 從 javascript-course 複製時，一個 `@media (prefers-reduced-motion)` 少了結尾的 `}`，後面所有元件樣式只在「減少動態效果」時才生效。已刪除，大括號 81／81 平衡。之後複製 CSS 片段要先數大括號。

- 每課實際閱讀時間 7–8 分鐘，比大綱預估的 8–12 分鐘短；寫完全部再看是否要補內容。
- 「全部複製成文字」「清除我的資料」已用真實點擊測過（清除時 confirm 用程式自動回答確定；清除不影響課程進度）。
- `md()` 新增站內連結：`[文字](#/system)`，只接受 `#/` 開頭的路由。
- 2D 書櫃已補上 `papaya`，並加上外部連結支援（`goTo()`、切回頁面與 3.5 秒後收回書櫃，和 3D 版相同）。
- 2D 書櫃在 430px 以下有水平捲軸（書太多、一排放不下）；2026-10-19 前的版本就有，未處理。
- 手機上的圖字小，靠「放大看」按鈕（沿用 javascript-course 的做法）。

## 6. 下一步

請使用者在 Mac 的 Safari 看：首頁、任一課的互動元件、「我的系統」頁、手機寬度的「放大看」。之後量 Core Web Vitals（Lighthouse）。
