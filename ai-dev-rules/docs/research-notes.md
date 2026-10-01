# 研究筆記：三工具的規則、技能、設定格式

查詢日期：2026-10-01（所有來源同日讀取）。
本機版本（2026-10-01 更新後）：Claude Code 2.1.286、Antigravity CLI（agy）1.2.14、Antigravity 2.0 App 2.18.1、Antigravity IDE 2.5.5、Codex App 26.928（`codex` 不在 PATH）。

## 結論速查

| 項目 | Claude Code | Codex | Antigravity |
|---|---|---|---|
| 全域規則檔 | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md`（有 `AGENTS.override.md` 時改讀它） | `~/.gemini/GEMINI.md` 或 `~/.gemini/AGENTS.md`；2.0 另讀 `~/.gemini/config/GEMINI.md`、`AGENTS.md` |
| 全域模組化規則 | `~/.claude/rules/*.md` | 無 | `~/.gemini/config/rules/*.md`（需 frontmatter） |
| 專案規則檔 | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` | 從 git root 到 cwd 每層的 `AGENTS.override.md` → `AGENTS.md` | 目錄層級的 `AGENTS.md` / `GEMINI.md` |
| 條件式規則 | `.claude/rules/*.md` + `paths:` | 無（用子資料夾 `AGENTS.md` 或 skills） | `.agents/rules/*.md` + `trigger: glob` / `model_decision` |
| 技能（專案） | `.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` | `.agents/skills/<name>/SKILL.md` |
| 技能（全域） | `~/.claude/skills/` | `~/.agents/skills/` 或 `$CODEX_HOME/skills/` | `~/.gemini/config/skills/`（2.0 與 IDE）、`~/.gemini/antigravity-cli/skills/`（CLI） |
| 手動流程 | skill 用 `/name` 呼叫（commands 已併入 skills） | skill 用 `$name` 呼叫（custom prompts 已棄用） | `.agents/workflows/*.md` 用 `/name`；**2026-11-01 起棄用，改用 skills** |
| 強制設定 | `settings.json` 的 `permissions` + `hooks` | `config.toml` 的 permissions profile、`rules/*.rules`、`hooks.json` | CLI `settings.json` 的 `permissions`、`hooks.json`；2.0 App 用 UI 設定 |
| 大小上限 | 建議每檔 < 200 行；超過 4 MiB 不載入 | `project_doc_max_bytes` 預設 32 KiB（合計） | 規則每檔 24,000 bytes；always_on + 全域合計 20,000 tokens；workflow 每檔 12,000 字元 |

## Claude Code

來源：
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/best-practices

文件網域已從 docs.claude.com 改為 code.claude.com。

**CLAUDE.md 載入**
- 順序（由廣到窄）：managed policy（Windows `C:\Program Files\ClaudeCode\CLAUDE.md`）→ `~/.claude/CLAUDE.md` → 專案 `./CLAUDE.md` 或 `./.claude/CLAUDE.md` → `./CLAUDE.local.md`。
- cwd 以上每層的 CLAUDE.md 啟動時載入；子資料夾的 CLAUDE.md 在讀到該資料夾檔案時才載入。
- 全部串接，不互相覆蓋；越靠近 cwd 越晚讀到。
- 建議每檔 200 行內；超過 4 MiB 的檔案直接略過。
- 區塊層級 HTML 註解 `<!-- -->` 會在注入前移除，可放給人看的註記，不花 token。

**@import**
- 語法 `@path/to/file`，相對路徑以「含 import 的檔案」為基準，可用 `~/`。
- 最多遞迴 4 層。
- 在 code span 或 code block 裡的 `@` 不會被解析。
- import 不省 context：被 import 的檔案啟動時就載入。
- 專案檔 import 到工作目錄外的檔案，第一次會跳出核准對話框；使用者層級（`~/.claude/`）的不會。

**.claude/rules/**
- 遞迴讀取所有 `.md`。
- 唯一有效的 frontmatter 是 `paths`（YAML list 或逗號分隔字串，支援 glob 與 `{a,b}` 展開）。
- 沒有 `paths` 的規則啟動時載入；有 `paths` 的在 Claude 讀到符合的檔案時才載入。
- 使用者層級 `~/.claude/rules/` 先於專案規則載入，兩者不互相覆蓋。

**AGENTS.md**
- v2.1.277 起原生讀取，預設只在沒有任何 `CLAUDE.md` / `CLAUDE.local.md` 時才讀。
- 兩者都要讀可以在 `CLAUDE.md` 寫 `@AGENTS.md`（官方推薦，Windows 不要用 symlink）。
- 不讀 `AGENTS.override.md`、`.agents/` 底下任何東西。
- 本機已更新到 2.1.286，會原生讀 AGENTS.md；專案仍保留 `CLAUDE.md` 的 `@AGENTS.md`，因為有 `CLAUDE.local.md` 時就不會原生讀。

**Skills**
- 位置：`~/.claude/skills/<name>/SKILL.md`、`.claude/skills/<name>/SKILL.md`。
- `.claude/commands/*.md` 已併入 skills，舊檔仍可用。
- 遵循 Agent Skills 開放標準；**不讀 `.agents/skills/`**。
- `description` + `when_to_use` 合計上限 1,536 字元。
- `disable-model-invocation: true`：只能手動 `/name` 呼叫（適合 workflow）。
- Claude 專屬欄位（`disable-model-invocation` 等）放在 SKILL.md 裡，其他工具會忽略或可能報錯（見「未確認」）。

**Subagents**
- `.claude/agents/*.md`、`~/.claude/agents/*.md`，必填 `name`、`description`；同名時專案優先。

**Permissions 與 Hooks**
- `settings.json` 位置與優先序（高到低）：managed → CLI `--settings` → `.claude/settings.local.json` → `.claude/settings.json` → `~/.claude/settings.json`。
- 規則格式：`Read(./.env)`、`Bash(npm run test *)`、`PowerShell(Remove-Item *)`；deny > ask > allow。
- 使用者設定裡 `Read(/secrets/**)` 的 `/` 錨定在 `~/.claude/`，要套用到所有專案得寫 `Read(.env)`（gitignore 式，任何深度）或 `//` 絕對路徑。
- Windows 路徑會正規化為 `/c/Users/...`。
- `Bash(...)` 規則比對指令文字，易被繞過（`sh -c`、變數），官方建議搭配 PreToolUse hook 或 sandbox。
- Hook：`PreToolUse` 等事件；`matcher` + `hooks[]`（`type: command`）。
- Hook 執行方式（2026-10-01 重查）：有 `args` 是 exec 形式，`command` 當執行檔直接啟動、不經 shell；沒有 `args` 是 shell 形式，macOS 用 `sh -c`、Windows 用 Git Bash（沒裝 Git Bash 時改用 PowerShell）。`shell` 欄位可指定 `"bash"` 或 `"powershell"`。**沒有** `commandWindows` 之類依系統切換的欄位。
- Hook 阻擋方式：exit code 2（stderr 當理由），或 stdout 輸出 `hookSpecificOutput.permissionDecision: "deny"`。
- stdin 有 `tool_name`、`tool_input.command`、`tool_input.file_path`。
- `deny` 與 `ask` 規則在專案未被信任前就生效；`allow` 要信任後才生效。

## Codex

來源（developers.openai.com/codex 已 308 轉址到 learn.chatgpt.com）：
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/config-file/config-basic
- https://learn.chatgpt.com/docs/config-file/config-reference.md
- https://learn.chatgpt.com/docs/permissions.md
- https://learn.chatgpt.com/docs/agent-configuration/rules.md
- https://learn.chatgpt.com/docs/hooks.md
- https://learn.chatgpt.com/docs/custom-prompts.md
- https://learn.chatgpt.com/docs/windows/windows-sandbox.md
- https://learn.chatgpt.com/docs/agent-configuration/subagents.md

**AGENTS.md**
- 全域：`~/.codex/AGENTS.override.md` 存在就用它，否則 `~/.codex/AGENTS.md`（`CODEX_HOME` 預設 `~/.codex`）。
- 專案：從 git root 往下到 cwd，每層依序找 `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`。
- 由 root 往下串接，越近越後面（越優先）；空檔略過。
- 上限 `project_doc_max_bytes` 預設 32 KiB，合計超過就停止加入後面的檔案。

**config.toml**
- 位置：`~/.codex/config.toml`；專案 `.codex/config.toml`（需信任專案才載入）。
- 優先序：CLI flag → 專案 config → profile → 使用者 config → 雲端預設 → 系統 → 內建。
- **profiles 現在是獨立檔案** `~/.codex/<name>.config.toml`，用 `--profile <name>` 選；文件已不提 `[profiles.<name>]`。
- `approval_policy`：`"on-request"`、`"never"` 或 `{ granular = {...} }`；`"untrusted"` 不支援，`"on-failure"` 已棄用。
- `sandbox_mode`：`"read-only"`、`"workspace-write"`、`"danger-full-access"`。
- 新的 permissions profile：`default_permissions = "<name>"` + `[permissions.<name>]`，可 `extends = ":workspace"`。
- 擋 `.env`：`[permissions.<name>.filesystem.":workspace_roots"]` 底下 `"**/*.env" = "deny"`（deny 同時擋讀寫）。
- permissions profile 與 `sandbox_mode` **互斥，只能擇一**；支援原生 Windows。
- Windows sandbox：`[windows] sandbox = "elevated"`（本機已設定）或 `"unelevated"`。

