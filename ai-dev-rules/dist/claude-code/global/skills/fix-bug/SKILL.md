---
name: fix-bug
description: 修 bug 完整流程：重現 → 寫失敗測試 → 找根本原因 → 修正 → 驗證 → commit。只在使用者明確呼叫時執行。
disable-model-invocation: true
argument-hint: "<bug 描述或錯誤訊息>"
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# /fix-bug

問題：$ARGUMENTS

照順序做，每一步完成後在 checklist 打勾回報。

- [ ] 1. 重現：寫出重現步驟、實際結果、預期結果；無法重現就停下來問。
- [ ] 2. 失敗測試：寫一個能重現問題的測試，確認它現在是失敗的。
- [ ] 3. 找原因：照 `debug-systematic` 列假設、逐一驗證，寫出根本原因一句話。
- [ ] 4. 開分支：`fix/<short-kebab-desc>`。
- [ ] 5. 修正：修根本原因，不修症狀；只改必要的程式碼。
- [ ] 6. 驗證：第 2 步的測試通過，完整測試、lint、型別檢查都通過。
- [ ] 7. Commit：`fix(<scope>): <summary>`，等使用者確認後提交。
- [ ] 8. 回報：根本原因、修了什麼、怎麼驗證、怎麼防止再發生。
