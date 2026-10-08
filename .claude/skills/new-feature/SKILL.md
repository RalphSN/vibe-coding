---
name: new-feature
description: 新功能完整流程：釐清需求 → 計畫 → 開分支 → 實作 → 驗證 → 審查 → commit。只在使用者明確呼叫時執行。
disable-model-invocation: true
argument-hint: "<功能描述>"
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# /new-feature

要做的功能：$ARGUMENTS

照順序做，每一步完成後在 checklist 打勾回報。

- [ ] 1. 釐清需求：用一句話重述目標；有不清楚的地方只問一個最關鍵的問題，等回答。
- [ ] 2. 探索：讀相關程式碼與現有測試，列出會影響到的檔案。
- [ ] 3. 計畫：照 `plan-before-code` 的範本寫計畫，等使用者確認。
- [ ] 4. 開分支：`git status` 確認乾淨後，開 `feat/<short-kebab-desc>`。
- [ ] 5. 實作：照計畫做；先寫測試再寫功能（能測的部分）。
- [ ] 6. 驗證：照 `verify-done` 逐項檢查。
- [ ] 7. 審查：照 `rules-review` 自我審查，修掉所有「必改」。
- [ ] 8. Commit：照 `git-commit` 產生訊息，等使用者確認後提交；不 push。
- [ ] 9. 回報：改了哪些檔案、怎麼驗證、還沒做什麼、下一步。
