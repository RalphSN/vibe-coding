# 研究筆記：與 AI 對話 × Prompt 工程 × Agent 實戰

> 查證日期：**2026-10-01**（以下所有「查證」皆指此日以 WebFetch / WebSearch 讀取的內容）
> 標記說明：✅ 官方文件直接確認 ・ 🟡 官方頁面經摘要工具讀取、細節未逐字核對 ・ ⚠️ 截至 2026-10 查證狀態：未確認

---

## 0. 對課程設計影響最大的 7 個發現

| # | 發現 | 影響哪個模組 |
|---|------|-------------|
| 1 | **Prefill 在目前的模型上已不再支援**：從 Claude 4.6 世代起，在最後一個 assistant turn 預填內容會回傳 400 錯誤。官方提供了遷移方式（改用結構化輸出、在 user 訊息裡下指令等）。 | 模組 3「prefill」要改教成「舊技巧＋現在的替代做法」 |
| 2 | **Extended thinking（`budget_tokens`）已被 adaptive thinking ＋ `effort` 參數取代**：4.6 上已棄用，4.7 以後的模型直接拒收（400）。Fable 5.1 / Opus 5.5 的思考是「永遠開啟、模型自行決定思考多少」。 | 模組 1「推理模式」改教 adaptive thinking ＋ effort |
| 3 | **明確的思考鏈（CoT）與 prompt chaining 的必要性降低**：官方說多數多步驟推理模型會在內部完成；只有需要檢查中間產出或強制固定流程時，chaining 才仍然有用。 | 模組 3 要說明「什麼時候還需要」 |
| 4 | **Claude Code v2.1.283 起，auto mode 是互動式終端機與 VS Code 的預設權限模式**：由另一個分類器模型（classifier）審查動作，取代逐一詢問使用者。 | 模組 7、10 |
| 5 | **Slash commands 已併入 skills**：`.claude/commands/` 仍可用，但官方建議改用 `.claude/skills/<name>/SKILL.md`。Skills 遵循開放標準 Agent Skills（agentskills.io）。 | 模組 4、7 |
| 6 | **Claude Code 現在會原生讀取 AGENTS.md**（v2.1.277+），Codex CLI 也使用 AGENTS.md → 跨工具共用指示檔已成為事實上的慣例。 | 模組 6 harness 比較 |
| 7 | **MCP 2026-07-28 規格是改版幅度最大的一次**：協定改為無狀態（stateless），並加入擴充機制（Tasks、MCP Apps、Skills over MCP）、對齊 OAuth/OIDC 的授權，以及正式的棄用政策。 | 模組 5 |

---

## 1. Anthropic 模型陣容 ✅

來源：https://platform.claude.com/docs/en/about-claude/models/overview（查證 2026-10-01）

| 模型 | API ID | 官方定位 | Context | 最大輸出 | 價格（輸入/輸出 每 MTok） | 思考模式 | 預設 effort |
|------|--------|----------|---------|----------|---------------------------|----------|-------------|
| Claude Fable 5.1 | `claude-fable-5-1` | 高難度推理與長時程 agent 工作 | 1M | 128K | $10 / $50 | Adaptive（永遠開啟） | high |
| Claude Opus 5.5 | `claude-opus-5-5` | 長時間執行的 agentic coding 與知識工作；**官方建議多數工作負載先用這個** | 1M | 128K | $4 / $20 | Adaptive（永遠開啟） | medium |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 速度與智慧的最佳平衡 | 1M | 128K | $2 / $10 | Adaptive | high |
| Claude Haiku 4.5 | `claude-haiku-4-5-20251001` | 最快、接近前沿的智慧 | 200K | 64K | $1 / $5 | Extended | 不支援 |

