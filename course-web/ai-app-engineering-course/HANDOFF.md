# 交接文件：AI 系列・第一部｜AI 應用工程

> 更新：2026-10-22
> 一句話現況：**第 1 段（骨架、設計系統、元件樣式表、12 個互動元件）完成；39 課的內容都還沒寫，單元頁顯示「製作中」。**

## 1. 接手的 3 個步驟

1. 預覽：在 repo 根目錄執行 `node tools/serve.mjs . 8770`，打開 `http://localhost:8770/course-web/ai-app-engineering-course/index.html`；先看 `#/styleguide`。
2. 讀 `outline.md`（39 課的目標、圖、互動元件）與 `research-notes.md`（每個事實的來源與可信度）。
3. 改內容：只改 `src/` 底下的分段檔，再重建（見第 3 節）。**不要直接改 `index.html`。**

## 2. 需求 checklist

- [x] 研究筆記（查證於 2026-10-22）
- [x] 大綱：9 模組、39 課（使用者 2026-10-22 確認）
- [x] 系列規劃：七本書，書櫃上相鄰（使用者選「七本書」）
- [x] 第 1 段：骨架、`design-system.md`、`#/styleguide`、新互動元件
- [ ] 第 2 段：模組 0–2（11 課）
- [ ] 第 3 段：模組 3–5（13 課）
- [ ] 第 4 段：模組 6–8（15 課）＋ 書櫃入口（`index.html`、`index-2d.html`）＋ 全站驗證
- [ ] 得獎等級自我檢查迴圈（至少 2 輪；內容做完後跑）

## 3. 檔案與重建

| 檔案 | 用途 |
|---|---|
| `index.html` | 成品（由 `src/` 組出來） |
| `src/` | 分段原始檔，見 `src/README.md` |
| `research-notes.md` | 研究筆記 |
| `outline.md` | 課程架構、系列規劃、製作分段 |
| `design-system.md` | 本書的藝術指導、對比檢查、元件清單 |

重建（Windows 用 Git Bash，macOS 用終端機，在 repo 根目錄）：

```sh
sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/ai-app-engineering-course/src course-web/ai-app-engineering-course/index.html
```

引擎沿用 `adhd-planning-course/src`（2026-10-19 版），改了：localStorage key（`ai-app-engineering-course.v1`、`.prefs.v1`）、首頁文案、「今天就用」改成「動手做」（`lab`）、新增「AI 系列」選單、拿掉「我的系統」路由。

## 4. 資料格式（摘要）

沿用參考站的 `COURSES` ＋ `defineLessons` ＋ `defineTerms` ＋ `defineSources`。本課新增：

- `SERIES`（`src/c-data.html`）：七卷清單，做好的卷填 `href`。**其他六本書要複製同一份**，只改 `current`。
- 單元的 `lab`：`{ minutes, task: [段落], blocks: [程式碼等] }`，需要在自己電腦上跑程式的課才放。
- 互動元件的 props 寫在 `src/f-widgets.js` 每個元件上方的註解；`#/styleguide` 有每個元件的完整範例（在 `src/e-engine2.js`）。
- `knobs` 的 `compute(values)` 是函式，直接寫在模組資料裡。
- 價格表 `MODEL_PRICES` 在 `src/f-widgets.js`，價格變了改這裡一處。

## 5. 驗證方法與 2026-10-22 結果

| 項目 | 結果 |
|---|---|
| build（含模組 `node --check`） | 通過，成品 237 KB |
| console 錯誤（首頁、styleguide、模組頁、單元頁） | 0 |
| 15 個元件實例都完成 hydrate | 是 |
| 10 種寬度（360–1920）× 4 種頁面的水平溢出 | 全部 0 |
| 頂部列子元素超出畫面 | 0；圖示按鈕全部 44×44 |
| 對比 | 最低文字對比 7.41（淺色連結），見 `design-system.md` |
| 實際操作 | reqbuilder（開 temperature 出現 400）、costcalc（手算 $0.0241／次相符）、ssestream 三種模式（逐字、對照、斷線）、toolloop 兩種情境、vecplot、chunker、ragtrace 切情境、evalgrid、knobs、系列選單（桌面下拉、手機側欄收合） |
| 深色模式 | 首頁、手機側欄看過 |

**沒做到的：**
- `audit.mjs`、`svg-text.mjs`、`lesson-table.mjs` 沒跑：這台電腦沒有 Playwright（`Cannot find module 'playwright'`）。改用內建瀏覽器手動跑同樣的溢出與頂部列檢查。要跑腳本需要先裝 Playwright（新增全域套件，要使用者同意）。
- reduced-motion 沒有實測（內建瀏覽器不能模擬），只檢查了程式碼路徑。
- Safari 沒看過。
- 字級 150% 沒測。

## 6. 已知問題

- `vecplot` 的點很密時，標籤會和連線交叉；寫課程資料時把點分散開（styleguide 的範例「VPN 連不上」和「密碼重設」靠太近）。
- 截圖時常拍到轉場中途的半透明畫面（瀏覽器窗格的計時器被節流），不是頁面問題。

## 7. 下一步

- 第 2 段：寫模組 0–2（11 課），每 2–3 個模組跑一次檢查。
- **2027-01-22 重新查證**：Claude 模型與價格、API 版本、MCP 規格、OpenAI 與 Gemini 主推的 API。
