---
name: new-project
description: 建立新專案流程：選範本 → 建立骨架 → 套用專案規則 → 初始化 git → 第一次驗證。只在使用者明確呼叫時執行。
argument-hint: <專案類型與名稱，例如 vue3-vite-ts my-app>
---

# /new-project

專案：$ARGUMENTS

可用範本：`vue3-vite-ts`、`uniapp`、`unity-2d`、`node-api`、`static-site`、`course-content`。

- [ ] 1. 確認：專案類型（對應上面哪個範本）、名稱、放在哪個資料夾。只問缺少的那一項。
- [ ] 2. 建立骨架：用官方工具（例如 `npm create vue@latest`、Unity Hub）；列出要執行的指令，等確認後執行。
- [ ] 3. 套用規則：請使用者在 ai-dev-rules 資料夾執行
      `powershell -ExecutionPolicy Bypass -File scripts/new-project.ps1 -Starter <範本> -Target <專案路徑>`。
- [ ] 4. 補專案資訊：在專案的 `AGENTS.md` 填入實際的安裝、啟動、測試指令。
- [ ] 5. 初始化 git：`git init`、加入 `.gitignore`、第一個 commit `chore: initial commit`。
- [ ] 6. 驗證：安裝相依套件、啟動、跑一次 lint 與型別檢查。
- [ ] 7. 回報：專案路徑、常用指令、下一步。
