# 研究筆記：AI 系列・第二部｜大型語言模型原理

> 今天日期：**2026-10-22**。標記：✅ 原始論文或官方文件直接確認 ・ 🟡 第三方或記憶、未逐字核對 ・ ⚠️ 未確認
> Claude 的架構、資料、訓練細節沒有公開；課文只講公開論文裡的通用做法，提到 Claude 時只用官方文件寫的事。

## 0. 對課程設計影響最大的發現

| # | 發現 | 影響 |
|---|---|---|
| 1 | Transformer 原論文 base 模型：6 層、d_model 512、8 個頭、d_k＝64、d_ff 2048；attention＝softmax(QKᵀ/√d_k)V，除以 √d_k 是因為點積的變異數會隨 d_k 變大、把 softmax 推進梯度很小的區域 | 3-3 用這個理由解釋縮放；4-4 用這組數字算參數 |
| 2 | 原論文每個子層是 LayerNorm(x ＋ Sublayer(x))（post-LN）；後來很多模型把 LN 移到子層前（pre-LN，Xiong 2020 分析過訓練較穩） | 4-3 兩種都講，標明「現代模型多半 pre-LN」是通則 🟡 |
| 3 | Chinchilla：同樣算力，70B 參數、約 4 倍資料的模型贏過 280B 的 Gopher；結論是參數與資料要等比例放大 | 5-3 的主軸；「每參數約 20 token」標為經驗法則 🟡 |
| 4 | InstructGPT：1.3B 的 InstructGPT 輸出比 175B GPT-3 更受人類評分者偏好；流程 SFT → 排序資料 → RL | 6-1、6-2 |
| 5 | Kalai 等 2025：幻覺來自預訓練的統計誤差，且評測給「猜」比「說不知道」更高分，所以一直存在 | 7-4 的主軸 |

## 1. 各模組事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| BPE 用來把詞切成子詞，處理罕見詞（Sennrich 等，2015 投稿、2016 發表） | arXiv 1508.07909 | ✅ |
| word2vec（Mikolov 等 2013）；King − Man ＋ Woman 接近 Queen 的例子出自 Mikolov、Yih、Zweig 2013 | arXiv 1301.3781；ACL N13-1090 | ✅（例子來自摘要轉述） |
| 正弦位置編碼；原論文也說學出來的位置向量結果幾乎一樣 | 1706.03762 | ✅ |
| RoPE 旋轉位置編碼 | 2104.09864 | 🟡 只引用名稱與概念 |
| 殘差連接（He 2015）、Layer Norm（Ba 2016） | 1512.03385、1607.06450 | 🟡 引用概念 |
| Kaplan 2020：損失隨模型大小、資料量、算力呈冪律下降 | 2001.08361 | ✅ |
| Chinchilla 擬合式 L(N,D)＝E＋A/N^α＋B/D^β（E 1.69、A 406.4、B 410.7、α 0.34、β 0.28） | 2203.15556 | 🟡 記憶值，後續有重新擬合的爭議；5-3 互動只用來畫形狀並註明 |
| 訓練算力約 6 × 參數 × token（FLOPs） | Kaplan 2020 | 🟡 通則 |
| DPO：不用獨立獎勵模型與 RL，直接用偏好資料最佳化 | 2305.18290 | ✅ |
| Constitutional AI：用一組原則讓 AI 自己批改，減少人工標註有害內容 | 2212.08073 | 🟡 概念 |
| DeepSeek-R1：純 RL 就能誘發推理行為（自我反思、驗證） | 2501.12948 | ✅（GRPO 名稱未在摘要確認，課文不提） |
| nucleus（top-p）取樣：只從累積機率達 p 的最小集合抽 | 1904.09751 | ✅ |
| Lost in the Middle：相關資訊在長輸入中間時表現下降 | 2307.03172 | ✅ |
| Claude Opus 5.5 context window 1M token；API 2026-10-21 版移除 temperature、top_p、top_k | 第一部 research-notes | ✅（沿用） |
| KV cache：推論時存下前面 token 的 key／value | 業界通則 | 🟡 |

## 2. 未確認清單

