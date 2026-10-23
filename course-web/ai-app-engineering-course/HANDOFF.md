# 交接文件：AI 系列・第一部｜AI 應用工程

> 更新：2026-10-22
> 一句話現況：**9 個模組、39 課全部完成，已加進書櫃（3D 與 2D）；下次重新查證日期 2027-01-22。**

## 1. 接手的 3 個步驟

1. 預覽：在 repo 根目錄執行 `node tools/serve.mjs . 8770`，打開 `http://localhost:8770/course-web/ai-app-engineering-course/index.html`；元件範例在 `#/styleguide`。
2. 讀 `outline.md`（39 課的目標、圖、互動元件、系列規劃）與 `research-notes.md`（每個事實的來源與可信度）。
3. 改內容：只改 `src/` 底下的分段檔，再重建（見第 3 節）。**不要直接改 `index.html`。**

## 2. 需求 checklist

- [x] 研究筆記（查證於 2026-10-22）
- [x] 大綱：9 模組、39 課（使用者 2026-10-22 確認）
- [x] 系列規劃：七本書，書櫃上相鄰（使用者選「七本書」）
- [x] 骨架、`design-system.md`、`#/styleguide`、12 個互動元件
- [x] 模組 0–8 全部 39 課
- [x] 每課標出「一個請求的旅程」的位置（首頁的承諾）
- [x] 書櫃入口：`index.html`（3D）與 `index-2d.html`（2D）都排第一本
- [x] 得獎等級自我檢查 2 輪
- [x] 序章（`../ai-series-0-map-course/`，2026-10-22 完成）
- [ ] 其他五卷（第二～五部、隨身卷）

## 3. 檔案與重建

| 檔案 | 用途 |
|---|---|
| `index.html` | 成品（由 `src/` 組出來，約 760 KB） |
| `src/` | 分段原始檔：`m0.html`～`m8.html` 是各模組內容，其他見 `src/README.md` |
| `research-notes.md` | 研究筆記 |
| `outline.md` | 課程架構、系列規劃 |
| `design-system.md` | 藝術指導、對比檢查、元件清單 |

重建（Windows 用 Git Bash，macOS 用終端機，在 repo 根目錄）：

```sh
sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/ai-app-engineering-course/src course-web/ai-app-engineering-course/index.html
```

引擎沿用 `adhd-planning-course/src`（2026-10-19 版），改了：localStorage key（`ai-app-engineering-course.v1`、`.prefs.v1`）、首頁文案、「今天就用」改成「動手做」（`lab`）、新增「AI 系列」選單與旅程指示、拿掉「我的系統」路由。

## 4. 資料格式（摘要）

沿用參考站的 `COURSES` ＋ `defineLessons` ＋ `defineTerms` ＋ `defineSources`。本課新增：

- `SERIES`（`src/c-data.html`）：七卷清單，做好的卷填 `href`。**其他六本書要複製同一份**，只改 `current`；做好一卷就回來把這裡的 `href` 也填上。
- `JOURNEY`（`src/c-data.html`）：旅程五站與每個模組點亮哪幾站。
- 單元的 `lab`：`{ minutes, task, blocks }`，需要在自己電腦跑程式的課才有（0-2、2-4）。
- 互動元件的 props 寫在 `src/f-widgets.js` 每個元件上方的註解；`#/styleguide` 有完整範例。
- `knobs` 的 `compute(values)`、`reqbuilder` 的 `breaks(value)` 可以是函式，直接寫在模組資料裡。
- 價格表 `MODEL_PRICES` 在 `src/f-widgets.js`；價格變了改這裡一處，另外搜尋課文裡的「$4」「$20」一併更新。

書櫃：`index.html` 與 `index-2d.html` 的 `SITES` 第一本是 `id: 'ai-app'`，書布色 `#1f3d3a`（墨青，保留給 AI 系列七卷），圖示 `nodes`（兩邊的 `ICONS` 都新增了）。之後的卷放在它前後，序章在它前面。

## 5. 驗證方法與 2026-10-22 結果

| 項目 | 結果 |
|---|---|
| build（含模組 `node --check`） | 通過 |
| console 錯誤、缺漏術語（39 課） | 0、0 |
| 每課 SVG | 全部 2 張（共 78 張） |
| 每課互動元件 | 全部至少 1 個 |
| 每課閱讀時間 | 7–12 分鐘 |
| 選擇題 | 169 題（含 8-5 總複習 15 題）；每題剛好 1 個正解、每個選項都有解析；正確答案是最長選項 50/169（29.6%） |
| SVG 文字（瀏覽器內檢查出界、重疊、跨框） | 0 |
| 360、768、1280px，展開全部答案後的水平溢出（39 課） | 0 |
| 首頁、styleguide、模組頁：10 種寬度溢出與頂部列 | 0；圖示按鈕 44×44 |
| 最低文字對比 | 7.41（淺色連結） |
| 書櫃 | 新書排第一、連結 HTTP 200、console 0 錯誤；2D 版 `bookshelfAudit()` 在 1009px 為 OK |

**沒做到的：**
- 課程的 `audit.mjs`、`svg-text.mjs`、`lesson-table.mjs` 沒跑：這台電腦沒有 Playwright。改在內建瀏覽器跑同樣的檢查。
- 書櫃的 `shoot.mjs`（開書動畫停格）跑了兩次都卡在 3D 載入畫面逾時；`mobile-flow.mjs` 需要 Playwright。開書動畫沒有實際看過。
- 3D 書櫃的 `bookshelfAudit()` 回報「書沒站在層板上」：只發生在換到第二層的書，修改前的版本同樣會報（例如 papaya）。這是檢查腳本只量第一塊層板的限制，畫面上書都站在層板上。
- Safari、reduced-motion、字級 150% 沒有實際看過。
- 範例程式沒有真的打 API 執行。

## 6. 已知問題

- `vecplot` 的點很密時，標籤會和連線交叉。
- 截圖常拍到換課轉場的半透明畫面（瀏覽器窗格節流），不是頁面問題。
- 書布色 `#1f3d3a` 和 React 的 `#1e5257` 都偏青綠，放在一起時要留意辨識度。

## 7. 下一步

- 序章已完成（2026-10-22），系列選單已連過去。下一卷是**第二部｜LLM 原理**。
- **2027-01-22 重新查證**：Claude 模型與價格、API 版本、MCP 規格、OpenAI 與 Gemini 主推的 API、Voyage 模型。