**Rules（execpolicy，實驗中）**
- `~/.codex/rules/*.rules`、`<repo>/.codex/rules/`（需信任），Starlark 語法。
- `prefix_rule(pattern=[...], decision="forbidden"|"prompt"|"allow", justification=..., match=[...], not_match=[...])`。
- 多條符合時取最嚴格；`codex execpolicy check --rules <file> -- <cmd>` 可測試。

**Hooks**
- `~/.codex/hooks.json`、`<repo>/.codex/hooks.json`，或 config.toml 裡的 `[hooks]`；預設啟用。
- 事件與 Claude Code 類似（`PreToolUse`、`PostToolUse`、`Stop`…），格式也幾乎相同（`matcher` + `hooks[]`）。
- 涵蓋 shell（`Bash`）、`apply_patch`（可用 `Edit`/`Write` 比對）、MCP。
- 阻擋：exit 2 或 `hookSpecificOutput.permissionDecision: "deny"`。
- 指令經 shell 執行，工作目錄是 session 的 `cwd`。
- `commandWindows`（TOML 寫 `command_windows`）是 Windows 專用的覆寫：`command` 給 macOS / Linux，`commandWindows` 給 Windows；全域與 repo 層級都可以用（2026-10-01 重查）。

**Skills**
- 專案：cwd、上層資料夾、repo root 的 `.agents/skills/`。
- 使用者：`$HOME/.agents/skills` 或 `$CODEX_HOME/skills`；管理員：`/etc/codex/skills`。
- 必填 `name`、`description`；skill 清單最多占 context 2%，太多時 description 會被截短，要把觸發詞放前面。
- 選填 `agents/openai.yaml`，`allow_implicit_invocation: false` 可設成只能手動呼叫。
- 手動呼叫：CLI / IDE 用 `$skill-name`。
- Custom prompts（`~/.codex/prompts`）已棄用，官方叫你改用 skills。

