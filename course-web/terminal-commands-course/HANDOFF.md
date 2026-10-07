# 交接文件：終端機指令，從零看懂到會寫

> 更新：2026-10-07
> 一句話現況：**9 個模組、37 個單元全部完成並通過自動檢查；下次重新查證日期 2027-01-07。**

## 1. 接手的 3 個步驟

1. 預覽：在 repo 根目錄執行 `python -m http.server 8767`，打開 `http://localhost:8767/course-web/terminal-commands-course/`。直接雙擊 `index.html` 也能用。
2. 讀 `outline.md`（課程架構）與 `research-notes.md`（每個事實的來源與可信度）。
3. 改內容：每個模組是 `index.html` 裡一個 `<script>` 資料區塊（搜尋「模組 N：」）。新增單元先在 `COURSES` 加標題，再用 `defineLessons` 補內容。

## 2. 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 課程網站（單一檔案，CSS 與 JS 內嵌） |
| `research-notes.md` | 研究筆記，查證於 2026-10-07 |
| `outline.md` | 模組、單元、間隔複習排程、互動元件位置、取捨表 |
| `design-system.md` | 新增的 token、對比檢查、元件清單 |

課程資料夾以外的改動：根目錄 `index.html` 與 `index-3d.html` 的 `SITES` 各新增一本書（id `terminal`），`ICONS` 新增 `terminal` 圖示。

## 3. 資料格式（摘要）

沿用 `claude-code-secure-dev-course` 的格式（見該課 HANDOFF.md），本課新增：

- 互動元件：
  - `term`：`{ shell: 'pwsh'|'zsh'|'bash'|'cmd', title, cwd?, steps: [{ cmd, out, err?, note, cwd? }] }`
  - `anatomy`：`{ presets: [{ cmd, notes?: { 片段: 說明 } }], input?: false }`
  - `fstree`：`{ style: 'unix'|'win', tree, home: [...], start: [...], actions: [指令] }`；樹的資料 `FS_UNIX`、`FS_WIN` 在模組 2 區塊開頭
  - `pipeflow`：`{ stages: [{ cmd, out: [行], err?: [行], note }] }`
  - `pathfinder`：`{ shell, dirs: [{ path, has: [程式名] }], presets: [名稱] }`
  - `rosetta`：`{ tasks: [{ label, pwsh, zsh?, bash, cmd, note? }] }`；共用資料 `ROSETTA_TASKS` 在模組 5 區塊開頭（5-5、8-2 都用）
- 程式碼區塊 `lang` 可用 `cmd`、`zsh`、`pwsh`。
- 標題的 `|` 是斷點，所以**標題裡不能出現 `||`**（3-4 因此改名）。
- SVG 裡的終端機畫面用 class 上色：`fill-term`、`t-prompt`、`t-cmd`、`t-out`、`t-dim`、`t-err`、`mono`。
- SVG 寫在模板字串裡，文字裡的反引號要寫成 `` \` ``。

## 4. 驗證方法與 2026-10-07 結果

用 Playwright（Chromium）跑全站，CDN 與 Google Fonts 在測試環境被擋，以系統字型量測：

- 37 個單元：0 個 JS 錯誤、0 個缺漏術語、每課至少 2 張圖（共 74 張以上）。
- 143 題選擇題：每題剛好一個正解、每個選項都有解析；正確答案是最長選項的比例 45/143（31.5%）。
- 360px 寬：0 個水平溢出；標題無孤行警告。
- SVG：沒有文字超出圖框或壓到框線（以系統字型量測）。
- 互動元件實際點擊測試：資料夾樹（cd、ls、錯誤路徑）、PATH 搜尋（找到與找不到）、管線逐站播放、拆解器、方言對照、首頁打字動畫。
- 截圖檢查：首頁（桌面、手機、深色）、2-2、3-2、4-2、5-5、7-1（深色）、3-4（手機）。

## 5. 已知問題

- **Antigravity CLI** 的安裝網址與旗標主要來自第三方整理，課程內已用「未確認」標示（7-1、7-4）。
- 測試環境連不到 cdnjs，**highlight.js 語法上色沒有在瀏覽器裡實際看過**；沒有上色時程式碼仍正常顯示。
- 截圖用系統字型，Noto Sans TC／JetBrains Mono 載入後字寬略有不同；SVG 文字留有餘裕，但建議用真實瀏覽器再看一次。
- 8-3 估計 15 分鐘（含 15 題測驗），超過 12 分鐘的目標。
- 範例輸出裡的版本號（Node、Vite、VS Code）是示意，不代表目前最新版。

## 6. 下一步

- **2027-01-07 重新查證**：三個 AI CLI 的旗標與權限模式名稱、Antigravity 官方文件、PowerShell 下一個版本。
- 可以加的進階單元（目前在 8-3 列為「已知的未知」）：shell 腳本的迴圈與函式、正規表示式、Docker 指令。
