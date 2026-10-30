# 研究筆記：AI 系列・序章｜AI 全景地圖

> 今天日期：**2026-10-22**。標記：✅ 官方或原始文件直接確認 ・ 🟡 第三方或摘要 ・ ⚠️ 未確認
> 序章是地圖，不深入：每個主題只講到「知道它在哪裡、和其他東西的關係」，細節指向其他六卷。和第一部重疊的事實（token、價格、串流、API 結構）沿用 `../ai-app-engineering-course/research-notes.md`，這裡只列序章新增的。

---

## 0. 對課程設計影響最大的 5 個發現

| # | 發現 | 影響 |
|------|------|------|
| 1 | 常被引用的 Arthur Samuel「讓電腦不用明確寫程式就能學習」這句話，**不在**他 1959 年的論文裡（論文本身講的是讓程式下棋下贏設計者）。 | 1-2 不引用那句名言，改用論文本身的事實：程式從規則出發，自己調整參數，8–10 小時後下贏寫它的人 |
| 2 | 「人工智慧」這個詞出自 1955 年 9 月 2 日的 Dartmouth 計畫提案（McCarthy、Minsky、Rochester、Shannon），1956 年夏天舉行研討會。 | 1-1 時間軸的起點 |
| 3 | 深度學習的轉捩點：2012 AlexNet 在 ImageNet 拿到 15.3% top-5 錯誤率（第二名 26.2%），用兩張 GPU 訓練。 | 1-3：深度學習＋GPU 的組合從這裡開始；第五部會接上 |
| 4 | LLM 的三個里程碑：2017 Transformer、2020 GPT-3（1,750 億參數，只靠 prompt 裡的範例就能做新任務）、2022-11-30 ChatGPT。 | 1-4 時間軸 |
| 5 | 使用者原始大綱沒有定義 L1／L2／L3；本書自訂：L1 會用（知道是什麼、能判斷），L2 會做（能實作、能除錯），L3 會推導（懂原理、能從頭推或改進）。 | 模組 3，以及七卷各標一個主要深度 |

## 1. 歷史與定義（模組 1）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| Dartmouth 提案日期 1955-09-02，提案人 McCarthy、Minsky、Rochester、Shannon；提案「人工智慧」一詞；研究在 1956 年夏天於 Dartmouth College 舉行 | https://en.wikipedia.org/wiki/Dartmouth_workshop；提案本文 https://mlanthology.org/misc/1955/mccarthy1955misc-proposal | ✅（提案原文） |
| Samuel 1959〈Some Studies in Machine Learning Using the Game of Checkers〉，IBM Journal of R&D 3(3):210–229；程式約 8–10 小時的對弈後下贏設計者 | https://mlanthology.org/misc/1959/samuel1959misc-some；https://people.csail.mit.edu/brooks/idocs/Samuel.pdf | ✅ |
| 「不用明確寫程式就能學習」這句話常被歸給 Samuel，但不在 1959 論文原文中 | 多方討論 | 🟡 課程不引用 |
| AlexNet：ILSVRC-2012 top-5 錯誤率 15.3%（第二名 26.2%），6,000 萬參數，兩張 GPU 訓練 | AlexNet 論文（Krizhevsky 等 2012）；https://en.wikipedia.org/wiki/AlexNet | ✅ |
| 2018 ACM A.M. Turing Award 頒給 Bengio、Hinton、LeCun（深度學習），2019-03-27 公布 | https://www.acm.org/media-center/2019/march/turing-award-2018 | ✅ |
| Transformer：Vaswani 等〈Attention Is All You Need〉2017，完全用 attention、不用遞迴與卷積，更容易平行化 | https://arxiv.org/abs/1706.03762 | ✅ |
| GPT-3：〈Language Models are Few-Shot Learners〉2020，1,750 億參數；不更新權重，只在 prompt 放範例就能做新任務 | https://arxiv.org/abs/2005.14165 | ✅ |
| ChatGPT 2022-11-30 推出，基於 GPT-3.5 系列微調成對話 | https://openai.com/blog/chatgpt | 🟡（日期多方一致，原文未直接讀到） |

## 2. 一次請求的旅程（模組 2）

沿用第一部查證過的事實：

| 事實 | 來源 |
|------|------|
| API 無狀態；請求＝標頭＋JSON（model、max_tokens、messages） | 第一部 research-notes 1 |
| token 是讀寫與計費單位；Claude 4.7 之後 tokenizer 同樣文字約多 30% token；要用 count_tokens 量 | 第一部 1.1、1.2 |
| 串流事件順序；TTFT 與總時間 | 第一部 2 |
| Opus 5.5 $4／$20 每百萬 token；1M context | 第一部 1.1 |
| 模型逐個 token 產生（自迴歸）；每一步算出下一個 token 的機率再取樣 | Transformer 與 GPT-3 論文；第二部細講 |
| 推論時重複利用前面算過的 key／value（KV cache），所以第一個字最慢、之後每個字較快 | 業界通則 🟡；第二部 7 細講 |
| GPU 擅長大量相同的乘加運算（矩陣乘法）；AlexNet 起深度學習主要在 GPU 上訓練 | AlexNet 論文；第五部細講 |
| 中文每字約幾個 token：第三方估計差異很大（約 1～2 多個），沒有 Claude 官方數字 | ⚠️ 課程不寫數字，叫讀者用 count_tokens 量 |

## 3. 學習地圖（模組 3）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| L1／L2／L3 的定義 | 本書自訂（使用者大綱只給名稱） | — 課程明講是本書的定義 |
| 七卷的主題 | 使用者提供的大綱（2026-10-22） | — |

## 4. 未確認清單

1. ChatGPT 發布文的原文（日期多方一致）。
2. 中文每字的 token 數（各模型不同，沒有官方數字）。