**Subagents**
- `~/.codex/agents/*.toml`、`.codex/agents/*.toml`，必填 `name`、`description`、`developer_instructions`。

## Antigravity

來源：
- https://antigravity.google/docs/rules
- https://antigravity.google/docs/ide/workflows
- https://antigravity.google/docs/skills
- https://antigravity.google/docs/permissions
- https://antigravity.google/docs/agent-settings
- https://antigravity.google/docs/sandbox
- https://antigravity.google/docs/hooks
- https://antigravity.google/docs/settings
- https://antigravity.google/docs/overview

產品已拆成三個：Antigravity 2.0（桌面 App）、Antigravity IDE（擴充套件）、Antigravity CLI（`agy`）。`/docs/rules-workflows` 已轉址到 `/docs/rules`。

**Rules**
- 全域：`~/.gemini/GEMINI.md`、`~/.gemini/AGENTS.md`、`~/.gemini/config/GEMINI.md`、`~/.gemini/config/AGENTS.md`、`~/.gemini/config/rules/*.md`。
- 工作區：`.agents/rules/*.md`；只掃第一層，子資料夾要在 `.agents/rules.json` 登記。舊版 `.agent/rules/` 已列為 legacy。
- frontmatter：`trigger: always_on | model_decision | glob | manual`；`description`（model_decision 必填）；`globs: "*.ts, *.tsx"`（glob 必填）。
- `manual` 要在對話中 `@` 提到才啟用；`model_decision` 只先注入路徑與 description。
- 大小：每檔 24,000 bytes（超過截斷）；全域 + always_on 合計 20,000 tokens。
- 優先序：目錄層級 > 工作區 > 全域，規則是累加的。`AGENTS.md` 與 `GEMINI.md` 視為同等。
- 引用檔案：`@[標籤](路徑)` 內嵌內容；`@檔名` 只是參照。

