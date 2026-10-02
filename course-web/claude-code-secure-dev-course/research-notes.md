# 研究筆記：用 Claude Code CLI ／ Claude Cowork 進行安全的軟體開發

> 今天日期：**2026-10-02**。以下「查證」皆指 2026-10-02 用 WebFetch／WebSearch 讀取官方頁面（另有註明者除外）。
> 標記：✅ 官方文件直接確認 ・ 🟡 摘要或間接 ・ ⚠️ 截至 2026-10 查證狀態：未確認 ・ 「僅第三方來源」另註
> 沿用：參考站 `ai-chat-prompt-agent-course/research-notes.md`（查證 2026-10-01）的第 3、8 節（Claude Code 基礎、OWASP LLM）。本檔只列這門課會用到的事實。

---

## 0. 對課程設計影響最大的 8 個發現

| # | 發現 | 影響 |
|---|------|------|
| 1 | 2026-10-01 npm 上 Claude Code 最新版為 **2.1.287**（本機 2.1.286）。**v2.1.283 起 auto mode 是互動式終端機與 VS Code 的預設權限模式**。 | 模組 1、4 |
| 2 | **權限規則由 Claude Code 強制，不是由模型**：寫在 CLAUDE.md 的「不要讀 .env」只是請求；`permissions.deny` 或 PreToolUse hook 才是強制。 | 模組 1、3、4 的主軸 |
| 3 | **Sandbox 只包住 shell 指令**：Read／Edit／WebFetch、hooks、本機 MCP server 都在 sandbox 外；原生 Windows 沒有 sandbox，要用 WSL2。 | 模組 4 |
| 4 | **`claude -p` 與 SDK 不顯示 workspace trust 對話框**：repo 裡的 hooks、`.mcp.json` server 會直接執行／連線。官方建議對不信任的 repo 用 `--setting-sources user`、`--bare`。 | 模組 5、7 |
| 5 | 官方把安全審查分成 **5 層**：security-guidance plugin（寫的當下）→ `/security-review`（分支單次）→ Claude Security plugin（深度掃描）→ Code Review（PR）→ CI 既有掃描器。 | 模組 5 |
| 6 | **Cowork 2026-10-06 起新任務預設在雲端執行**，「Only on your computer」選項移除；2026-09-16 Cowork 與 chat 合併成同一個 Claude。 | 模組 2（時效性高，要加註） |
| 7 | **OWASP Top 10:2025** 新增 A03 Software Supply Chain Failures、A10 Mishandling of Exceptional Conditions。 | 模組 5 |
| 8 | `/cost` 已是 `/usage` 的別名；`/usage` 顯示 prompt cache 命中率（v2.1.251+）。官方企業平均成本約每人每活躍日 $13。 | 模組 6 |

---

## 1. Claude Code 基礎（沿用 + 補查）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 安裝：macOS/Linux/WSL `curl -fsSL https://claude.ai/install.sh \| bash`；Windows PowerShell `irm https://claude.ai/install.ps1 \| iex`；`claude --version` 確認 | https://code.claude.com/docs/en/overview（參考站 2026-10-01） | ✅ |
| Agentic loop：gather context → take action → verify results | https://code.claude.com/docs/en/how-claude-code-works（參考站） | ✅ |
| Checkpoint：每次檔案工具編輯前快照，`Esc Esc` 或 `/rewind`；**bash 的變更不在內，不能取代 git** | 同上 | ✅ |
| CLAUDE.md 位置與串接；建議 < 200 行；以 user message 送入、不保證遵守 | https://code.claude.com/docs/en/memory（參考站） | ✅ |
| `.claude/rules/*.md` 可用 `paths:` 限定載入 | 同上 | ✅ |
| 最佳實務：給 Claude 能自我驗證的方法；探索→規劃→實作→提交；糾正超過兩次就 `/clear` | https://code.claude.com/docs/en/best-practices（參考站） | ✅ |
| `/plan [description]` 直接進 plan mode；`Shift+Tab` 切換模式；`Ctrl+G` 編輯計畫 | https://code.claude.com/docs/en/commands.md、permission-modes | ✅ |
| 內建 skills：`/run`、`/verify`（建置並實際執行 app 觀察結果）、`/debug`、`/code-review`、`/simplify`、`/batch`、`/doctor` | https://code.claude.com/docs/en/commands.md | ✅ |
| 最新版本 2.1.287（npm `time.modified` 2026-10-01T17:59Z） | `npm view @anthropic-ai/claude-code version` | ✅ |

