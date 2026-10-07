# 研究筆記：終端機指令入門課

> 今天日期：**2026-10-07**。「查證」指 2026-10-07 用 WebSearch 讀到的官方或第三方頁面。
> 標記：✅ 官方文件直接確認 ・ 🟡 第三方或摘要 ・ ⚠️ 截至 2026-10 查證狀態：未確認
> 終端機的基本指令（`cd`、`ls`、管線、重新導向、引號規則、exit code）是幾十年不變的 POSIX 與 Windows 行為，下表只列**會變動**或**容易記錯**的事實。

---

## 0. 對課程設計影響最大的 6 個發現

| # | 發現 | 影響 |
|---|------|------|
| 1 | **Gemini CLI 2026-06-18 對免費、Google AI Pro、Ultra 帳號停止服務**，改用 Antigravity CLI（指令 `agy`）。 | 模組 7 的「三大 AI 工具」改為 Claude Code、Codex CLI、Antigravity CLI（使用者已確認） |
| 2 | **PowerShell 7.6 LTS 於 2026-03-18 發布**（.NET 10），支援到 2028-11；Windows 內建的 Windows PowerShell 5.1 不再加新功能。 | 模組 5：區分 `powershell.exe`（5.1）和 `pwsh`（7.x） |
| 3 | 三個 AI CLI 都用「下載安裝腳本並直接執行」安裝（`curl … \| bash`、`irm … \| iex`）。 | 模組 8 的危險指令要解釋「什麼時候可以這樣做」 |
| 4 | 三個 AI CLI 都有**互動模式**與**非互動模式**（`claude -p`、`codex exec`、`agy -p`），也都有權限／核准模式。 | 模組 7-1 用共同結構教，降低記憶負擔 |
| 5 | PowerShell 7 起支援 `&&`、`\|\|`；5.1 不支援。 | 3-4 要標出版本差異 |
| 6 | macOS 自 Catalina（2019）起預設 shell 是 zsh；Windows 11 預設終端機是 Windows Terminal。 | 0-2、5-2 |

---

## 1. 作業系統與 shell

| 事實 | 來源 | 可信度 |
|------|------|--------|
| macOS Catalina（10.15）起新帳號預設 shell 為 zsh | https://support.apple.com/en-us/102360 | ✅（Apple 支援文件，常年不變） |
| PowerShell 7.6 LTS 發布日 2026-03-18，建於 .NET 10 | https://devblogs.microsoft.com/powershell/announcing-powershell-7-6/ | ✅ |
| PowerShell 支援週期：7.6 LTS 支援到 2028-11 | https://learn.microsoft.com/en-us/powershell/scripting/install/powershell-support-lifecycle | 🟡（第三方文章引述，官方頁面存在） |
| Windows PowerShell 5.1 隨 Windows 內建，不再加新功能 | 同上 | ✅ |
| PowerShell 7 的管線鏈運算子 `&&`、`\|\|` | https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipeline_chain_operators | ✅（7.0 起） |
| PowerShell 執行原則（ExecutionPolicy）：Windows 用戶端預設 Restricted，擋 `.ps1` 腳本 | https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies | ✅ |
| Windows 11 22H2 起預設終端機為 Windows Terminal | https://learn.microsoft.com/en-us/windows/terminal/ | ✅ |
| Windows 的 sudo（Windows 11 24H2 起，可在設定中開啟） | https://learn.microsoft.com/en-us/windows/advanced-settings/sudo/ | ✅ |
| winget 隨 App Installer 內建於 Windows 10 1809+／Windows 11 | https://learn.microsoft.com/en-us/windows/package-manager/winget/ | ✅ |
| Homebrew 安裝與 `brew install` | https://brew.sh | ✅ |

## 2. 跨平台工具

| 事實 | 來源 | 可信度 |
|------|------|--------|
| git 基本指令：`clone`、`status`、`add`、`commit`、`push`、`pull`、`log` | https://git-scm.com/docs | ✅ |
| `npx` 執行套件的指令而不必全域安裝 | https://docs.npmjs.com/cli/commands/npx | ✅ |
| Python 虛擬環境：`python -m venv .venv`；啟用指令依 shell 不同（bash/zsh `source .venv/bin/activate`、PowerShell `.venv\Scripts\Activate.ps1`、cmd `.venv\Scripts\activate.bat`） | https://docs.python.org/3/library/venv.html | ✅ |
| Windows 的 Python 啟動器 `py` | https://docs.python.org/3/using/windows.html | ✅ |
| Windows 10 1803 起內建 `curl.exe`；Windows PowerShell 5.1 中 `curl` 是 `Invoke-WebRequest` 的別名，PowerShell 7 已移除這個別名 | https://learn.microsoft.com/en-us/powershell/scripting/whats-new/differences-from-windows-powershell | ✅ |
| Windows 內建 OpenSSH 用戶端（`ssh`） | https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse | ✅ |

