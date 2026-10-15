# 交接文件：JavaScript 著作（互動課程網站）

> 更新：2026-10-15
> 一句話現況：**骨架、互動元件、模組 0–5（22 課）完成並在 Chrome 驗證，已上書櫃（顯示 22/38 製作中）；模組 6–9（16 課）待寫。**

## 0. 新 session 的開場 prompt（直接貼）

```text
接手 course-web/javascript-course 的工作（使用者說的「JavaScript 著作」）。
先完整讀這個資料夾的 HANDOFF.md，再讀 outline.md 與 research-notes.md。
規範以 skill course-web-neo-brutalism 為準（沒安裝就讀
ai-dev-rules/skills/course-web-neo-brutalism/ 底下的 SKILL.md 與 references/）。
從 HANDOFF.md 第 6 節「下一步」開始，在新的功能分支上做，
每 2–3 個模組自我檢查一次並回報；commit 前先問我。
```

## 0.1 Git 狀態（2026-10-14）

| 分支 | 內容 | 狀態 |
|---|---|---|
| `main` | 本課程第一段（研究、架構、骨架、元件、模組 0） | 已用 `--no-ff` 合併 |
| `feat/javascript-course` | 同上 | 已合併，可以刪除或繼續用 |
| `docs/define-scroll-vs-work` | 規範：「知識卷軸」＝ Notion、「著作」＝本地網站＋書櫃 | **還沒合併進 main**，要不要合併先問使用者 |

接下來的工作請從最新的 `main` 開新分支，例如 `feat/javascript-course-m1-m3`。

## 0.2 相關的 Notion 內容

同主題另有一套 Notion「知識卷軸」：`學習與知識 / JavaScript｜從語言核心到實戰完整教材`（16 課，2026-10-14 建立）。網站版**不搬它的文字**，只能參考題材；兩者分工見 `outline.md` A-3。

## 1. 接手 3 步驟

1. 讀 `outline.md`（38 課的目標、圖、互動）與 `research-notes.md`（事實與支援表）。
2. 預覽：`preview_start` 選 `vibe-coding-home`（整個 repo 在 8770 埠），打開 `http://localhost:8770/course-web/javascript-course/`。
3. 改內容只改 `src/`，再在 repo 根目錄重建：
   ```sh
   sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/javascript-course/src course-web/javascript-course/index.html
   ```

## 2. 需求 checklist

- [x] 第 1 階段：research-notes.md
- [x] 第 2 階段：outline.md（使用者已確認）
- [x] design-system.md
- [x] 骨架：站名、品牌、儲存 key、`--m9`、首頁三個問題、`COURSES`（38 課）、參考資料
- [x] 互動元件 11 個（f-widgets.js、b-widgets.css）
- [x] 模組 0（0-1～0-3）
- [x] 模組 1（1-1～1-4）
- [x] 模組 2（2-1～2-3）、模組 3（3-1～3-3，含 coerce）
- [x] 書櫃入口（3D `index.html` 與 2D `index-2d.html`；`readyLessons` 每完成一批就更新）
- [x] 模組 4（4-1～4-5，含 refviz、mutator）、模組 5（5-1～5-4，含 thisfinder、protochain）
- [ ] 模組 6～8 內容（每 2–3 個模組自我檢查一次）
- [ ] 模組 9：9-1 期末實作、9-2～9-4 reference 版型
- [ ] 第 4 階段驗證（verification.md 全部）
- [ ] 得獎等級自我檢查迴圈
- [ ] 全部完成後把兩個書櫃的 `readyLessons` 改成 38

## 3. 資料格式（本課新增）

沿用 terminal-commands-course 的 lesson 格式（見該課 HANDOFF 與 m0.html）。互動元件 props：

