# HANDOFF：typescript-complete-course

現況：27 課全部完成，已加入書櫃（index.html、index-2d.html）。2026-10-29 改版：不出測驗，每課有「深入：」段落，深入思考題共 20 題。

## 修改內容
1. 改 `src/` 的分段檔，不要直接改 `index.html`。
2. 重建：`sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/typescript-complete-course/src course-web/typescript-complete-course/index.html`
3. 驗證：`node ai-dev-rules/skills/course-web-neo-brutalism/scripts/audit.mjs course-web/typescript-complete-course/index.html`（本機沒有全域 Playwright 時，設 PW_ROOT 與 CHROMIUM_PATH）

## 結構
- 骨架從 `csharp-complete-course` 複製；`d-sources.html` 內含 `Fig` 圖解產生器（row、tree、stack、vs），座標與字級自動計算。
- 互動元件：`csrun`（按「執行」顯示事先寫好的輸出，可用 lang／hl／file 改標籤）。`classify` 元件還在 `f-widgets.js` 但已沒有課程使用。

## 下次重新查證
- 2027-01：TypeScript 7.1 正式版、typescript-eslint 是否改用新 API（6-4、0-1 版本表）、Node LTS 版本、Zod 版本。

## 已知問題
- 程式輸出未在本機實際執行，見 research-notes.md。