- 知識截止：Fable 5.1 / Opus 5.5 / Sonnet 5.5 可靠知識至 2026-06；Haiku 4.5 至 2025-02。
- Batch API 五折；prompt cache 讀取為基本輸入價的 10%（Fable 5.1 為 2.5%，Opus 5.5 為 5%）。
- 1M tokens ≈ 55.5 萬英文字（目前的 tokenizer，從 Opus 4.7 開始採用）。
- 仍可使用的舊模型：Fable 5、Opus 5、Opus 4.8、4.7、4.6、4.5、Sonnet 5、Sonnet 4.6。
- Haiku 4.5 退役日「不早於 2026-10-15」→ 課程中提到 Haiku 時要加註。
- ⚠️ **Claude Mythos 5.1 / Mythos 5**：出現在 prompting 文件的適用模型清單裡，但不在模型總覽的比較表中。取得方式與定位未確認，課程不列入陣容表。

## 2. Anthropic 官方 Prompt Engineering 建議 ✅

來源：
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview
- https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices（官方稱為「living reference」）

**通用原則**
- **清楚直接**：把 Claude 想成「聰明但剛到職、不知道你們規矩的新同事」。黃金法則：把 prompt 拿給一位不了解背景的同事看，他看不懂，Claude 也會看不懂。順序重要時用編號步驟。想要「超出基本」的成果，就要明確要求。
- **說明原因**：說「為什麼」比單純下禁令有效（官方範例：「輸出會給 TTS 念出來，所以不要用刪節號」勝過「NEVER use ellipses」）。Claude 能從原因推廣到類似情境。
- **範例（few-shot）**：3–5 個範例，要相關、多樣、結構化（用 `<example>` / `<examples>` 包起來）。也可以請 Claude 檢查範例的多樣性。
- **XML 標籤**：適合混合了指示、背景、範例、變數輸入的 prompt；標籤名稱要一致，有層級就用巢狀。
- **角色設定**：在 system prompt 寫一句角色就有差別。
- **長文件**（20K+ tokens）：**長資料放最上面、問題放最後**（官方測試品質最多提升 30%）；多份文件用 `<document>` ＋ `<source>` ＋ `<document_content>` 包裝；先請它引用相關段落再作答（ground in quotes）。

**輸出格式**
- 告訴它「要做什麼」，而不是「不要做什麼」（例如「用流暢的段落寫」勝過「不要用 markdown」）。
- prompt 本身的風格會影響輸出的風格。
- 最新模型預設更精簡，工具呼叫後可能不做總結；若需要就明確要求。

**Prefill（重要變更）**
- 「Starting with Claude 4.6 models … prefilled responses … on the last assistant turn are no longer supported」→ 會回傳 400。
- 官方的遷移對照：強制 JSON 格式 → 改用 structured outputs；跳過開場白 → 在指示中直接要求；繞過不必要的拒答 → 現在不需要；接續中斷的輸出 → 改放在 user turn；長對話中注入提醒 → 放進 user turn 或透過工具／compaction。

**工具使用**
- 「Can you suggest some changes」只會得到建議；要它真的動手，就說「Change this function…」。
- 可以用 `<default_to_action>` 或 `<do_not_act_before_instructions>` 調整它主動或保守的程度。
- 舊的「CRITICAL: You MUST…」寫法在新模型上會造成過度觸發，改用平常的語氣即可。
- 平行工具呼叫可以透過 prompt 調高或調低。

**思考**
- 4.6 以後與 Mythos Preview 使用 adaptive thinking（`thinking: {type: "adaptive"}`），以 `effort` 控制深度。
- 要壓低成本：降低 effort，或用 `max_tokens` 當硬上限。
- 可以引導思考，例如「拿到工具結果後先反思品質再決定下一步」。

**Agentic 系統**
- 長任務：第一個 context window 先建立框架（測試、init.sh），之後的視窗再依 todo 迭代；用 `tests.json`（結構化）＋ `progress.txt`（自由格式）＋ git 追蹤狀態。
- 重新開始 vs compaction：最新模型很擅長從檔案系統找回狀態，有時開新視窗比壓縮更好。
- 自主與安全：可逆的本地動作可以直接做；難以復原、影響共享系統、具破壞性的動作要先問（官方提供範本 prompt）。
- Subagent：新模型會主動委派，也可能過度使用 → 要明確寫出什麼時候該用、什麼時候不該用。
- 避免過度設計、避免只為通過測試而寫死數值、避免臆測沒打開過的程式碼（`<investigate_before_answering>`）。

## 3. Claude Code ✅

