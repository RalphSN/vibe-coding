# 研究筆記：AI 系列・第三部｜機器學習基礎

> 今天日期：**2026-10-23**。標記：✅ 原始或官方文件確認 ・ 🟡 第三方或通則 ・ ⚠️ 未確認
> 這一卷大部分是數學與定義（MSE、梯度、sigmoid、precision、recall），不會隨時間改變；只有少數歷史事實需要出處。

## 0. 設計決定

| # | 決定 | 理由 |
|---|---|---|
| 1 | 所有互動都用小資料實際計算（梯度下降、k-means、ε-greedy、多項式最小平方＋L2、混淆矩陣） | 讀者可以手算驗證，不是假動畫 |
| 2 | 微分只講「斜率」；鏈鎖律留給第四部 | 對象不一定學過微積分 |
| 3 | 多項式擬合的資料是 sin(2πx)＋固定種子的高斯雜訊 | 經典的過擬合示範，每次載入結果一樣 |
| 4 | 拉霸機用真的亂數，每個人結果不同 | 強化學習本來就有隨機性 |

## 1. 事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| Samuel 1959 論文標題用了 Machine Learning；程式自己調權重，下贏設計者 | 序章 research-notes | ✅ |
| 最小平方法最早由 Legendre 1805 發表，Gauss 也獨立提出 | Wikipedia Least squares | 🟡 |
| k-means 一詞由 MacQueen 1967 提出；標準演算法常稱 Lloyd 演算法 | Wikipedia k-means | 🟡 |
| ε-greedy、探索與利用（exploration vs exploitation） | Sutton & Barto 2018 第 2 章 | ✅（教科書標準內容） |
| AlphaGo 結合深度神經網路、樹搜尋與強化學習，2016 發表於 Nature | Silver 等 2016 | ✅ |
| precision、recall、F1、混淆矩陣的定義 | scikit-learn 文件 | ✅ |
| Ridge（L2 正則化）、邏輯回歸 | scikit-learn 文件 | ✅ |
| k-fold 交叉驗證 | scikit-learn 文件 | ✅ |

## 2. 未確認清單

無；歷史細節只寫到「最早發表」層級。

## 3. 下次重新查證

**2027-10-23**：內容不太會過時，一年檢查一次連結是否還在。

## 2026-10-29 改版審查

> 實際查證日期 2026-10-30。改版內容：取消測驗、每課補「深入」段落、6-4 改成「選對指標＋全書地圖」。

### 修正的錯誤

| 課號 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 3-3 | 圖的說明寫「w 從 0 走到 0.93、1.3、1.5」 | 「0.93、1.35、1.54」（node 重算前 3 步：0.933、1.351、1.539） | 本書計算 |
| 6-4 | 課名「選對指標＋總複習」、目標與比喻提到「12 題總複習」 | 「選對指標＋全書地圖」，模組 6 說明同步修改 | — |

其他數字都用 node 重算過，沒有錯：1-3 MSE／MAE 拉桿、3-1 最小平方 w＝1.99、b＝0.07、3-3 第 1 步 MSE 18.67 → 3.76、3-4 發散門檻約 0.085、4-3 log loss、4-4 softmax、6-2 閾值表、6-3 拉桿說明。

### 新查證的事實

