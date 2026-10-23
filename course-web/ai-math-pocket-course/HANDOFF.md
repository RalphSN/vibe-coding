# 交接：AI 系列・隨身卷｜數學直覺

狀態：12 課全部完成並上架（2026-10-23），未 commit，在分支 `feat/ai-app-engineering-course`。

## 結構

| 模組 | 課 | 互動 |
|---|---|---|
| 0 怎麼用 | 0-1 | knobs（最小神經元） |
| 1 向量與點積 | 1-1、1-2 | knobs、vecplot、knobs（夾角） |
| 2 矩陣乘法 | 2-1、2-2 | knobs（一層網路、形狀與運算量） |
| 3 導數與梯度 | 3-1、3-2、3-3 | knobs、knobs（學習率）、optim2d、autodiff |
| 4 機率與 softmax | 4-1、4-2 | sampler、knobs（期望值、softmax） |
| 5 對數與 cross-entropy | 5-1、5-2 | knobs（下溢、CE 與梯度）、總複習 12 題 |

## 改內容

- 來源在 `src/`，改完跑：`sh ai-dev-rules/skills/course-web-neo-brutalism/scripts/build.sh course-web/ai-math-pocket-course/src course-web/ai-math-pocket-course/index.html`
- 引擎從序章複製；`f-widgets.js` 另外附加第三、四部的元件（plot 輔助、autodiff、optim2d 等）。
- 系列選單 `SERIES` 由 scratchpad 的 `sync_series.py` 統一寫入七本。

## 驗證（2026-10-23）

- 逐課稽核：12 課、0 個問題（術語、每課 ≥2 張圖、≥1 個互動、SVG 文字不超出、無水平捲動）。
- 選擇題 48 題，正確選項最長的比例 0%。
- 360px：無水平捲動（optim2d 的等高線在 SVG 內被裁切，不影響版面）。
- 手算數字用 node 重算：softmax(2,1,0)、CE 0.408／2.408、perplexity、0.5¹⁰⁰、自動微分 w.grad −16。
- 未驗證：Safari、prefers-reduced-motion、字級 150%、實際執行 PyTorch／NumPy 程式碼。

## 已知

- 每課閱讀時間約 6 分鐘（5-2 約 11 分鐘），比其他卷短；這本是工具書，刻意精簡。