來源索引：https://code.claude.com/docs/llms.txt（查證 2026-10-01，約 300 頁英文文件，**另有繁體中文索引** https://code.claude.com/docs/_llms/zh-tw.md）

### 3.1 安裝與介面
來源：https://code.claude.com/docs/en/overview
- 原生安裝（建議，會自動更新）：
  - macOS / Linux / WSL：`curl -fsSL https://claude.ai/install.sh | bash`
  - Windows PowerShell：`irm https://claude.ai/install.ps1 | iex`
- Homebrew：`brew install --cask claude-code`（stable 頻道）／ `claude-code@latest`；WinGet：`winget install Anthropic.ClaudeCode`；也可用 apt / dnf / apk。
- 可用介面：終端機 CLI、VS Code（含 Cursor）、JetBrains、桌面 App、Web（claude.ai/code）、行動 App、Slack、GitHub Actions / GitLab CI。
- 安裝後執行 `claude --version` 確認。

### 3.2 Harness 的官方定義
來源：https://code.claude.com/docs/en/how-claude-code-works
- Agentic loop 有三個階段：**gather context → take action → verify results**，三者交錯進行，使用者隨時可以插話。
- 官方原文的意思：Claude Code 是包在模型外面、提供工具並管理模型所見 context 的那一層，這一層就叫 **agentic harness**。（模組 6 的核心定義）
- 內建工具五大類：檔案操作、搜尋、執行、網路、程式碼智慧（需要 LSP plugin）。
- 對話以 JSONL 存在 `~/.claude/projects/`；`--continue` / `--resume` 會續接原 session，`--fork-session` / `/branch` 會分支成新 session。
- Checkpoint：每次編輯前自動快照，按兩下 `Esc` 或執行 `/rewind` 可回溯。**只涵蓋 Claude 用檔案工具做的修改**，bash 或外部的變更不在內，不能取代 git。

### 3.3 CLAUDE.md 與記憶
來源：https://code.claude.com/docs/en/memory
- 位置（依載入順序）：managed policy → `~/.claude/CLAUDE.md`（使用者）→ `./CLAUDE.md` 或 `./.claude/CLAUDE.md`（專案）→ `./CLAUDE.local.md`（個人，記得加進 .gitignore）。
- 所有檔案是**串接**而不是覆寫；子目錄的 CLAUDE.md 在讀到該目錄的檔案時才載入。
- `@path` 匯入，最多 4 層；但匯入**不會節省 context**（啟動時一樣全部載入）。
- `.claude/rules/*.md` 可以用 `paths:` frontmatter 限定只在碰到特定檔案時載入。
- **建議每個 CLAUDE.md 少於 200 行**。指示要具體到可以驗證（「用 2 格縮排」而不是「把程式碼排好」）。
- CLAUDE.md 是以 user message 的形式送入，**不保證被遵守** → 一定要發生的事請用 hook。
- AGENTS.md：沒有 CLAUDE.md 時直接讀取 AGENTS.md；兩者都有時預設只讀 CLAUDE.md（可在 `/config` 調整）。
- Auto memory：存在 `~/.claude/projects/<project>/memory/`，`MEMORY.md` 每次載入前 200 行或 25KB，預設開啟，可用 `/memory` 切換。
- 相關指令：`/init`（產生 CLAUDE.md）、`/memory`、`/context`（看哪些內容佔用 context）、`/doctor prompt-audit`（v2.1.283+，稽核指示檔是否過時或互相矛盾）。

### 3.4 擴充功能的選用方式
來源：https://code.claude.com/docs/en/features-overview
| 功能 | 何時載入 | Context 成本 | 適合用在 |
|------|----------|--------------|----------|
| CLAUDE.md | 每次 session 開始 | 每個 request 都付 | 「永遠要做 X」的規則 |
| Output style | session 開始／切換時 | 每個 request 都付 | 語氣、長度、角色 |
| Skill | 開始時只載入描述，使用時才載入全文 | 低 | 可重複使用的流程、參考資料 |
| MCP | 開始時只載入工具名稱，schema 延後載入（tool search） | 低 | 連接外部服務 |
| Subagent | 被叫用時 | 與主 session 隔離 | 會讀大量檔案的調查、平行工作 |
| Hook | 事件觸發 | 0（除非有輸出） | 必須 100% 執行的事 |
| Plugin | — | — | 打包上面這些功能並分發 |