**Workflows**
- 工作區 `.agents/workflows/`（或 `.agent/workflows/`）；`/workflow-name` 呼叫；每檔 12,000 字元。
- 只在 IDE 可用，**2026-11-01 起棄用，改用 Agent Skills**；有 `/migrate-workflows` 可轉換。

**Skills**
- 工作區 `.agents/skills/<name>/`（`.agent/skills/` 相容）。
- 全域：`~/.gemini/config/skills/`（2.0 與 IDE）、`~/.gemini/antigravity-cli/skills/`（CLI）、`~/.gemini/antigravity/skills/`（舊版 IDE）。本機已有 `~/.gemini/config/skills/`。
- `description` 必填、`name` 選填（預設資料夾名）；可用 `/<skill-name>` 手動呼叫。

**Permissions / Sandbox / Hooks**
- CLI：`~/.gemini/antigravity-cli/settings.json` 的 `permissions.allow|deny|ask`，格式 `command(git)`、`command(regex:...)`、`read_file(.env)`、`write_file(.git/)`；Deny > Ask > Allow。
- 2.0 App：UI 設定（Settings > General > Permission/Agent Settings），Windows 有 Request Review / Proceed in Sandbox / Always Proceed 與 deny list。
- Terminal sandbox 新版只支援 macOS / Linux，Windows 沿用舊行為。
- Hooks：工作區 `.agents/hooks.json`、全域 `~/.gemini/config/hooks.json`。
- Hooks 格式和 Claude / Codex 不同：最外層是自訂名稱，例如 `{"my-hook": {"PreToolUse": [...]}}`。
- stdin 是 `toolCall.name` / `toolCall.args`；stdout 輸出 `{"decision":"deny","reason":"..."}` 就能阻擋。
- 工具名稱：`run_command`、`view_file`、`write_to_file`、`replace_file_content`。

## Windows 與 macOS

來源：
- https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_pwsh
- https://github.com/PowerShell/PowerShell/releases

