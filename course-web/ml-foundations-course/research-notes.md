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