1. Chinchilla 擬合常數（只用來畫趨勢，不拿來預測）。
2. 任何 Claude 的層數、參數量、資料量：沒有公開，課文不寫。

## 3. 下次重新查證

**2027-01-22**：7-1、7-2 提到的 Claude API 參數與 context window。

## 2026-10-29 改版審查

> 改版：取消測驗，每課補「深入：」段落；7-5 改成一頁地圖。查證日期 2026-10-29。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 3-1 | 心智模型圖底部寫「87% × 動物的 V ＋ 4% × 馬路的 V」，和上方 softmax 的 83%、3% 不一致 | 改成 83%、3% | 圖內數字自洽 |
| 7-1 | 表格寫 2026-10-21 版移除取樣參數後「改用 prompt 與 `effort` 等設定控制」 | 官方明說沒有其他設定能取代 temperature；一律用預設（temperature 1.0），連送預設值都回 400；Claude 4.7 之後的模型本來就只接受預設值 | https://platform.claude.com/docs/en/api/migration-2026-10-21 ✅ |
| 7-1 | 常見錯誤的正確做法「改用 prompt 與 API 提供的其他設定」 | 不送這些參數；穩定輸出靠結構化輸出、清楚的 prompt、程式端驗證 | 同上 ✅ |
| 6-4 | 推理模型的例子寫「Claude 的 extended thinking」 | Opus 5.5 是 adaptive thinking，一律開啟、不能關（送 disabled 回 400），用 effort 調深度；display 預設 omitted | https://platform.claude.com/docs/en/build-with-claude/thinking ✅ |
| 6-4 | 拉桿說明沒提思考不能關 | 補「Opus 5.5 思考無法關閉，拉到 0 只是對照」與思考 token 以輸出價計費 | 同上、Context windows ✅ |
| 4-3 | 拉桿說明「把 4 個數同時加 5」，但預設值加 5 會超出拉桿上限 10 | 改成「加 2」 | 拉桿範圍 |
| 6-2 | callout「你剛剛做的就是偏好標註」指向已刪除的分類練習 | 改成「上面每一列就是一筆偏好標註」 | — |

### 重新查證（仍正確）

| 事實 | 來源 | 可信度 |
|---|---|---|
| Opus 5.5：$4／$20 每百萬 token（輸入／輸出） | https://platform.claude.com/docs/en/about-claude/pricing | ✅ |
| Opus 5.5、Sonnet 5.5、Haiku 5.5 等 1M context、單次輸出最多 128k；輸入超過回 400；輸入＋max_tokens 超過時以 `model_context_window_exceeded` 停止（Claude 4.5 之後） | https://platform.claude.com/docs/en/build-with-claude/context-windows | ✅ |
| 思考 token 以輸出價計費；Opus 5.5 等新模型預設保留前幾輪思考在 context，以輸入價計 | 同上 | ✅ |
| GPT-3 資料表（Common Crawl 410B／60%／0.44 輪，WebText2 19B／22%／2.9 輪，Books1 12B／8%／1.9，Books2 55B／8%／0.43，Wikipedia 3B／3%／3.4） | Brown 等 2020 表 2.2 | 🟡 記憶值，未逐字核對原表 |
| GPT-3 參數驗算 12Ld²＋Vd ≈ 1,746 億 | 計算 | ✅ |

### 補上的子題（深入段落）