- 官方的「漸進式導入」順序：同一件事錯兩次 → 寫進 CLAUDE.md；同一個 prompt 打第三次 → 做成 skill；需要瀏覽器分頁裡的資料 → 接 MCP；側邊任務洗版 → 交給 subagent；每次都要做 → 寫成 hook；第二個 repo 也要用 → 包成 plugin。
- 「Put guardrails in hooks」：寫在 CLAUDE.md 的「不要改 .env」只是請求，PreToolUse hook 才是強制。

### 3.5 Skills（含 slash commands）
來源：https://code.claude.com/docs/en/skills
- 路徑：`~/.claude/skills/<name>/SKILL.md`（個人）、`.claude/skills/<name>/SKILL.md`（專案）、plugin 內的 `skills/`。
- Frontmatter：`name`、`description`、`disable-model-invocation`（只允許手動 `/name` 觸發）、`user-invocable`、`allowed-tools`、`context: fork`（在 subagent 中執行）、`paths`、`arguments`。
- 變數：`$ARGUMENTS`、`$0`、`${CLAUDE_SKILL_DIR}` 等；`` !`cmd` `` 可以在載入前先執行指令並注入結果。
- SKILL.md 建議少於 500 行，細節放在旁邊的參考檔（漸進式揭露）。
- 內建 skills：`/run`、`/verify`、`/debug`、`/code-review`、`/batch`、`/claude-api`、`/doctor`。
- 舊的 `.claude/commands/*.md` 仍然有效，但官方建議改用 skills。

### 3.6 Subagents
來源：https://code.claude.com/docs/en/sub-agents
- 內建：Explore（唯讀、略過 CLAUDE.md）、Plan（唯讀）、general-purpose。
- 自訂：`.claude/agents/*.md`，frontmatter 包含 `name`、`description`、`tools`、`model`、`permissionMode`、`skills`、`memory`、`isolation: worktree`、`maxTurns`、`effort` 等；用 `/agents` 管理。
- Fork：用 `/subtask` 建立，會繼承整段對話，並可重用 prompt cache。
- 預設上限：同時 20 個、巢狀 3 層。

### 3.7 Hooks
來源：https://code.claude.com/docs/en/hooks、https://code.claude.com/docs/en/hooks-guide
- 常用事件：`SessionStart`、`UserPromptSubmit`、`PreToolUse`（可阻擋）、`PostToolUse`、`Stop`（可阻擋，用來強制驗證）、`SubagentStop`、`PreCompact`、`Notification`、`SessionEnd`、`InstructionsLoaded`，另有約 20 個其他事件。
- 處理器類型：`command`、`http`、`mcp_tool`、`prompt`、`agent`（實驗性）。
- 設定位置：`~/.claude/settings.json`、`.claude/settings.json`、`.claude/settings.local.json`、managed、plugin。
- Exit code `2` = 阻擋；也可以回傳 JSON：`hookSpecificOutput.permissionDecision: "deny"`。

### 3.8 權限模式
來源：https://code.claude.com/docs/en/permission-modes
| 模式 | 不經詢問就能做的事 | 適用情境 |
|------|-------------------|----------|
| `default`（UI 顯示為 Manual） | 只有讀取 | 敏感工作 |
| `acceptEdits` | 讀取、編輯、常見檔案指令 | 一邊審查一邊迭代 |
| `plan` | 讀取（以及分類器核准的指令） | 先探索再動手 |
| `auto` | 全部，但有背景安全檢查 | 長任務、減少確認疲勞 |
| `dontAsk` | 只有預先核准的工具，其餘一律拒絕 | 鎖定的 CI |
| `bypassPermissions` | 全部 | **只限隔離的容器或 VM** |
- 用 `Shift+Tab` 切換，或用 `claude --permission-mode plan` 啟動。
- Deny 規則在**所有**模式下都有效（包括 bypass）。
- 規劃時按 `Ctrl+G` 可以在編輯器裡直接修改計畫。

