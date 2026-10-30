# HANDOFF：react-complete-course

現況：27 課全部完成，已加入書櫃（index.html、index-2d.html）。

## 修改內容
1. 改 `src/` 的分段檔，不要直接改 `index.html`。
2. 重建：`sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/react-complete-course/src course-web/react-complete-course/index.html`
3. 驗證：`node ai-dev-rules/skills/course-web-neo-brutalism/scripts/audit.mjs course-web/react-complete-course/index.html`（本機沒有全域 Playwright 時，設 PW_ROOT 與 CHROMIUM_PATH）

## 結構
- 骨架從 `csharp-complete-course` 複製；`d-sources.html` 內含 `Fig` 圖解產生器（row、tree、stack、vs），座標與字級自動計算。
- 互動元件：`csrun`（按「執行」顯示事先寫好的輸出，可用 lang／hl／file／title 改標籤）。2026-10-29 起不出測驗：predict、classify 不再使用。
- 每課 `examples.blocks` 最後有「深入：」段落；6-4 的深入段落是全書一頁地圖。

## 下次重新查證
2027-01-30：React 版本、React Compiler 的 Vite 設定、RSC 安全公告、React Router RSC 狀態、Vite 主版本（清單見 6-4 深入段落）。

## 已知問題
- 程式輸出未在本機實際執行，見 research-notes.md。
