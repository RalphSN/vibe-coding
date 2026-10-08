# 原始分段檔

`../index.html` 是由這個資料夾的分段檔組出來的成品。**要改課程內容，改這裡的分段檔，再重建**，不要直接改 `index.html`。

## 重建

在 repo 根目錄執行（Windows 用 Git Bash，macOS 用終端機）：

```sh
sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/karpathy-output-formats-course/src course-web/karpathy-output-formats-course/index.html
```

## 檔案

| 檔案 | 內容 |
|---|---|
| `a-head1.html` | `<head>`、token、基礎樣式 |
| `b-widgets.css` | 互動元件樣式 |
| `a-head2.html` | 版面骨架 |
| `c-data.html` | `COURSES` 與資料 API |
| `d-sources.html` | 參考來源 |
| `m0.html`… | 每個模組的課程內容 |
| `e-engine1.js`、`e-engine2.js` | 引擎（路由、側欄、術語、測驗） |
| `f-widgets.js` | 互動元件 |

組合順序與規則見 `ai-dev-rules/skills/course-web-neo-brutalism/references/build-and-widgets.md`。
