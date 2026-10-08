# Vibe-Coding

用 AI 開發東西的工作區：課程網站、書櫃首頁、三個 AI 工具共用的開發規範與 skills。
公司 Windows 與家裡 macOS 兩台共用，以 GitHub 為準。

網站：GitHub Pages 發布 repo 根目錄，首頁是 `index.html`（3D 書櫃）。

## 資料夾地圖

```
Vibe-Coding/
├─ index.html              書櫃首頁（3D，three.js）
├─ index-2d.html           書櫃首頁 2D 備用版
├─ course-web/             課程網站，一門課一個資料夾
│  └─ <課程>/
│     ├─ index.html        成品（GitHub Pages 讀這個）
│     └─ src/              原始分段檔（有的課才有）→ 改這裡再重建
├─ ai-dev-rules/           三個 AI 工具共用的規範與 skills（來源 → build → dist → install）
├─ .claude/
│  ├─ skills/impeccable/   前端設計 skill（第三方，Apache-2.0）
│  ├─ skills/<其他>/       由 ai-dev-rules build 自動同步的副本（給雲端 session 用，不要直接改）
│  └─ launch.json          本機預覽伺服器設定
├─ tools/serve.mjs         本機預覽伺服器（Windows、macOS 都只需要 Node）
├─ opus5-5-animations/     Opus 5.5 動畫影片的 prompt 收藏（參考素材）
└─ _inbox/                 素材收件匣：下載的網頁、參考檔，不進 Git
```

## 換到另一台電腦時

每次開始工作：

```sh
git pull origin main
```

規範或 skills 有更新時（`ai-dev-rules/` 有變動），再裝一次：

| 步驟 | Windows（PowerShell） | macOS（終端機） |
|---|---|---|
| 進資料夾 | `cd ai-dev-rules` | `cd ai-dev-rules` |
| 預覽 | `powershell -ExecutionPolicy Bypass -File scripts/install.ps1` | `sh scripts/install.sh` |
| 安裝 | 同上，最後加 ` -Apply` | `sh scripts/install.sh -Apply` |

裝完重開 Claude Code、Codex、Antigravity 才會生效。

## 第一次在新電腦設定

1. 裝 Git、Node.js（LTS）。macOS 另外 `brew install powershell`。
2. `git clone https://github.com/RalphSN/vibe-coding.git`
3. Windows 開啟長路徑支援：`git config --global core.longpaths true`
4. 照上面「換到另一台電腦時」安裝規範。

## 本機預覽

```sh
node tools/serve.mjs                    # 整站，http://127.0.0.1:8770/
node tools/serve.mjs course-web/<課程> 8765
```

Claude Code 的預覽面板會讀 `.claude/launch.json`，裡面已設好首頁與每門課。

## 規則

- 換行一律 LF（`.gitattributes` 會處理），只有 `.ps1`、`.bat`、`.cmd` 是 CRLF。
- 下載的網頁、原文存檔放 `_inbox/`，不要放進其他資料夾。
- skills 只改 `ai-dev-rules/skills/`，改完跑 `build.ps1`。`dist/`、家目錄的安裝版、`.claude/skills/` 的同步副本都是產生出來的，不要直接改；`verify.ps1` 會抓出被直接改過的副本。
- 要讓雲端 session 也能用某個 skill，把名稱加進 `ai-dev-rules/project-skills.txt` 再 build。
- 有 `src/` 的課程，改 `src/` 再用 `build.sh` 重建，不要直接改 `index.html`。
- `.claude/skills/impeccable` 是第三方 skill；要更新時從 [RalphSN/impeccable](https://github.com/RalphSN/impeccable) 的 `.claude/skills/impeccable/` 複製過來，`LICENSE` 與 `NOTICE.md` 要保留。
