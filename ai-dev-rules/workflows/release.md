---
name: release
description: 發版流程：確認狀態 → 完整檢查 → 決定版號 → 更新 CHANGELOG → 打 tag。只在使用者明確呼叫時執行；push 與發布一律等使用者確認。
argument-hint: [版號，例如 1.2.0；不填就依改動建議]
---

# /release

目標版號：$ARGUMENTS

- [ ] 1. 確認狀態：在 `main`（或專案的發版分支）、工作區乾淨、和遠端同步。
- [ ] 2. 完整檢查：照 `verify-done` 跑測試、lint、型別檢查、建置，全部通過才繼續。
- [ ] 3. 決定版號：依 SemVer；列出上次 tag 以來的 commit，有 `feat` 升 minor、只有 `fix` 升 patch、有 BREAKING CHANGE 升 major。版號等使用者確認。
- [ ] 4. 更新 CHANGELOG.md：依 Keep a Changelog 格式，寫使用者看得到的影響。
- [ ] 5. 更新版號：`package.json`、Unity 的 Player Settings 或其他版號檔。
- [ ] 6. Commit：`chore(release): v<版號>`，等使用者確認。
- [ ] 7. 打 tag：`git tag v<版號>`。
- [ ] 8. 停下來：列出 push 與發布要跑的指令，由使用者決定是否執行。
