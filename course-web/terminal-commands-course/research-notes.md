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

---

## 2026-10-29 改版審查

> 改版內容：拿掉測驗、每課補「深入：」段落、8-3 改成一頁地圖、內容重新查證。查證日期 2026-10-29（部分 2026-10-30 補查）。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 | 可信度 |
|---|---|---|---|---|
| 1-2 | `echo "售價 $100"` 一律印出「售價 00」 | bash 印「售價 00」；zsh 把 `$100` 當成第 100 個參數，印「售價 」 | https://zsh.sourceforge.io/Doc/Release/Expansion.html | 🟡 依 zsh 手冊的參數展開規則，未實機執行 |
| 4-3 | Windows `sudo` 在目前視窗以管理員執行那一個指令 | 預設模式 `forceNewWindow` 會開新視窗；另有 disableInput、inline | https://learn.microsoft.com/en-us/windows/advanced-settings/sudo/ | ✅ |
| 6-1 | `winget install --id Python.Python.3.13 -e` | Python 官方改推 Python install manager：`winget install --id 9NQ7512CXL7T -e` | https://docs.python.org/3/using/windows.html | ✅ |
| 6-3 深入思考題 | 「npm 用各系統的預設 shell 執行 script」 | Windows 預設 `cmd.exe`、POSIX 預設 `/bin/sh` | https://docs.npmjs.com/cli/v12/commands/npm-run/ | ✅ |
| 6-4 | `py -3.13` 指定版本、py 是啟動器 | Python install manager 提供 `py`／`python`；`py -V:3.15`；舊啟動器與完整安裝程式已被取代（3.16 起不提供） | https://docs.python.org/3/using/windows.html | ✅ |
| 7-1、8-2 | Antigravity 專案說明檔「⚠️ 檔名未確認」 | 讀 `GEMINI.md` 與 `AGENTS.md` | https://antigravity.google/docs/cli/gcli-migration | ✅ |
| 7-1、7-4 | Antigravity 安裝網址與旗標「僅第三方來源」 | 官方文件已確認 install.sh／install.ps1、`-p`、`-c`、`--output-format text｜json｜stream-json`、`--dangerously-skip-permissions`；拿掉「未確認」區塊 | https://antigravity.google/docs/getting-started?tab=cli 、https://antigravity.google/docs/cli/reference | ✅ |
| 7-4 | `agy` 指定對話用 `--conversation <id>` | 官方 reference 未列出，刪除 | 同上 | ✅（刪除） |
| 7-2 | Claude Code 預設模式為 default | v2.1.283 起互動對話預設以 `auto` 啟動；`default` 介面上叫 Manual（別名 `manual`）；`-p` 以 default 啟動，v2.1.302 起需要核准的動作會被拒絕 | https://code.claude.com/docs/en/permission-modes | ✅ |
| 7-1 | Claude Code 用 brew 安裝 | `brew install --cask claude-code`（穩定通道約晚一週；另有 `claude-code@latest`） | https://code.claude.com/docs/en/setup | ✅ |
| 7-3 | `--ask-for-approval` 有 `untrusted`、`on-request`、`never` | 官方文件只剩 `on-request`、`never`；`untrusted` 在 0.149（2026-08）移除、`on-failure` 在 0.143 移除、`--full-auto` 在 0.147 移除 | https://learn.chatgpt.com/docs/developer-commands?surface=cli （可用值 ✅）；https://blakecrosley.com/blog/codex-untrusted-approval-policy-retired （版本號 🟡 僅第三方） | ✅／🟡 |
| 7-3 | 安裝只有 npm、brew | 另有官方腳本 `curl -fsSL https://chatgpt.com/codex/install.sh ｜ sh`；第一次執行 `codex` 會引導登入 | https://learn.chatgpt.com/docs/codex/cli | ✅ |

### 補的子題（深入段落，35 課）

