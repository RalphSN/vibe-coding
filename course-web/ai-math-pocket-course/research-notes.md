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
