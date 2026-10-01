# {{PROJECT_NAME}}

一句話說明：（填入課程主題與目標讀者）

## 課程資訊

- 讀者程度：零基礎（依實際調整）
- 每課長度：20–30 分鐘
- 輸出格式：（填入 Notion、單一 HTML，或兩者）

## 專案結構

- `outline.md`：課程大綱，每課一行：編號、主題、「學完你能做到」
- `lessons/NN-slug.md`：每課的原稿，NN 為兩位數編號
- `html/NN-slug.html`：單一 HTML 版本（有的話）
- `assets/`：SVG 圖解、互動示範用的 JS

## 專案慣例

- 新課程先更新 `outline.md`，確認後再寫內容。
- 每課照固定六段結構，練習答案一律藏起來。
- 回顧題引用 `outline.md` 裡前面課程的主題。
- HTML 版要在瀏覽器確認手機寬度與深色模式。

## 適用的領域規範

- 教材與課程：Claude Code 每次都會載入；Antigravity 依描述判斷；Codex 用 `$domain-education-content`。
- 寫一課用 `course-lesson` skill，或 `/new-lesson` 流程。