### 3.9 Headless、平行作業、其他
- `claude -p "…"`，可加 `--output-format json|stream-json`、`--allowedTools`；用 `--permission-mode auto -p` 跑無人值守任務。來源：https://code.claude.com/docs/en/best-practices、https://code.claude.com/docs/en/headless
- Worktree：`claude --worktree <name>`（或 `-w`），建立在 `.claude/worktrees/<name>/`，分支名為 `worktree-<name>`；用 `.worktreeinclude` 複製 `.env` 等被 gitignore 的檔案；`claude --worktree "#1234"` 可以從 PR 開分支。來源：https://code.claude.com/docs/en/worktrees
- `/batch <指令>`：把變更拆給 5–30 個 subagent，各自在自己的 worktree 中執行。
- 2026 年新增功能（依官方 What's new 週報）：auto mode（W13）、CLI 的 computer use（W14）、ultraplan（W15）、xhigh effort（W16）、`/ultrareview`（現為 `/code-review ultra`，W17）、agent view／`claude agents`（W20）、artifacts（W25）、`claude mcp login`（W26）、跨 session 訊息（W32）、`/goal`、routines（雲端排程）、dynamic workflows、agent teams（實驗性）、`claude plugin eval`（W37）。來源：https://code.claude.com/docs/en/whats-new/index.md
- 官方最佳實務重點（https://code.claude.com/docs/en/best-practices）：
  - **給 Claude 一個能自我驗證的方法**（測試、建置、截圖），這是最重要的一點。
  - 探索 → 規劃 → 實作 → 提交；「如果你能用一句話描述這個 diff，就跳過規劃」。
  - 同一個問題糾正超過兩次 → 執行 `/clear`，帶著學到的東西重寫 prompt。
  - 讓 Claude 訪談你、寫出 SPEC.md，再開新 session 實作。
  - Writer／Reviewer 雙 session；用 subagent 做對抗式審查（但要求只回報影響正確性的缺口）。
  - 常見失敗模式：大雜燴 session、反覆糾正、過長的 CLAUDE.md、「信任後才驗證」的落差、無邊際的探索。

## 4. Claude Agent SDK ✅

來源：https://code.claude.com/docs/en/agent-sdk/overview
- 定位：「把 Claude Code 當函式庫用」，提供 Python 與 TypeScript 版本，跟 Claude Code 是同一套工具、agent loop 與 context 管理。
- 與其他選項的比較：

| 想做的事 | 用什麼 |
|----------|--------|
| 把 agent 嵌進自己的程式、自己營運 | Agent SDK |
| 在終端機互動開發 | Claude Code CLI |
| 直接呼叫 API、自己寫 tool loop | Client SDK（有 beta 版 tool runner） |
| 讓 Anthropic 託管 harness 與沙箱 | **Managed Agents** |

- 支援的能力：內建工具、hooks、subagents、MCP、權限、sessions、skills／commands／memory、plugins。
- 第三方產品不得提供 claude.ai 登入，要使用 API key。
- 其他語言可以用 `claude -p --output-format json` 當子程序呼叫。
- 🟡 套件名稱：從 GitHub repo 名稱（`claude-agent-sdk-python` / `claude-agent-sdk-typescript`）推斷，安裝指令要在寫課程時再對照 quickstart 逐字確認。

## 5. 其他 CLI Agent

### 5.1 OpenAI Codex CLI 🟡
來源：https://developers.openai.com/codex/cli（308 轉址到 https://learn.chatgpt.com/docs/codex/cli）、https://developers.openai.com/codex/agent-approvals-security、https://developers.openai.com/codex/concepts/sandboxing
- 安裝：`curl -fsSL https://chatgpt.com/codex/install.sh | sh`（macOS / Linux）；Windows 用 npm 或 Homebrew。
- 指示檔：**AGENTS.md**（用 `/init` 產生）；設定檔：`config.toml`。
- 兩個獨立的軸：**sandbox mode**（技術上能做什麼：`read-only` / `workspace-write` / `danger-full-access`）× **approval policy**（何時要問人，例如 `on-request`、`untrusted`、`never`）。
- 常見組合：`--sandbox workspace-write --ask-for-approval on-request`。
- 支援 MCP（`codex mcp`）、skills、plugins、hooks；非互動模式用 `codex exec`。
- ⚠️ 預設模型：官方頁面經摘要顯示為「gpt-6.1-sol medium」，未交叉驗證 → **課程中不寫具體模型名稱**。
- ⚠️ `auto_review` approval policy 只出現在第三方文章。