| 課 | 子題 | 來源 | 可信度 |
|---|---|---|---|
| 0-1 | 輸出比輸入貴的原因（prefill 平行 vs decode 逐一）；多模態與 MoE 在六站中的位置 | Claude Pricing、Fedus 2021 | ✅ |
| 1-1 | 空格、大小寫、全半形改變 token；SentencePiece 的 ▁ | Kudo、Richardson 2018 | ✅ |
| 1-2 | 預先切段、位元組 BPE、WordPiece／Unigram；訓練不足的怪 token | Sennrich 2015、SentencePiece | 🟡 WordPiece 挑選準則為通則描述 |
| 1-3 | 詞彙表大小趨勢（GPT-2/3 50,257、Llama 3 約 128K）、weight tying、數字逐位切分 | Brown 2020、Llama Team 2024、Press & Wolf 2016 | ✅／🟡（Llama 逐位切數字為記憶） |
| 1-4 | 多輪對話重送歷史（新拉桿）、對話格式錯誤的症狀 | Claude Docs｜Context windows | ✅ |
| 2-1 | 查表 vs one-hot 計算量（新拉桿）、罕見 token 向量練不熟 | 計算、通則 | ✅／🟡 |
| 2-2 | 類比示範排除輸入詞的小字、詞向量偏見 | Nissim 2020、Bolukbasi 2016 | ✅ |
| 2-3 | 拉長 context：先短後長、位置插值、YaRN | Peng 2023、Llama Team 2024 | ✅ |
| 3-1 | RNN vs attention 的取捨 | Bahdanau 2014、Vaswani 2017 | ✅ |
| 3-2 | K、V 分開的理由；MHA／GQA／MQA | Ainslie 2023 | ✅ |
| 3-3 | softmax 溢位、FlashAttention 精確且省記憶體 | Dao 2022 | ✅ |
| 3-4 | 歸納頭、很多頭可移除 | Olsson 2022、Michel 2019 | ✅ |
| 4-1 | SwiGLU（d_ff≈8/3d）、MoE（新拉桿：一層參數分布） | Shazeer 2020、Fedus 2021 | ✅ |
| 4-2 | 殘差沒解決的事、拿掉中間層影響小 | 研究觀察 | 🟡 |
| 4-3 | RMSNorm、pre-LN 的最終 LN | Zhang & Sennrich 2019 | ✅ |
| 4-4 | 總參數 vs 活躍參數、KV cache 才是推論記憶體大戶 | Fedus 2021 | ✅ |
| 5-1 | 損失不能跨 tokenizer 比、驗證損失、訓練與推論的落差 | 通則 | 🟡 |
| 5-2 | 配比與輪數（新拉桿）、去重減少背誦、資料牆、合成資料 | Lee 2021、Llama Team 2024 | ✅；網站排除 AI 爬蟲比例 ⚠️ 未查證，課文只寫趨勢 |
| 5-3 | 過度訓練小模型（Llama 3 8B 15T token ≈ 1,900／參數）、Chinchilla 重新擬合 | Llama Team 2024、Besiroglu 2024 | ✅ |
| 6-1 | SFT 佔比（新拉桿）、LIMA、SFT 灌新知識增加幻覺 | Zhou 2023、Gekhman 2024 | ✅ |
| 6-2 | Bradley–Terry（新拉桿）、獎勵模型過度最佳化、長度偏好與 sycophancy | Gao 2022 | ✅ |
| 6-3 | 拒絕門檻取捨（新拉桿，示意分布）、2026-01 新版 Claude 憲法、Constitutional Classifiers | Anthropic 2026-01 公告、Sharma 2025 | ✅（憲法優先順序來自公告與媒體報導 🟡） |
| 6-4 | 思考過程不一定忠實、Opus 5.5 思考設定表 | Chen 2025、Claude Docs｜Thinking | ✅ |
| 7-1 | top-k／top-p／min-p、推測解碼 | Nguyen 2024、Leviathan 2022 | ✅ |
| 7-2 | Claude context 規則表 | Claude Docs｜Context windows | ✅ |
| 7-3 | GQA、滑動視窗、KV 量化、PagedAttention、前綴共用 | Ainslie 2023、Kwon 2023 | ✅ |
| 7-4 | 校準：預訓練模型校準較好、後訓練變差；幻覺來源對照表 | GPT-4 技術報告 2023 | ✅ |
| 7-5 | 一頁地圖：模組重點表、會過時的內容表 | — | — |

### 深入思考題

保留 22 題、刪 6 題（1-4、3-1、4-1、5-3、6-2、7-3：看完課文或深入段落就能直接找到答案）。

### 未查證

- 各家主流大型模型是否仍全部用子詞 tokenizer（1-1 已標「未查證」）。
- 網站排除 AI 爬蟲的實際比例（5-2 只寫趨勢、標未查證）。
- Llama 系列逐位切數字、WordPiece 的挑選準則：記憶值，未重新開原文核對。

### 下次查證

**2027-01-29**：7-1 取樣參數、7-2 context 規則、6-4 思考設定、0-1／6-4 價格。