## 3. 三大 AI 工具

### 3.1 Claude Code（`claude`）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 安裝：`curl -fsSL https://claude.ai/install.sh \| bash`；Windows `irm https://claude.ai/install.ps1 \| iex`；也可用 brew、WinGet、npm | https://code.claude.com/docs/en/overview | ✅ |
| `claude` 互動、`claude "問題"` 帶初始提示、`claude -p` 非互動、`claude -c` 接續最近一次對話 | https://code.claude.com/docs/en/cli-reference | ✅ |
| `--permission-mode`：`default`、`acceptEdits`、`plan`、`auto`、`dontAsk`、`bypassPermissions`；互動中 Shift+Tab 切換 | https://code.claude.com/docs/en/permission-modes | ✅（沿用 secure-dev 課 2026-10-02 查證） |
| 斜線指令 `/help`、`/clear`、`/model`、`/permissions`、`/usage` | https://code.claude.com/docs/en/commands | ✅ |
| 專案說明檔 `CLAUDE.md` | https://code.claude.com/docs/en/memory | ✅ |
| 版本：2026-10 初為 2.1.28x | secure-dev 課 research-notes（2026-10-02） | 🟡 課程不寫死版本號 |

### 3.2 Codex CLI（`codex`）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 安裝：`npm install -g @openai/codex` 或 `brew install codex`；`codex login` | https://developers.openai.com/codex/cli | ✅ |
| `codex` 互動、`codex "問題"`、`codex exec "…"` 非互動、`codex exec resume --last` | https://developers.openai.com/codex/cli/reference | ✅ |
| `--sandbox read-only \| workspace-write \| danger-full-access`；`--ask-for-approval`（如 `on-request`、`never`） | https://developers.openai.com/codex/concepts/sandboxing | ✅ |
| 專案說明檔 `AGENTS.md` | https://developers.openai.com/codex/guides/agents-md | ✅ |

### 3.3 Antigravity CLI（`agy`）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 2026-06-18 Gemini CLI 對免費／Pro／Ultra 帳號停止，改為 Antigravity CLI | https://toolsbase.dev/en/reference/gemini-cli-commands | 🟡 僅第三方 |
| 安裝：`curl -fsSL https://antigravity.google/cli/install.sh \| bash`；Windows `irm https://antigravity.google/cli/install.ps1 \| iex`；`agy --version` | https://computingforgeeks.com/antigravity-cli-cheat-sheet/ | 🟡 僅第三方 |
| `agy` 互動、`agy -p "…"` 非互動、`-c` 接續、`--model`、`--add-dir`、`--output-format`、`--dangerously-skip-permissions` | 同上；https://www.gradually.ai/en/antigravity-cli-commands/ | 🟡 |
| 權限規則格式 `action(target)`，判定順序 Deny > Ask > Allow；`/permissions` 切換 request-review／always-proceed／strict | https://antigravity.google/docs/cli/permissions | 🟡（搜尋摘要，官方頁面存在） |
| 專案說明檔的檔名 | — | ⚠️ 未確認：課程只說「各家都有專案說明檔」，不寫 Antigravity 的檔名 |

## 4. 安全

| 事實 | 來源 | 可信度 |
|------|------|--------|
| `rm` 不經過資源回收筒，刪除無法從系統復原 | GNU coreutils 文件 https://www.gnu.org/software/coreutils/manual/html_node/rm-invocation.html | ✅ |
| 「下載並直接執行」（`curl \| sh`、`irm \| iex`）只應用在你信任的官方網址 | 各官方安裝頁 | ✅（做法），判斷為教學建議 |

## 5. 下次重新查證：2027-01-07

- Antigravity CLI 的官方文件（目前多為第三方來源）。
- 三個 AI CLI 的旗標名稱、權限模式名稱。
- PowerShell 7.7 或下一個 LTS 的發布狀態。
