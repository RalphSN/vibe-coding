<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 分段建置與互動元件

課程超過 5 個模組時，`index.html` 會超過 300 KB，一次寫完容易出錯。改成分段寫、腳本組合。

## 1. 分段組合

在暫存資料夾放這些分段，[scripts/build.sh](../scripts/build.sh) 依下表順序串成單一 `index.html`：

| 順序 | 檔案 | 內容 |
|---|---|---|
| 1 | `a-head1.html` | `<head>`、token、基礎樣式，停在 `<style>` 裡 |
| 2 | `b-widgets.css` | 互動元件樣式 |
| 3 | `a-head2.html` | 關閉 `</style>`、版面骨架 HTML |
| 4 | `c-data.html` | `COURSES` 與資料 API（`defineLessons`、`defineTerms`、`defineSources`） |
| 5 | `d-sources.html` | `defineSources()` 全部來源 |
| 6 | `m0.html`…`mN.html` | 每個模組一個 `<script>`，只放資料 |
| 7 | `e-engine1.js` | 引擎前半（`md()`、路由、側欄、術語、測驗） |
| 8 | `f-widgets.js` | 互動元件 |
| 9 | `e-engine2.js` | 引擎後半（render、hydrate、啟動） |

```sh
sh scripts/build.sh <分段資料夾> course-web/<slug>/index.html
```

`build.sh` 會先抽出每個 `m*.html` 的 `<script>` 跑 `node --check`，任何一個有語法錯誤就停止，不產生半壞的成品。

只有成品 `index.html` 進 repo；分段檔是工作檔。HANDOFF 要寫明分段放在哪裡、怎麼重建。

## 2. 互動元件

### 2.1 呼叫格式

```js
{ type: 'widget', name: 'pipeflow', props: { static: true, stages: [...] } }
```

每個元件是 `Widgets.<name> = { render(props, id) { return html }, hydrate(el, props) { 綁事件 } }`。render 只產生字串，hydrate 才綁事件與動畫；這樣換課、重繪都不會重複綁定。

### 2.2 共用元件庫

來源：`course-web/terminal-commands-course/index.html` 的 `f-widgets` 段（搜尋 `Widgets.`）。新課程整段搬過去，再刪掉用不到的。

| 元件 | 用途 | 動態或靜態 |
|---|---|---|
| `term` | 模擬終端機：逐字打出指令、顯示輸出，可切換 shell | 動態（真的在輸入、輸出） |
| `anatomy` | 指令拆解：點每一段看說明 | 靜態＋點擊 |
| `fstree` | 資料夾樹：點資料夾看路徑變化 | 靜態＋點擊 |
| `pipeflow` | 資料流經多個階段 | `static: true` 為靜態圖；不加才逐站播放 |
| `pathfinder` | 絕對／相對路徑練習 | 互動練習 |
| `rosetta` | 同一件事在不同 shell 的寫法對照 | 分頁切換 |
| `herodemo` | 首頁示範 | 動態 |
| `classify` | 拖放或點選分類練習 | 互動練習 |

單一課程專用的元件（例如 karpathy 課的 `ladder`、`rulecheck`、`kvcache`、`promptgen`）寫在該課的 HANDOFF，不放進共用表，除非第二門課也要用。

### 2.3 動畫或靜態：先問「東西真的在動嗎」

| 內容 | 做法 | 例子 |
|---|---|---|
| 真實機制，有東西在移動或變化 | 動畫或可操作的示範 | 電子在電池裡移動、管線裡的資料一筆筆流過、拉桿改參數看結果 |
| 概念步驟、流程、層級、比較 | 靜態圖，一次看完 | 「先短、再深、再核對」三步、四級階梯、A/B 對照 |

`pipeflow` 用在概念步驟時一律加 `static: true`。逐站播放會讓讀者等動畫跑完才看得到全貌，對 ADHD 讀者反而是阻礙。

每一課至少一個互動元素（分類練習、拉桿、可切換對照、檢查器），但要讓讀者「做」一件事，不是裝飾。

## 3. 移植元件到既有課程

1. 先搜尋目標檔有沒有同名的 `Widgets.<name>`、同名 class，有就合併，不要重複註冊。
2. CSS 插在 `</style>` 前，JS 插在引擎的 render 之前；插入用腳本做，改完重跑 `audit.mjs`。
3. 每課補上互動元素後，用 `lesson-table.mjs` 列出每課的元件，確認沒有漏掉的課。

## 4. 常見錯誤（都實際發生過）

| 症狀 | 原因 | 做法 |
|---|---|---|
| 整頁空白、console 說 Unexpected identifier | SVG 寫在 template literal 裡，內容有反引號 | 反引號寫成 `` \` ``；`build.sh` 的 `node --check` 會擋下 |
| SVG 指定的顏色沒出現 | `fill="#…"` 被全站 CSS 的 `svg text { fill }` 蓋掉 | 用 class（`fill-term`、`t-prompt`、`on-color`），顏色寫在 CSS token |
| 標題斷行怪異 | 標題裡有 `\|\|`（例如 shell 的 OR），撞到詞組斷點符號 `\|` | 標題不寫 `\|` 字元，改寫成文字 |
| 檢查器把「1,002」算成兩個子句 | 用逗號數子句 | 先去掉數字裡的千分位逗號（`/(\d),(?=\d{3})/g`）再算 |
| 流程圖在手機擠成一團 | 橫排階段太多 | 窄螢幕改直排；階段超過 4 個一律直排 |
| 手機出現水平捲動 | 按下狀態用 `transform: translate` 位移 | 按下狀態改用 `box-shadow` 變化 |

## 5. 書櫃與手機版

- 每門課的頂部列放「回書櫃」按鈕，圖示用最基本的房屋線條，連到 `../../index.html`。
- 手機版（< 768px）頂部列只留選單、回書櫃與標題；字級、深色模式移到側欄底部的 `.sidebar-prefs`，頂部列的同名按鈕用 CSS 隱藏。
- 新課程完成後，用 `bookshelf-portal` skill 把書加進首頁（3D 版 `index.html` 與 2D 版 `index-2d.html` 都要加）。
