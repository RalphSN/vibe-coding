# 三工具功能對照

依據：[research-notes.md](research-notes.md)（2026-10-01 查詢）。以各工具最新版為準。

## 功能對照

| 功能 | Claude Code | Codex | Antigravity |
|---|---|---|---|
| 全域規則 | `~/.claude/CLAUDE.md` + `~/.claude/rules/` | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` |
| 專案規則 | `CLAUDE.md`（可 `@AGENTS.md`）或原生讀 `AGENTS.md` | `AGENTS.md`（git root 往下） | `AGENTS.md` / `GEMINI.md` |
| 條件式規則 | `.claude/rules/` + `paths:` | 不支援 | `.agents/rules/` + `trigger: glob` / `model_decision` |
| 技能 | `.claude/skills/`、`~/.claude/skills/` | `.agents/skills/`、`~/.codex/skills/` | `.agents/skills/`、`~/.gemini/config/skills/` |
| 手動流程 | skill + `disable-model-invocation`，用 `/name` | skill + `allow_implicit_invocation: false`，用 `$name` | skill，用 `/name`（workflows 2026-11-01 棄用） |
| 子代理 | `.claude/agents/*.md` | `.codex/agents/*.toml` | 2.0 有 custom subagents，格式未查證 |
| Hooks | `settings.json` 的 `hooks` | `hooks.json` | `hooks.json`（最外層是自訂名稱） |
| 權限 | `permissions.allow / ask / deny` | permissions profile、`rules/*.rules` | CLI `settings.json` 的 `permissions`；2.0 App 用 UI |
| 大小上限 | 每檔建議 < 200 行 | 合計 32 KiB | 規則每檔 24,000 bytes；always_on 合計 20,000 tokens |
| Hook 依系統切換 | 無專用欄位；shell 形式在 macOS 用 sh、Windows 用 Git Bash | `command`（macOS）+ `commandWindows`（Windows） | 文件沒寫 |

## 這個規範庫怎麼對應

| core 內容 | Claude Code | Codex | Antigravity |
|---|---|---|---|
| 00 溝通、01 工作流程 | `CLAUDE.md` | `AGENTS.md` | `GEMINI.md` |
| 02–06 | `~/.claude/rules/*.md`（無條件載入） | 同一份 `AGENTS.md` | 同一份 `GEMINI.md` |
| 領域規範（全域） | `domain-*` skills | `domain-*` skills | `domain-*` skills |
| 領域規範（專案） | `.claude/rules/`：有檔案類型的用 `paths`，其他每次載入 | 不另外放，`AGENTS.md` 提示用 `$domain-*` | `.agents/rules/`：有檔案類型的用 `glob`，其他用 `model_decision` |
| 13 個 skills | `~/.claude/skills/` | `~/.codex/skills/` | `~/.gemini/config/skills/` |
| 6 個 workflows | 只能手動呼叫的 skill | 只能手動呼叫的 skill | skill |
| 擋危險指令 | permissions deny / ask + PreToolUse hook | `.rules`（forbidden / prompt）+ PreToolUse hook | CLI permissions + PreToolUse hook |
| 擋 `.env` | `Read(.env)` deny + hook | hook；加 `-IncludeCodexPermissions` 再多一層 permissions profile | `read_file(.env)` deny + hook |
| 自動格式化 | 專案層 PostToolUse 跑 Prettier | 專案層 PostToolUse | 專案層 PostToolUse |
| hook 指令（Windows / macOS） | 全域：install 填入這台的 PowerShell；專案：交給 bash，執行時挑 `powershell.exe` 或 `pwsh` | `commandWindows` 用 `powershell.exe`，`command` 用 sh 挑 `pwsh` | install 填入這台的 PowerShell（專案層兩系統共用要另外處理，見 README） |

Claude 的 02–06 放在 `rules/` 而不是 `CLAUDE.md`，是為了讓每個檔案都低於 200 行；兩者都是每次載入，效果相同。

## 不支援或有落差的地方與替代做法

| 落差 | 影響 | 替代做法 |
|---|---|---|
| Codex 沒有條件式規則 | 領域規範沒辦法按檔案類型自動載入 | 做成 `domain-*` skills，靠 description 自動判斷，也可以 `$domain-xxx` 手動叫 |
| Claude Code 不讀 `.agents/skills/` | 專案層無法和 Codex / Antigravity 共用 skills 資料夾 | skills 一律裝在全域，三個工具各一份，由 build 產生確保一致 |
| Antigravity workflows 即將棄用 | `.agents/workflows/` 2026-11-01 後不能用 | 6 個 workflow 全部做成 skill |
| Antigravity 2.0 App 的權限只能在 UI 設定 | 設定檔無法管到 App | 靠全域 hook 擋；README 列出要在 UI 手動開的選項 |
| Antigravity Windows 沒有新版 terminal sandbox | 指令隔離較弱 | hook 為主要防線 |
| Codex `.rules` 比對 argv 前綴 | Windows 上指令包在 `powershell -Command` 裡時可能比對不到 | hook 會讀完整指令字串再判斷 |
| Codex permissions profile 與 `sandbox_mode` 互斥 | 不能直接寫進既有設定 | 預設不寫；`-IncludeCodexPermissions` 會先檢查衝突 |
| 文字規則沒有約束力 | 模型可能不照做 | 破壞性操作、秘密檔案都同時有設定層的擋法 |
| macOS 沒有 Windows PowerShell 5.1 | hook 與腳本要另一個執行環境 | macOS 用 PowerShell 7 跑同一套腳本；腳本同時相容 5.1 與 7 |
| Antigravity hook 沒有依系統切換的寫法 | 專案層 `.agents/hooks.json` 只對安裝的那個系統有效 | 在另一台重跑 install，或兩台都裝 PowerShell 7 並用 `-PowerShellExe pwsh` |
| Claude Code 在 Windows 用 Git Bash 跑 shell 形式的 hook | 沒裝 Git Bash 時專案層 hook 不會生效 | install.ps1 在 Windows 找不到 Git Bash 會提醒；全域 hook 用 exec 形式，不受影響 |

## 未查證、要實際操作確認的項目

1. Antigravity hook 在 Windows、macOS 的執行方式，以及 hook 沒有輸出決策時要輸出什麼（目前輸出 `{}`）。
2. Antigravity `run_command` / `view_file` 的參數欄位名稱：hook 目前掃描所有字串參數，不依賴欄位名稱。
3. Codex 專案層 hook 的工作目錄是不是專案根目錄（`.codex/hooks.json` 用相對路徑）。
4. Antigravity CLI 的 `permissions` 在 Windows 是否生效（文件說 Windows 還沒有統一的權限系統）。
