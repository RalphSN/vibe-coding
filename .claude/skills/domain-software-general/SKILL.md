---
name: domain-software-general
description: 桌面工具、CLI、腳本、自動化的通用規範，含跨平台路徑處理與 Windows / macOS / PowerShell 注意事項。寫 PowerShell、Shell、Node.js 或 Python 腳本、命令列工具、自動化流程時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 一般軟體與腳本

## CLI 與腳本

- 提供 `--help`，列出所有參數與一個範例。
- 會修改檔案的腳本提供 `-DryRun` / `--dry-run`，只列出會做什麼。
- 成功 exit code 0，失敗非 0；錯誤訊息寫到 stderr。
- 覆寫檔案前先備份，或要求明確的 `--force` 參數。
- 腳本開頭檢查必要的工具與參數，缺少就報錯退出。

## 跨平台路徑

- 用 `path.join`（Node）、`Join-Path`（PowerShell）、`pathlib`（Python）組路徑，不手寫 `\`；寫死的相對路徑用 `/`（Windows 也接受）。
- 不寫死使用者目錄；用 `os.homedir()`、`$HOME`、`Path.home()`。
- 路徑可能有空格，傳給外部指令時一律加引號。
- 檔名大小寫要和引用一致：macOS 預設不分大小寫、Linux 伺服器會分。

## Windows 與 macOS

- 使用者同時用 Windows 11（PowerShell）和 macOS（zsh）；給指令前先看目前的作業系統，給那個系統的版本。不確定時兩種都給。
- 自動化腳本要兩個系統都能跑：PowerShell 腳本相容 Windows PowerShell 5.1 與 macOS 的 PowerShell 7（`pwsh`），或改用 Node.js / Python。
- 判斷系統：PowerShell 用 `$IsWindows`（5.1 沒有這個變數，視為 Windows）；Node 用 `process.platform`；Python 用 `sys.platform`。
- 不呼叫只有單一系統才有的指令（`powershell.exe`、`cmd`、`open`、`pbcopy`）而沒有另一個系統的替代做法。

## PowerShell

- 腳本要同時相容 Windows PowerShell 5.1 和 PowerShell 7：
  - 5.1 沒有 `&&`、`||`、`?:`、`??`。
  - 5.1 的 `ConvertFrom-Json` 沒有 `-AsHashtable`。
- 讀寫文字檔明確指定 UTF-8：用 `[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))`。
- 含中文的 `.ps1` 存成 UTF-8 with BOM，否則 5.1 會讀成亂碼。
- 用 `$ErrorActionPreference = 'Stop'` 讓錯誤中斷腳本。
- 環境變數用 `$env:NAME`，不用 `%NAME%` 或 `$NAME`。
- 行尾：在 `.gitattributes` 設定 `* text=auto`；`.ps1`、`.bat` 用 CRLF，`.sh` 用 LF（CRLF 的 `.sh` 在 macOS 跑不起來）。

## 自動化

- 排程或批次工作要寫日誌檔，包含開始時間、結束時間、處理筆數、錯誤。
- 可以重跑：同一個輸入跑兩次結果相同，不會重複建立資料。
