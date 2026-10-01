---
name: review-changes
description: 審查目前的改動：收集 diff、跑檢查、依規範分「必改 / 建議 / 小事」回報。只在使用者明確呼叫時執行。
argument-hint: [檔案或分支，預設為目前未提交的改動]
---

# /review-changes

審查範圍：$ARGUMENTS（沒指定就審查目前未提交與已暫存的改動）

- [ ] 1. 收集改動：`git diff`、`git diff --staged`；指定分支時用 `git diff main...<branch>`。
- [ ] 2. 跑自動檢查：lint、型別檢查、測試；記錄結果。
- [ ] 3. 審查：照 `rules-review` 的檢查清單逐檔看，附行號。
- [ ] 4. 範圍檢查：有沒有改到任務以外的檔案。
- [ ] 5. 回報：照 `rules-review` 的格式；不自動修改，等使用者決定要修哪些。
