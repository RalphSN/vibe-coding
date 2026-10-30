# HANDOFF：python-complete-course

現況：28 課全部完成，已加入書櫃（index.html、index-2d.html）。

## 修改內容
1. 改 `src/` 的分段檔，不要直接改 `index.html`。
2. 重建：`sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/python-complete-course/src course-web/python-complete-course/index.html`
3. 驗證：`node ai-dev-rules/skills/course-web-neo-brutalism/scripts/audit.mjs course-web/python-complete-course/index.html`（本機沒有全域 Playwright 時，設 PW_ROOT 與 CHROMIUM_PATH）

## 結構
- 骨架從 `csharp-complete-course` 複製；`d-sources.html` 內含 `Fig` 圖解產生器（row、tree、stack、vs），座標與字級自動計算。
- 互動元件：`csrun`（可執行範例：按「執行」顯示事先在 CPython 跑過的輸出，可用 lang／hl／file 改標籤）、`knobs`（試算拉桿，0-1 用）。`classify` 保留但已不使用（2026-10-29 起不出測驗）。
- 下次重新查證：2027-01（3.15 修補版、uv、Windows 安裝管理員）。

## 已知問題
- 19 段 csrun 已用 CPython 3.14.6 實跑比對；3.15 專屬語法、httpx、mypy、pytest 的輸出仍未實跑，見 research-notes.md。