### 5.2 Google Gemini CLI 🟡
來源：https://geminicli.com/docs/、https://geminicli.com/docs/reference/configuration/
- 安裝：`npm install -g @google/gemini-cli`；用 Google 帳號登入。
- 指示檔：**GEMINI.md**（往上層目錄搜尋，直到 `.git`；可透過 `context.fileName` 改名）。
- Approval mode：`default` / `auto_edit` / `plan` / `yolo`，使用 `--approval-mode=<值>`；`--yolo` 只能從命令列啟用。
- 沙箱：`tools.sandbox`（docker / podman / lxc / windows-native）、`GEMINI_SANDBOX`。
- 設定檔：`~/.gemini/settings.json`、`.gemini/settings.json`。
- 有 extensions、MCP、agent skills、subagents、policy engine、headless mode。
- ⚠️ 目前版本號、預設模型、headless 的確切 flag（是否為 `-p`）都未在官方頁面確認。

### 5.3 其他工具 ⚠️
- 只有第三方比較文章（例如 https://morphllm.com/comparisons/claude-code-alternatives ）提到：GitHub Copilot（CLI）、Cursor、OpenCode、Aider、Cline。
- 未逐一查證官方文件 → 課程中只以「IDE 型 agent／開源、可換模型的 CLI」等類別介紹，**不寫指令細節**。
- 第三方提供的 benchmark 數字（SWE-bench 等）也一律不採用。

## 6. MCP（Model Context Protocol）✅

來源：https://blog.modelcontextprotocol.io/posts/2026-07-28/、https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/
- 最新規格 **2026-07-28**（RC 為 2026-05-21，前一版為 2025-11）。
- 主要變更：
  - 核心改為**無狀態**，能用一般的 HTTP 基礎設施擴展。
  - 新增擴充：**Tasks**（長時間執行的操作）、**MCP Apps**（由伺服器渲染的 UI）、Skills over MCP。
  - 授權對齊 OAuth / OIDC。
  - 正式的功能生命週期：Active → Deprecated → Removed，後兩階段之間至少 12 個月。
- 核心原語：tools、resources、prompts。
- Claude Code 的相關指令：`claude mcp add --transport http <name> <url>`、`claude mcp login`、`/mcp`；MCP 工具 schema 預設延後載入（tool search）。
- 安全：Anthropic 會審核目錄中的 connector，但**不會**對 MCP server 做資安稽核 → 只使用自己寫的或信任的來源。

## 7. Context Engineering 與 Agent 設計 ✅

- **Effective context engineering for AI agents**（Anthropic Engineering，2025-09-29）：https://anthropic.com/engineering/effective-context-engineering-for-ai-agents
  - Context 是有限資源，會發生「context rot」：token 越多，準確度越下降，就像注意力預算被耗盡。
  - 目標：找出「最小、但訊號最強的一組 token」。
  - System prompt 要寫在「適當的高度」：不要寫死 if-else，也不要空泛。
  - 工具要彼此不重疊、用途明確、回傳精簡。
  - 範例要挑少量有代表性的，而不是列一長串邊界案例。
  - **Just-in-time 檢索**：先保留路徑或連結這類輕量識別，需要時再讀取。
  - 長時程任務的三種技巧：compaction、結構化筆記、subagent 架構。
- **Building effective agents**（Anthropic）：https://www.anthropic.com/research/building-effective-agents
  - Workflow（流程由程式碼預先定義）vs Agent（由 LLM 自行決定流程與工具使用）。
  - 先找最簡單的解法；agent 是用延遲與成本換表現，**任務每次都是同樣步驟時不要用 agent**。
  - 建議先直接用 API，少用厚重的框架。
