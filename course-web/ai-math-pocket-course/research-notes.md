# 研究筆記：AI 系列・隨身卷｜數學直覺

查證日期：2026-10-23。數學本身不會過期；這裡記的是「AI 框架與論文怎麼用這些數學」的出處。

| 主張 | 出處 | 狀態 |
|---|---|---|
| `nn.Linear` 計算 y = xAᵀ + b，權重形狀 (out_features, in_features) | PyTorch 2.14 文件 | ✅ 已查證 |
| `CrossEntropyLoss` 輸入是未正規化的 logits，等同 LogSoftmax + NLLLoss，預設 reduction 為 mean | PyTorch 2.14 文件 | ✅ 已查證 |
| Attention(Q,K,V) = softmax(QKᵀ/√d_k)V；除以 √d_k 是因為點積在維度大時變大，把 softmax 推到梯度很小的區域 | Vaswani 等 2017（arXiv HTML v7） | ✅ 已查證 |
| Deep Learning 一書 Part I：線性代數、機率與資訊理論、數值計算、ML 基礎 | deeplearningbook.org | ✅ 已查證 |
| king − man + woman ≈ queen | Mikolov 等 2013 | ✅（論文經典例子） |
| 3Blue1Brown 有 Linear Algebra、Calculus、Neural Networks 主題 | 3blue1brown.com | ✅ 已查證 |

所有手算例子的數字都用 node 重算過（見 HANDOFF.md 的驗證段）。

## 2026-10-29 改版審查

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 0-1 | 70B 模型產生一個字約做「1,400 億次乘完再加」 | 約 700 億次乘加（約 1,400 億次浮點運算）；一次乘加 ＝ 2 FLOP | Kaplan 等 2020（https://arxiv.org/abs/2001.08361），推論 ≈ 2N FLOP／token ✅ |
| 2-2 | 「Transformer 的前饋層常把維度放大 4 倍」 | 原始 Transformer 是 4 倍；Llama 3 8B 用 SwiGLU，4096 → 14336（3.5 倍） | Llama 3 8B config.json（huggingface.co/NousResearch/Meta-Llama-3-8B，查證 2026-10-29）✅ |
| 2-2 | 「長 context 的技巧都在想辦法少算這張表」 | 改成「少算或少存」，深入段落說明 FlashAttention 不少算、只少存 | Dao 等 2022（https://arxiv.org/abs/2205.14135）✅ |

### 補的子題（深入段落）

| 課 | 子題 | 出處 | 狀態 |
|---|---|---|---|
| 0-1 | 推論 2N、訓練 6N FLOP 估算；這本沒教的數學對照 | Kaplan 等 2020 | ✅ |
| 1-1 | 類比算式要排除輸入詞；高維隨機向量 cosine ≈ ±1/√d | Nissim 等 2020（https://aclanthology.org/2020.cl-2.7/） | 🟡 論文頁查到題目與主張；「排除輸入詞」細節來自論文內文的記憶，未逐字核對 |
| 1-2 | √d 的變異數推導；cosine／點積／歐氏距離的取捨 | Vaswani 等 2017 附註 | ✅ |
| 2-1 | 萬能逼近定理；ReLU／GELU／SwiGLU；現代 LLM 不用偏差 | PaLM（https://arxiv.org/abs/2204.02311）；Llama 3 config attention_bias false | 🟡 PaLM「No biases」為記憶，未重新開論文核對；Llama 3 ✅ |
| 2-2 | 算術強度（m ＝ 1 約 1 FLOP/byte）；FlashAttention | Dao 等 2022；數字用 node 計算 | ✅ |
| 3-1 | 數值微分的捨入誤差、中央差分；ReLU 在 0 的梯度 | node 實算（eˣ 在 x ＝ 1） | ✅ 數字；PyTorch ReLU 在 0 梯度為 0：未查證文件，依原始碼行為記憶 |
| 3-2 | 方向導數 ＝ 梯度·u；條件數限制學習率；mini-batch SGD；Adam 每參數約 16 bytes | dlbook 第 4、8 章 | 🟡 16 bytes 為常見估算（ZeRO 論文的算法），未另查 |
| 3-3 | 反向模式 vs 前向模式 vs 數值微分；activation checkpointing | dlbook 6.5 | ✅ |
| 4-1 | 機率鏈鎖律；greedy、top-k、top-p | Holtzman 等 2019（https://arxiv.org/abs/1904.09751） | ✅ |
| 4-2 | 平移不變、縮放會變、二選一 ＝ sigmoid；attention sink | Xiao 等 2023（https://arxiv.org/abs/2309.17453） | ✅ |
| 5-1 | float32／float16／bfloat16 範圍；log-sum-exp | IEEE 754；PyTorch torch.finfo 文件（頁面存在，數值未列在頁上） | ✅ |
| 5-2 | CE ＝ entropy ＋ KL；bits per byte；全書一頁地圖 | dlbook 3.13 | ✅ |

### 其他

- PyTorch 最新穩定版為 2.14.1（2026-09-30），2.14 文件連結仍有效 ✅（dev-discuss.pytorch.org）。
- 深入思考題：0-1 刪除（看圖即可回答）；2-1 原題答案就在常見錯誤裡，換成前饋層參數與記憶體的計算題。
