# Changelog

格式依 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/)。

## [Unreleased]

### Added

- `course-web-neo-brutalism` skill：新野獸派課程網站規範，整理自 ai-chat-prompt-agent-course，並加入內文 7:1 對比、可拖曳側欄與字級調整、hover 單一訊號、完整進退場轉場、術語 popup、有鑑別度且每個選項附解析的選擇題、視覺化數量、查證到當下日期等規則。
- `course-web-neo-brutalism` 第 11 條規則：短文字換行以字詞完整為準（詞組斷點、不留孤行、避頭尾，仍有孤行時動態縮小字級），附實測過的詞組斷行寫法與檢查腳本。
- `course-web-neo-brutalism` 第 12 條規則與 `references/layout-geometry.md`：頂部列高度量測後寫回、側欄與把手同格 sticky 不蓋過頁尾、按鈕不被壓縮、不留空欄、SVG 線段端點接在圖形上、SVG 文字不壓框不壓線不單字成行；附 10 種裝置寬度清單與 4 支檢查腳本。
- `course-web-neo-brutalism` 選擇題：全站正確答案是最長選項的比例不超過 35%，檢查腳本會算出比例並納入 reference 頁的題目。
- `domain-web-frontend`「品質目標：得獎等級」：製作網頁以 Awwwards、Webby Awards、FWA 得獎程度為目標，用四維度評分的自我檢查迴圈反覆提升到達標；`web-animation` 與 `course-web-neo-brutalism` 引用這個迴圈。

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
