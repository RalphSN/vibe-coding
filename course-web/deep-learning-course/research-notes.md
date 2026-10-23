# 研究筆記：AI 系列・第四部｜深度學習

> 今天日期：**2026-10-23**。標記：✅ 原始或官方文件確認 ・ 🟡 通則或第三方 ・ ⚠️ 未確認

## 0. 設計決定

| # | 決定 | 理由 |
|---|---|---|
| 1 | 反向傳播用「計算圖＋逐步表格」呈現，3-4 用 micrograd 風格的 Python 手寫 | 讀者能一格一格對答案 |
| 2 | 優化器比較用同一個橢圓碗 f＝½(w₁²＋10w₂²)，三條路徑都是實際計算 | 讓動量與 Adam 的差別看得見 |
| 3 | 迷你 GPT 不在瀏覽器訓練；給完整 PyTorch 程式，瀏覽器裡用字元二元模型示範「數完再抽字」 | 瀏覽器跑不動 Transformer 訓練 |
| 4 | PyTorch 範例以 2.x API 寫（`torch.nn`、`torch.optim.AdamW`），標示需要自己的環境執行 | 頁面沒有 Python |

## 1. 事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| 反向傳播：Rumelhart、Hinton、Williams，Nature 1986 | Nature 323:533 | ✅（書目） |
| GELU＝x·Φ(x)，Hendrycks、Gimpel 2016 | arXiv 1606.08415 | ✅ |
| Adam：Kingma、Ba 2014（ICLR 2015）；PyTorch 預設 lr 0.001、betas (0.9, 0.999)、eps 1e-8、weight_decay 0 | arXiv 1412.6980；PyTorch 2.14 文件 | ✅ |
| ResNet：ImageNet 上最深 152 層；集成模型測試集錯誤率 3.57%，ILSVRC 2015 分類第一 | arXiv 1512.03385 | ✅ |
| AlexNet：ILSVRC-2012 top-5 15.3%（第二名 26.2%），兩張 GPU | 序章 research-notes | ✅ |
| LeNet：LeCun 等，手寫數字辨識的卷積網路（LeNet-5，1998） | Wikipedia | 🟡 |
| LSTM：Hochreiter、Schmidhuber 1997 | Wikipedia | 🟡 |
| He 初始化（針對 ReLU） | arXiv 1502.01852 | 🟡 引用概念 |
| micrograd：約 100 行的反向自動微分引擎，教育用，MIT | GitHub | ✅ |
| nanoGPT：shakespeare_char 範例 6 層、6 頭、384 維、context 256，一張 A100 約 3 分鐘，最佳驗證損失 1.4697；2025-11 作者標示為舊專案，建議 nanochat | GitHub README | ✅ |
| PyTorch 最新穩定版 2.14 | PyTorch 文件 | ✅（2026-10-23） |

## 2. 未確認清單

無；歷史細節只寫到年份與作者。

## 3. 下次重新查證

**2027-04-23**：PyTorch 版本與預設值、nanoGPT／nanochat 的狀態。
