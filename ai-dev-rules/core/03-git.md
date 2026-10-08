---
id: 03-git
title: Git
---

# Git

## Commit

- 訊息用 Conventional Commits，英文：`<type>(<scope>): <summary>`。
- type 只用：`feat`、`fix`、`refactor`、`perf`、`test`、`docs`、`style`、`build`、`ci`、`chore`。
- summary 用祈使句、小寫開頭、不加句號、72 字元內。
- 一個 commit 只做一件事；功能和格式調整分開 commit。
- 只在使用者要求時才 commit 或 push。

## 分支

- 命名：`<type>/<short-kebab-desc>`，例如 `feat/login-form`、`fix/cart-total`。
- 動手前用 `git status` 確認工作區乾淨；不乾淨就先回報，不要混進別人的改動。
- 會改超過 3 個檔案的工作，建議先開分支。

## 合併

- 功能分支完成後用 `git merge --no-ff <branch>` 合併進 `main`，保留合併節點，方便整批回退。
- 合併前先跑過專案的驗證（見「測試與驗證」），0 個錯誤才合併。
- 只新增檔案或新網站、沒有改到現有內容時，使用者授權過就可以直接合併；有改到現有內容時，先回報差異再問。

## 禁止

- 不 force push（`--force`、`-f`、`--force-with-lease` 都算）。
- 不直接 commit 到 `main` 或 `master`。
- 不 commit `.env`、金鑰、token、憑證檔。
- 不跑 `git reset --hard`、`git clean -fd`、`git checkout -- .` 這類會丟掉未提交改動的指令，除非使用者明確要求。
- 不用 `--no-verify` 跳過 hooks。