| 事實 | 來源 | 查證日期 | 可信度 |
|---|---|---|---|
| scikit-learn 目前文件版本 1.9.1 | scikit-learn 官方文件 | 2026-10-30 | ✅ |
| LogisticRegression：`penalty` 1.8 起棄用、預計 1.10 移除，改用 `l1_ratio`（預設 0）與 `C`（預設 1.0）；預設 solver lbfgs | sklearn LogisticRegression 文件 | 2026-10-30 | ✅ |
| LogisticRegression：已沒有 `multi_class` 參數；三類以上預設最佳化多類別（softmax）損失；一對其餘用 `OneVsRestClassifier` | 同上 | 2026-10-30 | ✅ |
| KMeans：`init` 預設 k-means++；`n_init='auto'` 1.4 起為預設，搭配 k-means++ 跑 1 次、隨機起點跑 10 次 | sklearn KMeans 文件 | 2026-10-30 | ✅ |
| 3-4 發散門檻＝2 ÷ Hessian 最大特徵值：Hessian＝[[22,6],[6,2]]，特徵值 12 ± √136 ≈ 23.66、0.34，門檻 ≈ 0.0845，條件數 ≈ 70 | 本書計算（node） | 2026-10-30 | ✅ |
| 3-1 房價 5 點 R² ≈ 0.997；6-2 那 20 筆的 ROC AUC＝79/96 ≈ 0.82 | 本書計算（node） | 2026-10-30 | ✅ |
| Mitchell 1997 的 E、T、P 學習定義 | Mitchell《Machine Learning》 | 2026-10-30 | 🟡 教科書通則，未翻原書頁碼 |
| k-means++（Arthur、Vassilvitskii 2007） | SODA 2007 論文 | 2026-10-30 | 🟡 |
| 雙重下降（Belkin 等 2019，PNAS） | PNAS 論文 | 2026-10-30 | 🟡 |
| `cross_val_score` 對分類器傳整數 cv 時用 StratifiedKFold；`SGDRegressor` 有 `max_iter`、`tol`、`early_stopping` | sklearn 文件（依既有知識，本次未逐頁開） | — | ⚠️ 未查證 |
| scikit-learn 的 HuberRegressor、QuantileRegressor、CalibratedClassifierCV 存在 | sklearn 文件（依既有知識） | — | ⚠️ 未查證 |

### 補的子題（深入段落）

| 課 | 子題 |
|---|---|
| 0-1 | Mitchell 定義、什麼時候不該用機器學習 |
| 1-1 | 高基數類別（新增拉桿）、缺值與有序類別 |
| 1-2 | 對參數線性：線性模型也能畫曲線 |
| 1-3 | MSE↔平均數、MAE↔中位數、Huber、分位數損失 |
| 1-4 | 凸函數、公式解 vs 梯度下降的成本 |
| 2-1 | 標籤雜訊對 accuracy 的上限（新增拉桿）、自監督／弱監督／半監督 |
| 2-2 | k-means 的形狀假設、k-means++、選 k |
| 2-3 | 延遲獎勵與折扣因子（新增拉桿）、UCB／Thompson、reward hacking |
| 3-1 | R²、殘差診斷、相關不等於因果 |
| 3-2 | 數值梯度的精度與梯度檢查、MAE 的次梯度 |
| 3-3 | 批次／SGD／小批次、停止條件、特徵縮放 |
| 3-4 | 發散門檻與條件數的推導（新增拉桿） |
| 4-1 | XOR 與非線性邊界（新增 SVG） |
| 4-2 | odds 解讀、完美可分、校準、sklearn 新參數 |
| 4-3 | 最大概似、log loss 基準線、為什麼不用 MSE＋sigmoid |
| 4-4 | 數值穩定、一對其餘、溫度 |
| 5-1 | 偏差、變異、雜訊；雙重下降 |
| 5-2 | 測試集大小與信賴區間（新增拉桿）、分層與群組切分 |
| 5-3 | L1／L2／Elastic Net／提早停止、alpha 與 C 方向相反 |
| 5-4 | k 的取捨（新增拉桿）、Stratified／Group／TimeSeries、巢狀交叉驗證 |
| 6-1 | 期望成本、特異度與誤報率、多類別混淆矩陣 |
| 6-2 | ROC、PR、AUC、precision@k |
| 6-3 | 基準率與 precision（新增拉桿）、F-beta、重抽樣後要重新校準 |
| 6-4 | 用總成本選閾值（新增拉桿）、全書一頁地圖、會過時的內容、上線後監控 |

深入思考題：刪掉 5 題（1-4、3-1、4-3、5-2、6-3，答案課文裡就有），保留 19 題。
