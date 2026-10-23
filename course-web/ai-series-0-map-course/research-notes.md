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
