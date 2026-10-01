---
name: git-commit
description: 依 Conventional Commits 產生英文 commit 訊息，必要時拆成多個 commit。使用者要求 commit、寫 commit 訊息、整理提交時使用。
---

<!-- 由 scripts/build.ps1 產生，請改 ai-dev-rules 的來源（core/、skills/、workflows/、agents/、enforcement/），不要改這裡 -->

# Git commit

## 步驟

1. 跑 `git status` 和 `git diff --staged`；沒有暫存的改動就跑 `git diff`，問使用者要提交哪些。
2. 檢查有沒有不該提交的檔案：`.env`、金鑰、`node_modules/`、建置產物、除錯 log。有就停下來回報。
3. 判斷改動是不是同一件事；不是就提議拆成多個 commit，列出每個 commit 包含哪些檔案。
4. 為每個 commit 寫訊息（格式見下）。
5. 使用者確認後才執行 `git commit`；不 push，除非使用者要求。

## 訊息格式

```
<type>(<scope>): <summary>

<body：為什麼改、改了什麼，可省略>

<footer：BREAKING CHANGE: ... 或 Closes #123，可省略>
```

- type：`feat`、`fix`、`refactor`、`perf`、`test`、`docs`、`style`、`build`、`ci`、`chore`。
- scope：受影響的模組或資料夾，小寫，可省略。
- summary：英文祈使句、小寫開頭、不加句號、72 字元內。
- body：每行 72 字元內，說明「為什麼」。

## 範例

```
fix(cart): prevent negative quantity on decrement

Quantity could go below zero when the button was clicked rapidly
because the check ran before the store update.
```

## 規則

- 不用 `--no-verify`；pre-commit hook 失敗就修問題。
- 不 amend 已經 push 的 commit。
- 在 `main` / `master` 上時，先提議開分支。