- macOS 沒有 Windows PowerShell 5.1，只能用 PowerShell 7（`pwsh`）；官方提供 Homebrew、`.pkg` 與免安裝 `.tar.gz`。
- `pwsh -ExecutionPolicy` 只在 Windows 有作用，其他平台會忽略，所以 hook 參數兩個系統可以一樣。
- PowerShell 7 在 macOS 不接受 `\` 當路徑分隔；`/` 在兩個系統都可以。
- macOS 桌面 App 從 Dock 啟動時 PATH 只有系統路徑，常常找不到 Homebrew 裝的 `pwsh`（`/opt/homebrew/bin`）；所以全域設定寫完整路徑，sh 啟動片段也直接檢查 `/usr/local/bin/pwsh`、`/opt/homebrew/bin/pwsh`。
- 三個工具在 macOS 的設定資料夾和 Windows 相同：`~/.claude`、`~/.codex`、`~/.gemini`。
- 本機實測（macOS arm64、PowerShell 7.6.6）：build 結果和 Windows 版內容相同（只有 hook 相關檔案因這次修改而不同）；verify 與 38 個 hook 測試案例通過；install / new-project 裝到暫存資料夾後，用各工具的方式（exec、`sh -c`、`bash -c`）實際執行 hook，危險指令被擋、一般指令放行。

## 共通標準

- **AGENTS.md**（https://agents.md/）：純 Markdown、沒有必填欄位、最近的檔案優先；由 Linux Foundation 底下的 Agentic AI Foundation 維護。
- **Agent Skills**（https://agentskills.io/specification）：
  - `name` 1–64 字元，小寫英數與連字號，不能開頭結尾是 `-`、不能有 `--`，必須等於資料夾名。
  - `description` 1–1024 字元。
  - 選填 `license`、`compatibility`（≤500）、`metadata`、`allowed-tools`（實驗）。
  - SKILL.md 建議 < 500 行、< 5000 tokens；資料夾慣例 `scripts/`、`references/`、`assets/`。

**三工具能讀的共用格式**

| 格式 | Claude Code | Codex | Antigravity |
|---|---|---|---|
| 專案 `AGENTS.md` | 2.1.277+ 有條件讀；舊版要 `@AGENTS.md` | 原生 | 原生 |
| `.agents/skills/` | 不讀 | 讀 | 讀 |
| SKILL.md 標準欄位 | 讀 | 讀 | 讀 |

## 社群最佳實踐（只採用能和官方交叉驗證的）

- 全域檔要短，領域知識改用 skills 按需載入：Claude 官方 best-practices 與 memory 頁都這樣說。
- 文字規則只是建議，要強制就用 permissions / hooks：Claude memory 頁、Codex rules 頁、社群文章（smartscope.blog、MuhammadUsmanGM/claude-code-best-practices）一致。
- 同一問題糾正兩次就重開對話：Claude best-practices 頁。
- 用獨立子代理審查：Claude best-practices 頁的「adversarial review step」。

## 未確認

1. `~/.claude/rules/` 裡帶 `paths:` 的規則會不會照專案路徑條件載入：文件只說使用者規則「套用到每個專案」，沒說 paths 行為。**處理方式**：全域只放無條件規則，領域規範一律做成 skill。
2. Antigravity 全域 workflows 的路徑：官方文件沒寫；社群說法有 `~/.antigravity/`、`~/.gemini/antigravity/global_workflows/` 互相矛盾。**處理方式**：workflows 一律做成 skills（反正 11/1 就棄用）。
3. Antigravity 2.0 App、IDE、CLI 三者各讀哪個全域規則檔：文件列了四個位置但沒說哪個產品讀哪個。**處理方式**：安裝到 `~/.gemini/GEMINI.md`（使用者指定且文件列出），README 註明。
4. Antigravity hooks 在 Windows、macOS 用哪個 shell 執行、工作目錄在哪：文件沒寫，也沒有依系統切換的欄位。**處理方式**：指令開頭寫 `{{PS}}`，由 install.ps1 換成這台電腦的 PowerShell（Windows `powershell.exe`、macOS `pwsh` 完整路徑）。
5. ~~Codex 全域 hooks 能否用 `commandWindows`~~：2026-10-01 重查文件，全域與 repo 層級都可以。已改成 `command`（macOS）+ `commandWindows`（Windows）。
6. Claude Code 專屬的 SKILL.md 欄位（如 `disable-model-invocation`）放進 Codex / Antigravity 會不會報錯：Codex 與 Antigravity 文件沒提。**處理方式**：build 時依工具產生不同 frontmatter，各工具只拿到自己支援的欄位。
7. 自訂 skill 和 Claude Code 內建 skill 同名（例如 `/code-review`、`/review`）時誰優先：文件沒寫。**處理方式**：改名避開。