| 元件 | props |
|---|---|
| `runner` | `{ code, title?, predict?: { q?, options: [字串], answer: 索引 }, dom?: HTML, wait?: 毫秒, editable? }` |
| `floatbits` | `{ presets: [字串], start? }` |
| `refviz` | `{ title?, code: [行], steps: [{ line, vars: [{ name, val? , ref? }], objs: [{ id, text, changed? }], note }] }` |
| `coerce` | `{ presets: [{ expr, steps: [文字], result }] }`（result 要在 Node.js 實測） |
| `mutator` | `{ start: [數字], methods: [MUTATOR_METHODS 的 key] }` |
| `thisfinder` | `{ cases: [{ call, rule: 0–4, result, note }] }` |
| `protochain` | `{ chain: [{ name, props: [屬性名] }], presets: [屬性名] }` |
| `loopsim` | `{ title?, code: [行], steps: [{ line?, stack, micro, task, out, note }] }` |
| `racer` | `{ tasks: [{ name, ms }] }`（固定 3 個） |
| `bubble` | `{ levels: [由外到內的元素名稱] }` |
| `classify` | `{ buckets: [{ id, label }], items: [{ text, answer, why }] }` |

注意：

- runner 的輸出是模仿 Node.js 的格式（字串在陣列裡加單引號）；選項文字要和實際輸出一致。
- runner 在 iframe 裡是瀏覽器環境：`document` 存在、`process` 不存在。
- 寫在模板字串裡的 SVG，反引號要寫成 `` \` ``。標題不能出現 `||`（`|` 是斷點）。

## 4. 驗證方法與 2026-10-14 結果

- 語法：build 後用 `vm.Script` 檢查每個 `<script>`：0 個錯誤。
- **audit.mjs 沒跑**：需要 Playwright，這台電腦沒有安裝（全域安裝要先問使用者）。改用內建瀏覽器手動檢查。
- Chrome（內建瀏覽器，新分頁）：0 個 console 錯誤；0-1～0-3 每課 2 張 SVG、0 個缺漏術語、無水平溢出；樣式表頁 6 個元件都初始化。
- 實際操作：runner（0-3 印出「開始」「92」再拋 TypeError，預測判定正確；0-1 印出 object／undefined／9）、mutator（sort 改原陣列、toSorted 不改）、floatbits（0.1 實際存 0.1000000000000000055511151）、thisfinder、bubble（含 stopPropagation，修過一次 bug）。
- coerce 已在 3-1、3-3 實際操作；refviz（4-1、4-2 逐步播到最後）、mutator（4-4）、thisfinder（5-3）、protochain（5-4，score／toString／fly）已在 2026-10-15 實際操作。尚未實際操作：loopsim、racer（模組 6 再測）。
- 2026-10-15 模組 4–5：0 個語法錯誤；每課 2 張 SVG、0 個缺漏術語；1280 與 360px 無水平溢出；10 個 runner 的輸出都和 predict 答案一致。

## 5. 已知問題

- Safari 未實測（sandbox iframe 的 postMessage 在 Safari 的行為要在 Mac 確認）。
- 10 種寬度、對齊量測、深色模式都還沒做，留到第 4 階段。

## 6. 下一步

寫 `src/m6.html`（模組 6：非同步，用 loopsim、racer），接著 m7、m8。先在 Node.js 實測每段範例的輸出，再寫課文。做完更新兩個書櫃的 `readyLessons`、跑下面的檢查流程並回報。

### 每批的檢查流程（2026-10-15 實際使用）

1. build 後用 `vm.Script` 檢查每個 `<script>`：0 個語法錯誤。
2. 在內建瀏覽器打開課程，對新課逐一：數 SVG（≥ 2）、找 `.term-missing`（0）、檢查水平溢出、按每個 runner 的「執行」並把輸出和 `predict.answer` 對照。
3. 全站算「正確答案是最長選項」的比例（≤ 35%；2026-10-15 模組 0–5 為 20/79＝25%，算法：只算 mc、正確選項嚴格最長才計）。
4. 360px 寬再跑一次溢出檢查。
