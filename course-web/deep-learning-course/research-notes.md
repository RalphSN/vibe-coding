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

## 2026-10-29 改版審查

> 實際查證日期：2026-10-30。改版內容：不出測驗、每課補「深入：」段落、7-4 總複習改成一頁地圖。

### 修正的錯誤

| 課號 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 7-1 術語 PyTorch、4-3 圖說、d-sources | 「2026-10 最新穩定版 2.14」，文件連結指向 2.14 | 2.15.0 於 2026-10-28 GA；Adam 預設值在 2.15 文件不變；連結改 2.15 | https://dev-discuss.pytorch.org/c/release-announcements/27 、https://pypi.org/project/torch/ 、https://docs.pytorch.org/docs/2.15/generated/torch.optim.Adam.html ✅ |
| 0-1 術語「深度」 | 「ResNet 最深做到 152 層」 | 「ResNet 在 ImageNet 上用到 152 層」（論文在 CIFAR-10 另外訓練過 1202 層） | arXiv 1512.03385 ✅ |
| 7-4 | 課名「迷你 GPT＋總複習」、目標含「12 題總複習」 | 「迷你 GPT 與一頁地圖」，加全書架構表、會過時內容表 | — |

### 補的子題（深入段落）

| 課 | 子題 | 來源 | 可信度 |
|---|---|---|---|
| 0-1 | 萬能近似定理；表格資料常輸給梯度提升樹 | Wikipedia UAT；arXiv 2207.08815 | 🟡／✅ |
| 1-1 | 感知器的階梯函式為何不能反向傳播 | Wikipedia Perceptron | 🟡 |
| 1-2 | SwiGLU（PaLM、Llama），中間維度約 8d/3 | arXiv 2002.05202、2302.13971 | ✅ |
| 1-3 | 最小解與實際訓練、x₁x₂ 特徵 | 推導 | ✅ |
| 2-1 | nn.Linear 權重形狀 (out, in)、y＝xAᵀ＋b、初始化 U(−√k, √k) | PyTorch 2.15 文件 | ✅ |
| 2-2 | 訓練記憶體組成、梯度檢查點 | arXiv 1604.06174 | ✅ |
| 2-3 | softmax 溢位（float32 上限約 3.4e38）、logsumexp、label_smoothing | PyTorch 2.15 CrossEntropyLoss | ✅ |
| 3-1 | 正向／反向模式、define-by-run、torch.compile | arXiv 1502.05767；PyTorch 教學 | ✅ |
| 3-2 | Jacobian、VJP、gradcheck 用 float64 | 同上 | ✅ |
| 3-3 | 反向約 2 倍前向、6N FLOPs／token | arXiv 2001.08361 | ✅ |
| 3-4 | 葉節點 .grad、retain_graph、原地修改、create_graph | PyTorch 2.15 Autograd mechanics | ✅ |
| 4-1 | 線性縮放規則（批次 8,192）、臨界批次、Adam 平方根規則 | arXiv 1706.02677、1812.06162、2205.10287 | ✅ |
| 4-2 | 速度上限 g÷(1−β)、PyTorch 動量寫法與 Sutskever 不同、Nesterov | PyTorch 2.15 SGD 文件 | ✅ |
| 4-3 | AdamW 解耦衰減、16 bytes／參數、Muon 約 52% 計算量（作者自報） | arXiv 1711.05101、2502.16982 | ✅／🟡 未獨立重現 |
| 4-4 | Xavier／He／PyTorch 預設、clip_grad_norm_、WSD 排程 | PMLR v9 glorot10a；arXiv 2404.06395 | ✅ |
| 5-1 | Conv2d 是 cross-correlation、多通道卷積核、平移等變 | PyTorch 2.15 Conv2d | ✅ |
| 5-2 | 感受野遞推、有效感受野、步長卷積與全域平均池化 | arXiv 1701.04128 | ✅ |
| 5-3 | VGG 疊 3×3（新增試算）、ViT、ConvNeXt | arXiv 1409.1556、2010.11929、2201.03545 | ✅ |
| 6-1 | BPTT、截斷 BPTT | 通則 | 🟡 |
| 6-2 | GRU、遺忘閘偏差初始化 1 | arXiv 1406.1078；PMLR v37 jozefowicz15 | ✅ |
| 6-3 | 序列長度代價試算（新增）、FlashAttention、Mamba、KV 快取 | arXiv 2205.14135、2312.00752 | ✅ |
| 7-1 | dtype／bfloat16、廣播、原地修改；2.15 需 Python 3.11+ | PyTorch 2.15 AMP 文件；dev-discuss 公告 | ✅ |
| 7-2 | 先背下一小批、初始損失、種子；eval 與 no_grad 不同、inference_mode | Karpathy 2019；Autograd mechanics | ✅ |
| 7-3 | 平滑、困惑度 e^1.4697 ≈ 4.35 | 計算 | ✅ |
| 7-4 | 一頁地圖；現代零件 RoPE、RMSNorm、SwiGLU、SDPA | arXiv 2302.13971；PyTorch 2.15 SDPA 文件 | ✅ |

### 深入思考題

保留 20 題；刪掉 5 題（0-1、3-3、6-2、6-3、7-1），答案在課文、圖說或重點裡就找得到。

### 未查證

- 6-1「梯度大小約跟著 U 最大特徵值的 T 次方」是簡化說法（🟡 通則）。
- 4-3 Muon 的效率數字只有作者自報，未見獨立重現。
- nanochat 的內部架構細節沒有寫進課文，未逐項查證。
