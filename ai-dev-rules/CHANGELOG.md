# Changelog

格式依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

### Added

- `bookshelf-portal` skill 收進 ai-dev-rules，三個工具都會安裝：3D 書櫃為預設首頁（`index.html`）、2D 版為 `index-2d.html`；新增疊放書等尺寸、觸控裝置的「點書 → 羊皮紙介紹 → 前往閱讀」流程、`goTo()` 集中跳轉、`pageshow`／`visibilitychange` 回到書櫃初始狀態、載入字型 3 秒逾時、three.js 版本固定；附 `scripts/mobile-flow.mjs`（模擬 iPhone 測載入、介紹卡與外部跳轉重置）與 `assets/template-3d.html`。
- `course-web-neo-brutalism` 第 13–15 條規則：動畫只給真實機制（概念流程用靜態圖、`pipeflow` 加 `static: true`）、每課至少一個互動元素、回書櫃按鈕與手機版設定移進側欄；新增 `references/build-and-widgets.md`（分段建置、共用元件庫、移植元件、6 個實際踩過的錯誤）與「改編外部文章」規則。
- `course-web-neo-brutalism/scripts/`：`build.sh`（組合前逐模組 `node --check`）、`audit.mjs`、`svg-text.mjs`、`lesson-table.mjs`、`longest-answer.mjs`，有問題時 exit code 為 1。
- core：溝通規範加「優先視覺化」與「新規範確立後回頭修正既有內容」；Git 加 `--no-ff` 合併規則；測試規範加「受限環境（雲端沙箱、離線）」。
- `domain-web-frontend`「手機與跳轉」、`domain-education-content` 動畫原則與「改編外部文章」。
- `scripts/build.ps1`：skill 附帶的 `.js`／`.mjs`／`.sh`／`.html`／`.css` 也加上「由 build.ps1 產生」註解（有 shebang 或 doctype 時放第二行），verify 才會通過。
- `course-web-neo-brutalism` skill：新野獸派課程網站規範，整理自 ai-chat-prompt-agent-course，並加入內文 7:1 對比、可拖曳側欄與字級調整、hover 單一訊號、完整進退場轉場、術語 popup、有鑑別度且每個選項附解析的選擇題、視覺化數量、查證到當下日期等規則。
- `course-web-neo-brutalism` 第 11 條規則：短文字換行以字詞完整為準（詞組斷點、不留孤行、避頭尾，仍有孤行時動態縮小字級），附實測過的詞組斷行寫法與檢查腳本。
- `course-web-neo-brutalism` 第 12 條規則與 `references/layout-geometry.md`：頂部列高度量測後寫回、側欄與把手同格 sticky 不蓋過頁尾、按鈕不被壓縮、不留空欄、SVG 線段端點接在圖形上、SVG 文字不壓框不壓線不單字成行；附 10 種裝置寬度清單與 4 支檢查腳本。
- `course-web-neo-brutalism` 選擇題：全站正確答案是最長選項的比例不超過 35%，檢查腳本會算出比例並納入 reference 頁的題目。
- `domain-web-frontend`「品質目標：得獎等級」：製作網頁以 Awwwards、Webby Awards、FWA 得獎程度為目標，用四維度評分的自我檢查迴圈反覆提升到達標；`web-animation` 與 `course-web-neo-brutalism` 引用這個迴圈。
- `domain-web-frontend`「跨瀏覽器（Chrome 與 Safari）」：交付前兩邊都實測；Playwright 的 WebKit 不能代替 Safari；橫排容器裡的直排文字，容器寫 `width: max-content`（Safari 27 直排書名被裁掉的實例）。
- `domain-web-frontend`、`web-animation` 與 `domain-media-image-video-animation` 動畫規則：3D 場景裡的明暗遮罩不做 `opacity` 動畫，改動 `background-color` 或 `filter: brightness()`（Safari 翻頁閃動的實例）；有 `delay` 的 Web Animations 用 `fill: 'both'`；動畫要在播放中檢查，暫停截圖看不到合成圖層的閃動。
- core 測試規範的 UI 改動：網頁至少在 Chrome 與 Safari 各看一次。

- `scripts/install.sh`：macOS／Linux 的安裝入口，檢查 `pwsh` 後把參數交給 `install.ps1`。

### Fixed

- `course-web-neo-brutalism/scripts/build.sh`：`node --check` 不接受沒有 `.js` 副檔名的暫存檔，改成在臨時資料夾裡建 `chk.js`。

### Changed

- `course-web-neo-brutalism` 參考站改為優先參考 `claude-code-secure-dev-course/`；驗證寬度從 3 種改為 10 種，並要求在頁面最上方與捲到最底各量一次。
- core 測試規範的 UI 改動：檢查寬度從 375、1280 兩種改為 10 種主流裝置寬度，並要求在頁面最上方與捲到最底各看一次、量測對齊、截圖失敗時寫明。
- `course-web-neo-brutalism` 詞組斷行：中英交界補回空格、14 字元內的英文詞組不拆行、課程編號和標題黏在一起。

## [0.2.0] - 2026-10-01

### Added

- 支援 macOS：腳本與 hook 用 PowerShell 7（`pwsh`）執行，和 Windows 共用同一套來源與 dist/。
- `install.ps1 -PowerShellExe`：指定 hook 用的 PowerShell；預設 Windows 用 `powershell.exe`、macOS 用 `pwsh` 完整路徑。
- install.ps1 會提醒缺少的執行環境：macOS 找不到 `pwsh`、Windows 找不到 Git Bash。
- `build.ps1 -OutDir`：build 到指定資料夾。
- hook 擋下 macOS 的磁碟抹除指令（`diskutil eraseDisk` 等）；新增 8 個 macOS 測試案例，共 38 個。
- `.gitattributes`：固定行尾，兩個系統 build 完不會出現只有行尾不同的差異。

### Changed

- hook 指令可跨系統：Claude Code 專案層交給 bash 在執行時挑 `powershell.exe` 或 `pwsh`；Codex 用 `command` + `commandWindows`；Claude Code 全域與 Antigravity 寫 `{{PS}}`，由 install.ps1 依系統替換。
- 腳本路徑一律用 `/`，不再寫死 `\`。
- verify.ps1 改成重新 build 到暫存資料夾比對內容，不再比修改時間（git clone 後會誤判）；新增 hook 指令跨系統檢查。
- `software-general` 領域規範：從「Windows / PowerShell」改成「Windows 與 macOS」，給指令前先看目前的作業系統。

## [0.1.0] - 2026-10-01

### Added

- core/：溝通、工作流程、程式碼品質、Git、測試與驗證、安全、文件，共 7 份規範。
- core/domains/：vibe coding、網頁前端、後端 API、遊戲開發、一般軟體、媒體、教材，共 7 個領域。
- skills/：13 個 skills；workflows/：6 個手動流程；agents/：independent-reviewer。
- enforcement/：擋危險指令與秘密檔案的 hook（三工具共用）、Prettier 格式化 hook、三工具權限設定、30 個 hook 測試案例。
- 6 個專案範本：vue3-vite-ts、uniapp、unity-2d、node-api、static-site、course-content。
- scripts/：build、verify、install（預設預覽、自動備份、JSON 合併）、new-project。