## 2. 權限模式與規則 ✅

來源：https://code.claude.com/docs/en/permission-modes.md、https://code.claude.com/docs/en/permissions.md

| 模式 | 不經詢問就能做 | 適用 |
|------|---------------|------|
| `default`（UI 名稱 Manual，可寫 `manual`，v2.1.200+） | 只有讀取 | 敏感工作 |
| `acceptEdits` | 讀取、檔案編輯、`mkdir`/`touch`/`mv`/`cp` 等 | 邊審邊改 |
| `plan` | 讀取（＋分類器核准的指令） | 動手前探索 |
| `auto` | 全部，背景分類器審查 | 長任務、減少確認疲勞 |
| `dontAsk` | 只有預先核准的工具，其他一律拒絕 | 鎖定的 CI |
| `bypassPermissions` | 全部 | 只限隔離的容器或 VM |

- 規則評估順序：**deny → ask → allow**，第一個符合者決定；「allow 不能在 deny 裡挖例外」。
- 任一層級 deny，其他層級都無法 allow（managed > CLI > local > project > user 的優先順序之外，deny 永遠先評估）。
- Deny 規則在**所有**模式都有效，含 bypass。
- Bash 規則語法：`Bash(npm run *)`；`Bash(ls *)` 不匹配 `lsof`、`Bash(ls*)` 會；`&&`、`;`、`|` 會拆成子指令逐一比對。
- Read/Edit 規則用 gitignore 語法：`Read(./.env)`、`Read(./secrets/**)`；`//path` 是絕對路徑、`/path` 相對於設定檔來源。`.claudeignore` 沒有作用。
- **Read deny 只管 Claude 的檔案工具與認得的 bash 讀檔指令**（cat、head…），管不到 `python script.py` 這類子程序自己開檔 → 要 OS 層級就開 sandbox。
- WebFetch 規則：`WebFetch(domain:example.com)`。
- MCP 規則：`mcp__puppeteer__*`；`"mcp__*"` 這種沒錨定 server 的 allow 會被略過並警告。
- 專案 `.claude/settings.json` 的 `permissions.allow` 要接受 workspace trust 後才生效；deny、ask 不受影響。
- `disableBypassPermissionsMode` 可放在 managed settings 禁止 bypass。
- auto mode 分類器**預設擋下**：`curl | bash` 下載執行、送敏感資料到外部、正式環境部署與 migration、force push、`git reset --hard`／`git clean -fd`、`terraform destroy`、印出 live credential、繞過內部套件 registry、`--insecure` 這類解除防護的 flag、合併沒人核准的 PR、註解掉保護安全行為的測試（v2.1.200+）。
- 對話中說「不要 push」會被分類器當成阻擋訊號，但 compaction 可能丟掉那則訊息 → 要硬保證就寫 deny 規則。
- Protected paths（`.claude/`、`.git/`、`.mcp.json`、shell 設定檔等）：除了 bypass 之外**不會被自動核准**，allow 規則也不行。

## 3. Sandbox ✅

來源：https://code.claude.com/docs/en/sandboxing.md

- 預設關閉；`/sandbox` 或 `"sandbox": { "enabled": true }` 開啟。
- 平台：macOS 用 Seatbelt；Linux／WSL2 用 bubblewrap ＋ socat；**原生 Windows 不 sandbox**。
- 預設：寫入只限工作目錄＋暫存目錄；**讀取幾乎整台電腦（含 `~/.ssh`）**；網路經本機 proxy，allowedDomains 預設為空。
- 設定鍵：`sandbox.filesystem.allowWrite`／`denyWrite`／`denyRead`／`allowRead`、`sandbox.network.allowedDomains`／`deniedDomains`、`sandbox.excludedCommands`、`sandbox.credentials.files`／`envVars`（mode `deny`）、`allowUnsandboxedCommands: false`（strict sandbox mode）、`failIfUnavailable`。
- Sandbox 外的東西：Read/Edit/Write/WebFetch/WebSearch 工具、hooks、本機 MCP server、LSP、status line 指令、使用者 `!` 輸入的指令（多數情況）。
- 限制：proxy 不檢查 TLS 內容；開放 `github.com` 這類大網域可能被用來外洩資料（domain fronting）；允許 `/var/run/docker.sock` 等於給主機權限。
- Auto-allow 模式下 sandbox 內指令不需確認，但 deny 規則、critical path 的 `rm`、內容型 ask 規則（如 `Bash(git push *)`）仍生效。
- 底層套件：`@anthropic-ai/sandbox-runtime`（開源）。