## 5. 下次重新查證

**2027-01-22**（隨第一部一起）：模組 2 引用的模型名稱與價格。

## 2026-10-29 改版審查

> 改版內容：取消測驗（總複習、選擇題、分類練習），每課加「深入」段落；3-3 改寫成「一頁地圖」；m1 的 `ERA_ITEMS` 分類練習改成表格並刪除常數。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 1-5 | Dartmouth 提案日期寫 1955-09-02 | 提案文件日期 1955-08-31；Wikipedia 記 9 月 2 日為正式提出日，兩者並列 | AI Magazine 重刊 https://ojs.aaai.org/index.php/aimagazine/article/view/1904 ✅；https://en.wikipedia.org/wiki/Dartmouth_workshop ✅ |
| 0-1 | 「每一課都長一樣」寫暖身回顧、練習、模組 3 有「10 題總複習」 | 改成目前的結構（深入段落、深入思考題）與「一頁地圖」 | 本書規範 |
| 首頁說明 | 寫「暖身回顧」「選擇題送出後有解析」 | 改成本書不出測驗 | 本書規範 |

### 重新查證（2026-10-29）

| 事實 | 來源 | 可信度 |
|---|---|---|
| Opus 5.5 輸入 $4、輸出 $20／百萬 token；快取命中 $0.20（基本價 5%）；5 分鐘快取寫入 1.25 倍；Batch 輸入輸出皆 5 折 | https://platform.claude.com/docs/en/about-claude/pricing | ✅ |
| API 錯誤：400 invalid_request_error、401 authentication_error、429 rate_limit_error、529 overloaded_error；SDK 預設自動重試 2 次；串流開始後的錯誤以事件送出 | https://platform.claude.com/docs/en/api/errors | ✅ |
| Opus 5.5 思考一律開啟（不可 disabled） | 同上 errors 頁 | ✅ |
| 思考 token 以輸出 token 計費 | Claude Docs（未在本次重讀原文） | 🟡 |
| Gmail 2019-02-06：TensorFlow 模型每天多擋約 1 億封垃圾信；既有防護是 ML 加規則 | https://workspace.google.com/blog/product-announcements/ridding-gmail-of-100-million-more-spam-messages-with-tensorflow | ✅（搜尋摘要＋多家報導） |

### 補的子題（深入段落）

| 課 | 子題 | 出處與可信度 |
|---|---|---|
| 0-1 | 前導組織（Ausubel 1960 年代）、什麼時候可以跳過序章 | 教育心理學通論 🟡 未查證原文 |
| 1-1 | 專家系統的知識擷取瓶頸、規則與 ML 混用、AI 效應 | Gmail 部落格 ✅；其餘通論 🟡 |
| 1-2 | 泛化、訓練／測試切分、自監督式學習；拉桿：手動調參數看平均誤差 | 通論 ✅ |
| 1-3 | 2012 的條件（ImageNet、GPU、ReLU、dropout；AlexNet 訓練 5–6 天）；表格資料上樹模型常勝（45 個資料集） | AlexNet 論文 ✅；https://arxiv.org/abs/2207.08815 ✅；拉桿：全連接網路參數量 |
| 1-4 | 縮放定律；InstructGPT 1.3B 勝過 175B GPT-3 的偏好結果；LLM 邊界表 | https://arxiv.org/abs/2001.08361 ✅；https://arxiv.org/abs/2203.02155 ✅ |
| 1-5 | AI 寒冬（Lighthill 報告 1973、80 年代末）；ImageNet 2009、CUDA 2007；垃圾信過濾四個年代 | 通論 🟡；「2000 年代初統計式過濾器流行」未查證原始文獻 ⚠️ |
| 2-1 | 無狀態 API、各站的錯誤碼 | Claude API errors ✅ |
| 2-2 | BPE 原理與推出的現象（少見語言、程式碼、換代 token 數、數字母） | https://arxiv.org/abs/1508.07909 ✅；換代多約 3 成沿用第一部筆記 |
| 2-3 | 記憶體頻寬瓶頸：70B×2 bytes＝140 GB ÷ 3.35 TB/s ≈ 42 ms／token；batching、量化、切多卡 | H100 SXM 3.35 TB/s 為 NVIDIA 規格，本次未重讀官方頁 🟡 |
| 2-4 | temperature 數學（分數 2 與 1：T＝0.5／1／2 → 88／73／62%，node 計算）；prefill 與 decode；KV cache 佔記憶體 | 計算 ✅；通論 🟡 |
| 2-5 | 三個省錢槓桿與不適用時機；1,500 token 快取時月費 540 → 369 美元（node 計算） | Pricing ✅ |
| 3-1 | Bloom 分類法（2001 修訂）、流暢錯覺；拉桿：各層時數（示意值） | 通論 🟡；時數為本書示意 |
| 3-2 | 先修順序的理由、即時學習的取捨；先修追蹤三個情境 | 本書規劃 |
| 3-3 | 改寫為一頁地圖：模組表、路線週數拉桿（課數 14／39／28／24／25／18／12 取自各卷 c-data）、會過時內容與更新方式 | 本書規劃 |

### 未查證

1. 「2000 年代初統計式（貝氏）垃圾信過濾器流行」：嘗試讀 Paul Graham〈A Plan for Spam〉原文時工具額度中斷，未讀到。
2. H100 SXM 記憶體頻寬 3.35 TB/s：未重讀 NVIDIA 官方頁。
3. Ausubel 前導組織、Bloom 修訂版、AI 寒冬年份：通論，未逐一讀原始文獻。

### 下次重新查證

**2027-01-29**：模型名稱、價格、快取與 Batch 折扣、API 錯誤碼。
