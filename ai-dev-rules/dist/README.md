<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# dist/

這個資料夾由 `scripts/build.ps1` 產生，每次 build 會整個重建。要改內容請改 `core/`、`skills/`、`workflows/`、`agents/`、`enforcement/`。

| 資料夾 | 安裝到 | 由誰安裝 |
|---|---|---|
| `claude-code/global/` | `~/.claude/` | `install.ps1 -Tool claude` |
| `claude-code/project/` | 專案根目錄 | `new-project.ps1` 或 `install.ps1 -Scope project` |
| `codex/global/` | `~/.codex/` | `install.ps1 -Tool codex` |
| `codex/project/` | 專案根目錄 | 同上 |
| `antigravity/global/` | `~/.gemini/` | `install.ps1 -Tool antigravity` |
| `antigravity/project/` | 專案根目錄 | 同上 |

JSON 設定檔裡的 `{{HOME}}` 由 install.ps1 換成實際的家目錄路徑，`{{PS}}` 換成這台電腦執行 hook 的 PowerShell（Windows：`powershell.exe`；macOS：`pwsh` 的完整路徑）。`settings.json`、`hooks.json` 是用合併的方式寫入，不會整個覆蓋。

Claude Code 專案層與 Codex 的 hook 指令不需要替換：Claude 交給 bash 在執行時挑 `powershell.exe` 或 `pwsh`，Codex 用 `commandWindows` 區分，同一份設定 Windows 與 macOS 都能用。