- 模組 0：PTY／ConPTY、換哪一層會變什麼、換預設 shell、登入 shell 的 `-`、SIGINT 與 Ctrl+Z／Ctrl+R／Ctrl+D。
- 模組 1：`--` 與 `-`、GNU 與 BSD 選項順序、shell 展開順序與 bash／zsh 切字差異、內建指令查法、特殊結束代碼 126／127／130、pipefail。
- 模組 2：大小寫、MAX_PATH、WSL 路徑；`ls` 偵測終端機、`cd -`／`pushd`；`mv` 跨磁碟、BSD 與 GNU `cp` 差異；regex 的 `-F`／`-E`、ripgrep。
- 模組 3：isatty 與緩衝、PowerShell 六條串流；管線同時執行、7.4 位元組保留；PowerShell 不支援 `<`；`A && B || C` 陷阱、`set -e`。
- 模組 4：三種變數範圍、`setx` 1024 字元截斷；查找順序、`hash -r`、Windows 系統／使用者 PATH；755／644、資料夾 x、macOS 隱私保護、執行原則不是安全邊界；登入 shell 讀的設定檔。
- 模組 5：`#!/bin/sh` 是 dash、`env bash`、`set -euo pipefail`；zsh 陣列與 `nonomatch`；Format-* 放最後、`-ceq`；cmd delayed expansion、`%%f`、`chcp 65001`；無法直接翻譯的寫法。
- 模組 6：套件來源與 `winget pin`、雙安裝路線；git 復原工具表與 reflog；semver、`npm ci`、postinstall、`npx -y`、npm script-shell；Python 3.15、install manager、uv；curl 不把 404 當失敗、ssh 主機指紋與 `~/.ssh/config`。
- 模組 7：三家設計取捨、AGENTS.md 跨工具慣例、Claude Code 新預設與 Windows 上的 shell、Codex 旗標變化、Antigravity 搬遷對照、各層防線的可靠度；7-1 新增 AI CLI 指令拆解器。
- 8-1：救援方式表、`--force-with-lease` 的漏洞與 `--force-if-includes`、secret scanning。

### 新查證的事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| Gemini CLI 2026-06-18 對 AI Pro／Ultra／免費 Code Assist 帳號停止；Standard／Enterprise 授權與付費 API 金鑰仍可用 | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ | ✅（原本 🟡 升級） |
| Antigravity 權限：規則在 `~/.gemini/antigravity-cli/settings.json`；toolPermission：strict、request-review、proceed-in-sandbox、always-proceed；`--mode=auto`（預覽） | https://antigravity.google/docs/permissions?tab=cli | ✅ |
| Python 3.15.0 於 2026-10-09 發布 | https://www.python.org/downloads/release/python-3150/ | ✅ |
| PowerShell 7.4 起重新導向保留外部程式的位元組；`<` 保留未實作；只能把其他串流併到 1 號 | https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection | ✅ |
| Claude Code 在原生 Windows 有 Git for Windows 時用 Git Bash，否則用 PowerShell | https://code.claude.com/docs/en/setup | ✅ |
| ConPTY 隨 2018 年秋季 Windows 10 更新推出（課文寫 1809） | https://devblogs.microsoft.com/commandline/windows-command-line-introducing-the-windows-pseudo-console-conpty/ | 🟡 官方部落格只寫「Fall 2018」 |

### 未查證

- 2-3：BSD `cp -r src/` 只複製內容、GNU `rm -I` 超過 3 個檔案才問，依 man page 記憶撰寫，未重新開文件核對。
- 4-1：`setx` 截斷 1024 字元，依記憶撰寫。
- 6-1：`winget pin` 指令，依記憶撰寫。
- 7-5：各工具對允許規則與 `&&` 串接的處理細節，課文只寫「各工具不同，查官方文件」。
- 8-1：`--force-if-includes` 自 Git 2.30 起，依記憶撰寫。

### 下次重新查證：2027-01-29

- 三家 AI CLI 的旗標、權限模式與預設值（變動最快）。
- PowerShell 7.7 的發布狀態；Python install manager 的指令。