## 4. Hooks ✅

來源：https://code.claude.com/docs/en/hooks-guide.md、https://code.claude.com/docs/en/costs.md

- 官方範例 `protect-files.sh`：讀 stdin JSON、取 `.tool_input.file_path`，符合 `.env`、`package-lock.json`、`.git/` 就 `exit 2` 擋下，訊息寫到 stderr 回饋給 Claude。註冊在 `PreToolUse`，matcher `Edit|Write`。
- `exit 2` = 阻擋；也可回傳 JSON `hookSpecificOutput.permissionDecision: "deny"`。
- 官方成本範例：PreToolUse hook 把 `npm test` 改寫成只輸出失敗行（`updatedInput`），把上萬 token 的 log 降到數百。
- Hooks 以使用者完整權限執行，不在 sandbox 內。
- `ConfigChange` hook 可稽核或阻擋 session 中的設定變更。

## 5. 安全審查工具 ✅

| 層 | 工具 | 重點 | 來源 |
|----|------|------|------|
| 寫的當下 | security-guidance plugin | `/plugin install security-guidance@claude-plugins-official`；三層：每次編輯的樣式比對（`eval(`、`pickle`、`.innerHTML =`、`.github/workflows/`，不呼叫模型）、每回合結束的背景模型審查（最多 30 個檔案）、Claude 執行 `git commit`／`push` 時的 agentic 審查（每小時最多 20 次）；**不會阻擋寫入**；可用 `.claude/claude-security-guidance.md`、`.claude/security-patterns.yaml` 加規則；需 Python 3.7+ 與 git | https://code.claude.com/docs/en/security-guidance.md |
| 分支單次 | `/security-review` | 分析目前分支相對 origin 預設分支的 diff；需要 `origin` remote | https://code.claude.com/docs/en/commands.md |
| 深度掃描 | Claude Security plugin | `/plugin install claude-security@claude-plugins-official`，指令 `/claude-security`；多 agent 建威脅模型、獨立驗證；結果寫進 `CLAUDE-SECURITY-<timestamp>/`（md、jsonl、SARIF 2.1.0、CWE 分類）；patch 放 `patches/F<n>.patch`，**不會自動套用**，用 `git apply`；需 Python 3.9+；掃描結果非決定性 | https://code.claude.com/docs/en/claude-security.md |
| PR | Code Review（研究預覽，Team／Enterprise） | 多 agent、嚴重度 🔴 Important／🟡 Nit／🟣 Pre-existing；check run 永遠 neutral 不擋合併；平均每次 $15–25；`REVIEW.md` 調整；`@claude review` 手動觸發 | https://code.claude.com/docs/en/code-review.md |
| 本機 diff | `/code-review [low…max\|ultra] [--fix] [--comment]` | 背景 subagent；`--fix` 的修改不在 checkpoint 內，要用 git 還原 | 同上 |
| CI | 既有靜態分析與相依套件掃描 | 官方明說 plugin 不取代 | security-guidance.md |

## 6. 安全模型與 prompt injection ✅

來源：https://code.claude.com/docs/en/security

- 內建防護：權限系統、`curl`／`wget` 不自動核准、WebFetch 由另一次模型呼叫摘要頁面、workspace trust 對話框、指令注入偵測（分析不了的指令會詢問）、fail-closed、憑證存 macOS Keychain（Linux 0600 檔案）。
- 官方對不可信內容的建議：核准前審查指令；不要把不可信內容直接 pipe 給 Claude；核對關鍵檔案的修改；用 VM 執行腳本與工具呼叫；可疑行為用 `/feedback` 回報。
- Windows WebDAV 警告：不要讓 Claude Code 存取 `\\*` 這類路徑。
- MCP：Anthropic 審核目錄中的 connector，但**不做 MCP server 的資安稽核**；只用自己寫的或信任的來源。
- 雲端 session：隔離 VM、預設限制網路、GitHub 憑證不進 VM、proxy 拒絕刪分支與推 tag、稽核日誌。
- `-p` 模式下，repo 的 hooks、`env` 區塊、`.mcp.json` server 會直接使用（表格見 permissions.md「What runs before you trust a folder」）；防護：`--setting-sources user`、`--bare`、`--settings '{"disableAllHooks": true}'`、`disabledMcpjsonServers`。

## 7. Dev container ✅

來源：https://code.claude.com/docs/en/devcontainer.md

