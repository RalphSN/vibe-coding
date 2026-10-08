---
name: new-lesson
description: 製作一課教材的流程：確認範圍 → 大綱 → 確認 → 撰寫 → 自我檢查 → 輸出。只在使用者明確呼叫時執行。
disable-model-invocation: true
argument-hint: "<課程主題與第幾課>"
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# /new-lesson

主題：$ARGUMENTS

- [ ] 1. 確認：讀者程度、第幾課、前面教過什麼、輸出格式（Notion 或 HTML）。只問缺少的。
- [ ] 2. 大綱：寫「學完你能做到」一句話，加上六段各一行的大綱與 3 題練習的題目方向。
- [ ] 3. 等確認：使用者確認大綱後才寫全文。
- [ ] 4. 撰寫：照 `course-lesson` 的模板與規格。
- [ ] 5. 自我檢查：照 `course-lesson` 的檢查清單逐項打勾，並估算閱讀時間。
- [ ] 6. 輸出：Notion 頁面或單一 HTML 檔；HTML 要在瀏覽器打開確認手機寬度與深色模式。
- [ ] 7. 回報：課名、閱讀時間、練習題數、輸出位置、下一課建議主題。
