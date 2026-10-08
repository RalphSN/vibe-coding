# AGENTS.md：給 AI agent 的工作說明

這份是 Claude Code、Codex、Antigravity 進到這個 repo 時要先讀的說明。給人看的版本在 `README.md`。

## 使用者

- 個人開發，公司 Windows 與家裡 macOS（M4 Pro）兩台共用，以 GitHub `main` 為準。
- 預設繁體中文（台灣用語）。使用者有 ADHD：先給結論，用表格、圖、條列，不寫長段落。
- 要使用者自己執行指令時，先說明那支腳本是誰寫的、做什麼、為什麼要跑，再給一步一步的指令，Windows 與 macOS 分開寫。
- 新規則確立後，回頭檢查已做好的內容，不符合的主動修正並列出改了什麼。

## 資料夾與「來源」的對應

改東西之前先確認改的是**來源**，產生出來的副本一律不手改。

| 要改的東西 | 來源（改這裡） | 產生出來的（不要手改） | 重新產生的方法 |
|---|---|---|---|
| 共用規範 | `ai-dev-rules/core/`、`core/domains/` | `ai-dev-rules/dist/`、家目錄的 `~/.claude` `~/.codex` `~/.gemini` | `build.ps1` → `verify.ps1` → 使用者跑 `install` |
| skills | `ai-dev-rules/skills/<名稱>/` | 同上，另外 `.claude/skills/<名稱>/`（依 `project-skills.txt` 同步） | 同上 |
| workflows、agents、hooks | `ai-dev-rules/workflows/`、`agents/`、`enforcement/` | 同上 | 同上 |
| 有 `src/` 的課程 | `course-web/<課>/src/` | `course-web/<課>/index.html` | `sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh <src> <index.html>` |
| 沒有 `src/` 的課程 | `course-web/<課>/index.html` 本身 | — | — |
| 書櫃首頁 | `index.html`（3D）與 `index-2d.html`（2D），兩個要同步 | — | — |
| impeccable skill | 第三方，上游 `RalphSN/impeccable` | `.claude/skills/impeccable/` | 從上游 `.claude/skills/impeccable/` 複製，保留 `LICENSE`、`NOTICE.md` |

例外：`.claude/skills/impeccable/` 不經過 ai-dev-rules，直接放在這裡。

## 常見任務的步驟

### 修改 skill 或規範

1. 改 `ai-dev-rules/` 底下的來源（見上表）。
2. `pwsh ai-dev-rules/scripts/build.ps1`，再 `pwsh ai-dev-rules/scripts/verify.ps1`，必須「verify 通過」。
3. 在 `ai-dev-rules/CHANGELOG.md` 的 `[Unreleased]` 記一筆（Added／Changed／Fixed／Removed）。
4. commit 時把來源、`dist/`、`.claude/skills/` 的同步副本一起提交。
5. 告訴使用者：兩台電腦各要 `git pull`，再跑一次 install（Windows：`powershell -ExecutionPolicy Bypass -File scripts/install.ps1 -Apply`；macOS：`sh scripts/install.sh -Apply`），然後重開三個工具。

### 新增 skill

1. 建 `ai-dev-rules/skills/<名稱>/SKILL.md`，開頭要有 `name` 與 `description`（description 寫清楚「什麼時候用」，三個工具靠它決定要不要載入）。
2. 附帶檔案放 `references/`、`scripts/`、`assets/`；build 會自動加上「由 build.ps1 產生」標記。
3. 雲端 session 也要能用的話，把名稱加進 `ai-dev-rules/project-skills.txt`。
4. 照「修改 skill 或規範」第 2–5 步。

### 刪除 skill

1. 刪掉 `ai-dev-rules/skills/<名稱>/`；有列在 `project-skills.txt` 的話一起刪那一行，並刪掉 `.claude/skills/<名稱>/`。
2. 搜尋其他 skill 或規範有沒有引用它（`grep -rn <名稱> ai-dev-rules/core ai-dev-rules/skills`），一併修改。
3. 照「修改 skill 或規範」第 2–5 步。install 會自動刪掉家目錄裡我們裝過的舊檔（只刪有 build 標記的檔案，先備份）；預覽清單會顯示「刪除」。

### 改規範內容的原則

- 一條規則一句話，而且可以被檢查。
- 規範只寫 AI 會做錯的事；AI 本來就做得對的不要寫，檔案太長規則會被忽略。
- `verify.ps1` 會檢查長度上限（Codex `AGENTS.md` 32 KB、Antigravity `GEMINI.md` 24 KB），超過就要精簡。

### 新增課程或加書到書櫃

- 課程：用 `course-web-neo-brutalism` skill；超過 5 個模組用 `src/` 分段加 `build.sh`。
- 書櫃：用 `bookshelf-portal` skill；`index.html` 與 `index-2d.html` 的 `SITES` 都要加。
- 驗證：`node ai-dev-rules/skills/course-web-neo-brutalism/scripts/audit.mjs course-web/<課>/index.html`。

## Git

- 在功能分支開發，`git merge --no-ff` 合併進 `main`。
- 只新增、不改現有內容時，使用者授權過就可以直接合併；有改到現有內容時，先回報差異再問。
- 不 force push、不 commit `.env` 或金鑰、不提交 `_inbox/` 的東西（已在 `.gitignore`）。
- 換行一律 LF，`.ps1`、`.bat`、`.cmd` 是 CRLF（`.gitattributes` 會處理）。

## 雲端 session（claude.ai/code）的環境限制

| 限制 | 做法 |
|---|---|
| 沒有 `pwsh`，不能跑 build／verify | 把 PowerShell 7 的 Linux tar.gz（GitHub releases）下載到暫存資料夾解壓後用；不要寫進 repo |
| 連不到 CDN（jsdelivr、cdnjs）與 Google Fonts | 不要判定成網頁壞了；測 3D 時用 npm 在暫存資料夾裝同版 three，再用 Playwright `route()` 改指向本機 |
| Playwright | 用全域安裝（`npm root -g`）；Chromium 在 `/opt/pw-browsers`，腳本支援 `PW_ROOT`、`CHROMIUM_PATH` |
| 家目錄的全域 skills 不存在 | 只讀得到 `.claude/skills/`，所以需要的 skill 要列在 `project-skills.txt` |
| install 在雲端跑沒有意義 | install 寫的是那台機器的家目錄，請使用者在自己的電腦跑 |