- Feature：`"ghcr.io/anthropics/devcontainer-features/claude-code:1.0": {}`。
- 參考容器含 `init-firewall.sh`（需 `NET_ADMIN`、`NET_RAW`）限制對外連線。
- 容器內可用 `--dangerously-skip-permissions`（非 root）；**仍可能外洩容器內一切，包含 `~/.claude` 憑證**；不要掛載主機 `~/.ssh`。
- 不想關掉安全檢查又想少確認 → 官方建議改用 auto mode。

## 8. 成本與效能 ✅

來源：https://code.claude.com/docs/en/costs.md、https://code.claude.com/docs/en/fast-mode.md

- 企業部署平均約 **$13／人／活躍日**、$150–250／人／月；90% 使用者每活躍日 < $30。
- `/usage`（`/cost`、`/stats` 為別名）：session 成本估算、prompt cache 命中率與 miss 原因（v2.1.251+／v2.1.260+）。
- `/context`：用色塊格顯示 context 佔用。`/insights`：分析最近 session，產生 HTML 報告。
- 降成本：任務之間 `/clear`；`/compact <焦點>`；CLAUDE.md < 200 行，專門流程搬到 skill；用 CLI（`gh`）比 MCP 省 context；關掉不用的 MCP；用 hook 預先過濾 log；冗長操作交給 subagent；寫具體 prompt；plan mode 先規劃。
- 長 session 用量上升原因：每次請求都帶完整對話；離開超過 cache 存活時間（訂閱 1 小時、API 預設 5 分鐘）後第一則訊息 cache miss；排程任務、subagent、agent teams（plan mode 下約 7 倍 token）。
- `/compact` 本身是大請求；只想重新開始時 `/clear` 不花錢。
- Fast mode：同一個 Opus、最多快 2.5 倍、價格較高（Opus 5.5 為 $8／$40 每 MTok）；`/fast` 切換；訂閱方案只能用 usage credits；**對話中途才開會以 fast 價格重算整段 context**，所以要在開頭開。
- Effort：`/effort low…xhigh|max|auto`；降低 effort 會較快但複雜任務品質可能下降。
- 模型價格（每 MTok 輸入／輸出）：Opus 5.5 $4／$20、Sonnet 5.5 $2／$10、Haiku 4.5 $1／$5（參考站 2026-10-01，https://platform.claude.com/docs/en/about-claude/models/overview）。Haiku 4.5 退役「不早於 2026-10-15」。

### 8.1 Web 效能指標 ✅

來源：https://web.dev/articles/vitals
- Core Web Vitals：LCP ≤ 2.5 秒、INP ≤ 200 毫秒、CLS ≤ 0.1，以 75 百分位、手機與桌機分開計算。INP 於 2024 年取代 FID。

## 9. Claude Cowork

| 事實 | 來源 | 可信度 |
|------|------|--------|
| Cowork 把 Claude Code 的 agentic 架構用在一般知識工作（文件、試算表、簡報、整理檔案），不需要終端機 | https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork | 🟡 |
| 方案：Pro、Max、Team、Enterprise（付費方案）；桌面 App（macOS/Windows）、Web、行動 App | 同上 | 🟡 |
| **2026-10-06 起新 Cowork 任務在雲端執行，「Only on your computer」選項移除** | 同上 | 🟡 |
| 2026-09-16：Cowork 與 chat 合併，在任何對話都能用 Cowork 能力 | WebSearch 摘要（Releasebot、claude.com changelog） | 🟡 |
| 權限模式：Manual（每步確認）／Auto（自動審查，擋下不安全動作）／Skip（不檢查，但刪除保護仍在） | 同上；https://support.claude.com/en/articles/13364135-use-claude-cowork-safely | 🟡 |
| 刪除保護：永久刪檔一定要使用者按 Allow | use-claude-cowork-safely | 🟡 |
| 架構：雲端 session 在 Anthropic 伺服器的臨時沙箱，結束即銷毀；對外流量經強制 proxy、只能到允許的目的地；不能連私有、內部、cloud metadata 位址；connector token 不進沙箱；本機 session 的程式執行在 VM（macOS Apple Virtualization、Windows Hyper-V） | https://support.claude.com/en/articles/14479288-claude-cowork-architecture-overview | 🟡 |
| 本機檔案只能透過 Claude Desktop 存取使用者明確連接的資料夾 | 同上 | 🟡 |
| 安全建議：建立專用工作資料夾；不要排程會碰敏感檔案、代發訊息、購物的任務；從低風險任務開始建立信任；只讓它上信任的網站；「computer use 在 Claude 與螢幕之間沒有 sandbox」；本機 MCP server 以完整電腦權限執行 | use-claude-cowork-safely | 🟡 |
| 不適合：財務／醫療入口、自動購買、處理憑證或 token、無人監看的大量個人 email | 同上 | 🟡 |
| 排程任務：`/schedule`，2026-09 起可在伺服器端執行、不需裝置在線 | get-started | 🟡 |
| Settings > Cowork 可設全域指示；選資料夾時可加資料夾指示 | get-started | 🟡 |
| Desktop changelog：檔案路徑過濾，SSH 金鑰、AWS／GCP 憑證、shell profile 不給 agent 存取；管理員可用 `allowedWorkspaceFolders`、`blockReadsOutsideWorkingDirectories` 限制 | https://claude.com/docs/cowork/changelog（v2.19675.0，2026-10-01） | 🟡 |
| Team／Enterprise 的用量額度由 chat、Claude Code、Cowork 共用 | costs.md | ✅ |
| ⚠️ Cowork 的指令語法、設定鍵名稱在不同 changelog 版本間有變動，課程只教概念與 UI 名稱，不寫設定鍵 | — | ⚠️ |