- Claude Code 文件中的 context 管理：`/clear`、`/compact <焦點>`、`/rewind` 的部分摘要、`/btw`（不會進入對話歷史的側問）、subagent 隔離、在 CLAUDE.md 寫「Compact Instructions」。

## 8. 安全 ✅

- **OWASP Top 10 for LLM Applications 2025**（v2.0）：LLM01 Prompt Injection（連續兩版第一名）、LLM02 敏感資訊揭露、LLM05 不當的輸出處理、**LLM06 過度授權（Excessive Agency，因 agent 普及而擴充）**、LLM07 System Prompt 外洩（新增）等。🟡 來源為二手整理（例如 https://www.confident-ai.com/blog/owasp-top-10-2025-for-llm-applications-risks-and-mitigation-techniques ），寫課程前要再對照 genai.owasp.org 原文。
- Prompt injection 分兩種：**直接**（使用者輸入本身）與**間接**（藏在網頁、檔案、issue、MCP 回傳內容裡）。
- Claude Code 的防護（https://code.claude.com/docs/en/security）：
  - 權限系統、`curl` / `wget` 不會自動核准、web fetch 在獨立的 context 中執行。
  - 第一次開啟 codebase 和新的 MCP server 需要信任確認（**`-p` 模式會跳過**）。
  - 指令注入偵測、fail-closed（不符合規則一律拒絕）。
  - 憑證存放在 Keychain。
  - 沙箱（`/sandbox`）提供檔案系統與網路隔離。
  - 官方對不可信內容的建議：審查指令、不要直接把不可信內容 pipe 進去、核對關鍵檔案、用 VM 執行。
- 官方的「自主 vs 安全」範本 prompt（見第 2 節）可直接作為課程教材。

---

## 9. 寫課程時的處理原則

1. **模型名稱只用第 1 節表格裡的**；Haiku 4.5 要加註退役時間。
2. Prefill、extended thinking、明確 CoT 都以「舊做法 → 現在的做法」的對照來教，教的是概念，不教已失效的參數。
3. Codex / Gemini 只寫有 ✅ 或 🟡 標記的指令；🟡 項目在課程中加註「依官方文件摘要，請以官方最新版為準」。
4. 每一課的頁尾附上本筆記中對應的來源 URL 與「查證於 2026-10-01」。

---

## 10. 補充查證（2026-10-02）

| 項目 | 結果 | 來源 |
|------|------|------|
| Agent SDK 套件 | ✅ TypeScript：`npm install @anthropic-ai/claude-agent-sdk`；Python：`pip install claude-agent-sdk` 或 `uv add claude-agent-sdk`；需要 `ANTHROPIC_API_KEY`；SDK 內含 Claude Code 執行檔 | https://code.claude.com/docs/en/agent-sdk/quickstart |
| Agent SDK 最小範例 | ✅ `query({ prompt, options: { allowedTools: ["Read","Edit","Glob"], permissionMode: "acceptEdits" } })`，用 `for await` 逐則讀取訊息，最後一則是 `type === "result"` | 同上 |
| OWASP | ✅ 官方頁面確認 LLM01–LLM10:2025 名稱與第 8 節相同；另有 Agentic Security Initiative，但頁面沒有列出 Agentic Top 10 的條目 → 課程不引用 | https://genai.owasp.org/llm-top-10/ |
| Gemini CLI 啟動 | ✅ 執行檔是 `gemini`；也可用 `brew install gemini-cli` 安裝 | https://geminicli.com/docs/get-started/installation/ |
| Gemini CLI headless | ✅ `-p` / `--prompt` 觸發 headless 模式（非 TTY 環境也會）；`--output-format` 可選 JSON 或串流 JSONL | https://geminicli.com/docs/cli/headless/ |
| 語法高亮 | ✅ 使用 cdnjs 的 highlight.js 11.11.2（HTTP 200，附 SRI）。cdnjs 上 Prism 的最新版號顯示為 9000.0.1，版號異常，不採用 | https://api.cdnjs.com/libraries/highlight.js |

第 5.2 節的 Gemini「headless 確切 flag ⚠️」已解除。
