<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# 一般軟體與腳本

## CLI 與腳本

- 提供 `--help`，列出所有參數與一個範例。
- 會修改檔案的腳本提供 `-DryRun` / `--dry-run`，只列出會做什麼。
- 成功 exit code 0，失敗非 0；錯誤訊息寫到 stderr。
- 覆寫檔案前先備份，或要求明確的 `--force` 參數。
- 腳本開頭檢查必要的工具與參數，缺少就報錯退出。

## 跨平台路徑

- 用 `path.join`（Node）、`Join-Path`（PowerShell）、`pathlib`（Python）組路徑，不手寫 `/` 或 `\`。
- 不寫死使用者目錄；用 `os.homedir()`、`$HOME`、`Path.home()`。
- 路徑可能有空格，傳給外部指令時一律加引號。

## Windows / PowerShell

- 使用者的主要環境是 Windows 11 + PowerShell；給指令時預設給 PowerShell 版本。
- 腳本要同時相容 Windows PowerShell 5.1 和 PowerShell 7：
  - 5.1 沒有 `&&`、`||`、`?:`、`??`。
  - 5.1 的 `ConvertFrom-Json` 沒有 `-AsHashtable`。
- 讀寫文字檔明確指定 UTF-8：用 `[IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))`。
- 含中文的 `.ps1` 存成 UTF-8 with BOM，否則 5.1 會讀成亂碼。
- 用 `$ErrorActionPreference = 'Stop'` 讓錯誤中斷腳本。
- 環境變數用 `$env:NAME`，不用 `%NAME%` 或 `$NAME`。
- 行尾：在 `.gitattributes` 設定 `* text=auto`；`.ps1`、`.bat` 用 CRLF，`.sh` 用 LF。

## 自動化

- 排程或批次工作要寫日誌檔，包含開始時間、結束時間、處理筆數、錯誤。
- 可以重跑：同一個輸入跑兩次結果相同，不會重複建立資料。
