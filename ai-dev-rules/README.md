# ai-dev-rules

一套開發規範寫一次，由腳本轉成 Claude Code、Codex、Antigravity 三種格式。

## 3 步安裝

在這個資料夾開 PowerShell（5.1 或 7 都可以）：

1. 產生並檢查：
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/build.ps1
   powershell -ExecutionPolicy Bypass -File scripts/verify.ps1
   ```
2. 預覽安裝（不會寫入任何檔案）：
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/install.ps1
   ```
3. 確認清單沒問題後寫入：
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Apply
   ```

只裝一個工具：加 `-Tool claude`、`-Tool codex` 或 `-Tool antigravity`。
被覆寫或合併的舊檔會備份到 `backups/<時間戳>/`。

### 安裝後要手動做的

Antigravity 2.0 App 不讀 CLI 的設定檔，權限要在 UI 手動加（依 2.18 版畫面）：
1. 開 Settings → General → Tool Permissions → Terminal Commands。
2. 按 Add，下拉選 Deny，加入 `git push --force`、`git push -f`、`rm -rf`、`Remove-Item -Recurse -Force`。
3. 回上一頁開 File Access Rules，用 Deny 擋下 `.env`。

Codex 想多一層擋 `.env`：加 `-IncludeCodexPermissions` 再裝一次。這會改 `~/.codex/config.toml`，和 `sandbox_mode` 不能同時用。

## 新專案

```powershell
powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -List
powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Starter vue3-vite-ts -Target D:\code\my-app
```

會放進專案：`AGENTS.md`（三工具共用）、`CLAUDE.md`（只有 `@AGENTS.md`）、三工具的 hooks 與權限設定、範本指定的領域規則。已存在的檔案預設略過。

## 怎麼改規則

1. 改來源：`core/`、`core/domains/`、`skills/`、`workflows/`、`agents/`、`enforcement/`。不要改 `dist/`。
2. `scripts/build.ps1` 重新產生 `dist/`。
3. `scripts/verify.ps1` 檢查，失敗會列出檔名與原因。
4. `scripts/install.ps1` 預覽，再加 `-Apply` 寫入。

寫規則的原則：一條規則一句話、可以被檢查。「回答要好」不行，「先給結論，再給理由」可以。

程式碼註解預設繁體中文。想改成英文：改 `core/02-code-quality.md` 的「註解」一節，再 build。

## 什麼時候該更新

- AI 第二次犯同一個錯：把正確做法寫成一條可檢查的規則；能用設定擋的，加到 `enforcement/`。
- 工具改版：重查 `docs/research-notes.md` 列的官方文件，路徑或上限變了就改 `scripts/build.ps1` 和 `verify.ps1`。
- 偏好改變：直接改 `core/`，在 `CHANGELOG.md` 記一筆。
- 規則沒人遵守：檔案可能太長，先刪掉 AI 本來就會做對的規則。
- 每 3 個月檢查一次：Antigravity workflows 2026-11-01 棄用、Codex rules 仍是實驗功能。

## 檔案樹

```
ai-dev-rules/
├── README.md、CHANGELOG.md
├── docs/
│   ├── research-notes.md     研究結果與來源
│   └── tool-comparison.md    三工具功能對照與落差
├── core/                     規範內容，唯一來源
│   ├── 00-communication.md … 06-documentation.md
│   └── domains/              7 個領域，frontmatter 寫 globs 與 description
├── skills/                   13 個 skills（Agent Skills 格式）
├── workflows/                6 個手動流程，build 成只能手動呼叫的 skill
├── agents/                   子代理（independent-reviewer）
├── enforcement/              hook 腳本、三工具權限設定、hook 測試案例
├── templates/project-starters/  6 個專案範本（AGENTS.md + starter.json）
├── dist/                     build 產生，不要手改
│   ├── claude-code/{global,project}/
│   ├── codex/{global,project}/
│   └── antigravity/{global,project}/
├── scripts/
│   ├── build.ps1、verify.ps1、install.ps1、new-project.ps1
│   └── lib/common.ps1
└── backups/                  install 的備份（不進版控）
```

和原始規劃相比多了三個資料夾：
- `enforcement/`：hook 與權限設定要給三個工具共用，放在一起才不會分散到各工具的 dist 裡各改各的。
- `agents/`：子代理也是單一來源，build 成 Claude 的 `.md` 與 Codex 的 `.toml`。
- `backups/`：install 的備份放在這個資料夾，不放進家目錄。

## 設計判斷

- 以三個工具的最新版為準，路徑與上限見 `docs/research-notes.md`。
- 原本的 `code-review` skill 改名 `rules-review`、`/review` 改名 `/review-changes`，避開 Claude Code 內建指令。
- 領域規範在全域一律做成 `domain-*` skill。官方文件沒寫清楚 `~/.claude/rules/` 裡的 `paths:` 會怎麼處理，做成 skill 比較保險。
- Antigravity 的 workflows 全部做成 skill，因為 2026-11-01 起 workflows 棄用。
- 專案 `CLAUDE.md` 只放 `@AGENTS.md`。新版 Claude Code 雖然會直接讀 `AGENTS.md`，但專案一有 `CLAUDE.local.md` 就不讀了；用 import 兩種情況都有效，而且不會重複載入。
- 腳本相容 Windows PowerShell 5.1：這台電腦沒有安裝 PowerShell 7。
