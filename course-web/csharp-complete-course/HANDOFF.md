# HANDOFF：C# 完整著作

現況：第 1 段完成（M0–M2，12 課），分支 `feat/csharp-complete-course`，尚未合併、尚未上書櫃。

## 接手 3 步驟
1. 讀 `research-notes.md`（版本與未實測說明）。
2. 照 `src/m2.html` 的格式新增 `src/m3.html`…，並在 `src/c-data.html` 的 `COURSES` 加模組。
3. `sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/csharp-complete-course/src course-web/csharp-complete-course/index.html`，再跑 audit。

## 需求 checklist
- [x] M0 認識 C# 與 .NET（3 課）
- [x] M1 基礎語法（5 課）
- [x] M2 方法與陣列（4 課）
- [x] M3 物件導向（5 課）
- [x] M4 型別系統進階（4 課）
- [x] M5 集合與 LINQ（4 課）
- [x] M6 委派與事件（3 課）
- [x] M7 例外與資源（3 課）
- [x] M8 非同步（4 課）
- [x] M9 實戰生態系（4 課）
- [ ] 書櫃 `index.html` 與 `index-2d.html`
- [ ] 10 種寬度、深色模式、Safari 檢查

## 互動元件（src/f-widgets.js）
- `csrun`：C# 程式 + 預測 + 事先寫好的輸出（`!` 開頭的行顯示成錯誤）
- `intrange`：整數型別範圍與溢位拉桿
- `classify`：分類練習

## 驗證
audit 需要 Playwright：本機沒有全域安裝，用暫存資料夾 `npm i playwright`，設 `PW_ROOT=<暫存>/node_modules` 與 `CHROMIUM_PATH=~/Library/Caches/ms-playwright/chromium-1243/.../Google Chrome for Testing`。

## 已知問題
- csrun 輸出未實測（本機無 dotnet）。