## 10. 供應鏈與 AI 生成程式碼的風險

| 事實 | 來源 | 可信度 |
|------|------|--------|
| OWASP Top 10:2025：A01 Broken Access Control、A02 Security Misconfiguration、A03 Software Supply Chain Failures、A04 Cryptographic Failures、A05 Injection、A06 Insecure Design、A07 Authentication Failures、A08 Software or Data Integrity Failures、A09 Security Logging and Alerting Failures、A10 Mishandling of Exceptional Conditions | https://top10.owasp.org/2025 | ✅ |
| OWASP LLM Top 10:2025：LLM01 Prompt Injection、LLM02 Sensitive Information Disclosure、LLM06 Excessive Agency 等 | https://genai.owasp.org/llm-top-10/（參考站 2026-10-02） | ✅ |
| Slopsquatting：USENIX Security 2025 研究，16 個模型產生 223 萬份程式碼樣本，19.7% 含至少一個不存在的套件名；共 205,474 個不重複的假名稱；商用模型平均 5.2%、開源模型 21.7% | WebSearch 摘要（CSA research note 2026-04-19、多篇轉述） | 🟡 僅第三方轉述，原論文未逐字核對 |
| Shai-Hulud：2025-09-15 揭露的 npm 自我複製蠕蟲，透過 postinstall 腳本竊取 npm token、GitHub PAT、雲端憑證並自動發布被污染版本；影響 500+ 套件 | Wiz、ReversingLabs、SecurityWeek（第三方資安廠商） | 🟡 僅第三方來源 |
| 官方 auto mode 預設擋「把套件安裝繞過內部 registry 改用公開 registry」 | permission-modes.md | ✅ |

## 11. Headless、CI 與團隊治理 ✅

來源：https://code.claude.com/docs/en/github-actions.md、security、costs

- `/install-github-app` 快速設定；action：`anthropics/claude-code-action@v1`；secret `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`）。
- 觸發者檢查：issue／PR 事件需要寫入權限；預設拒絕 bot（`allowed_bots`）。公開 repo 的 fork PR 拿不到 secrets。
- 官方建議：不要把金鑰 commit 進 repo；只給 workflow 需要的權限；`--max-turns` 限制回合；workflow timeout；concurrency 控制。
- 可用 workload identity federation（OIDC）避免長期 secret。
- 團隊：managed settings 強制政策；權限設定進版控共享；OpenTelemetry 監控；`ConfigChange` hook 稽核；`/permissions` 定期檢查。
- Claude Code 漏洞回報：HackerOne，不要公開揭露。

---

## 12. 寫課程時的處理原則

1. 版本相關的敘述寫「截至 2026-10（v2.1.287）」；Cowork 的雲端預設改變（10-06）寫成時效提醒。
2. Cowork 只有 🟡 來源，課程內加註「依官方說明中心摘要，以官方最新版為準」，不寫設定鍵。
3. Slopsquatting 數據與 Shai-Hulud 標「第三方資安研究」，只用來說明風險類型，不拿來比較模型。
4. 每課頁尾列對應來源 URL 與「查證於 2026-10-02」。
5. 下次重新查證：**2027-01-02**（AI 工具變動快，3 個月）。
