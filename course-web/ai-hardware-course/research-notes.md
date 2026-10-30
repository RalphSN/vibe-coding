# 研究筆記：AI 系列・第五部｜硬體與運算

> 今天日期：**2026-10-23**。標記：✅ 官方或原始文件 ・ 🟡 第三方、產業估計或通則 ・ ⚠️ 未確認
> 這一卷的數字最容易過時：每個硬體與產業數字都附出處，課文寫「查證於 2026-10」。

## 0. 對課程設計影響最大的發現

| # | 發現 | 影響 |
|---|---|---|
| 1 | H100 SXM：80 GB、3.35 TB/s；FP16／BF16 Tensor Core 1,979 TFLOPS 是「含稀疏」，不含稀疏約一半（989） | 1-3、2-2 用「不含稀疏」算；特別提醒規格表的星號 |
| 2 | Rubin：每顆最多 288 GB HBM4、最高 22 TB/s，NVFP4 推論最多 50 PFLOPS，3,360 億電晶體；頻寬是 Blackwell（8 TB/s）的 2.8 倍 | 2-1 的「最新一代」數字；Blackwell Ultra 288 GB 是第三方整理 🟡 |
| 3 | 台積電 2Q26 晶圓代工市占 72.5%（營收約 402 億美元），三星 5.9%、中芯 5.4%（TrendForce） | 5-2、5-4 |
| 4 | IEA：資料中心 2024 用電約 415 TWh（約全球 1.5%），2030 約 945 TWh | 5-3（🟡 透過新聞稿轉述，IEA 頁面本次 403） |
| 5 | M4 Pro：最高 64 GB 統一記憶體、273 GB/s；macOS 預設約 75% 可給 GPU 是第三方說法 | 5-1 用使用者自己的 Mac 當例子 |

## 1. 其他事實

| 事實 | 來源 | 可信度 |
|---|---|---|
| 推論每個 token 約 2N FLOPs、訓練約 6N（每 token） | Kaplan 2020 | 🟡 通則 |
| 混合精度＋Adam 訓練約 16 位元組／參數（2＋2＋12） | ZeRO 論文本文（摘要未寫） | 🟡 |
| HBM 營收市占：SK hynix 2026Q1 約 56～58%、Q2 約 50%（各家數字不同） | IDC（SK hynix SEC 文件）、Counterpoint | 🟡 |
| 台灣廠商組裝全球約 9 成 AI 伺服器 | 產業估計（資策會 MIC 等，多方轉述） | 🟡 |
| DistilBERT：小 40%、快 60%、保留 97% 語言理解能力 | arXiv 1910.01108 | ✅ |
| 蒸餾：Hinton、Vinyals、Dean 2015 | arXiv 1503.02531 | ✅ |
| QLoRA：單張 48GB GPU 微調 65B，4-bit NF4 | arXiv 2305.14314 | ✅ |
| llama.cpp：C/C++ 推論，支援 1.5～8 位元整數量化，Apple Silicon 一級支援（Metal），MIT | GitHub | ✅ |
| Ollama：本地跑開放模型，macOS／Windows／Linux，API 在 localhost:11434，MIT | GitHub | ✅ |

## 2. 未確認清單

1. 消費級顯示卡的確切規格（各型號變動快），課文只用「24 GB 等級的消費級顯示卡」這種說法。
2. CoWoS 產能數字：不寫數字，只寫概念。

## 3. 下次重新查證

**2027-01-23**：GPU 規格（新世代）、台積電與 HBM 市占、IEA 新版數字。

## 2026-10-29 改版審查

> 改版：取消測驗、每課補「深入：」段落、5-4 改成一頁地圖。查證日期 2026-10-29～30。

### 修正的錯誤或過時內容

| 課號 | 原本 | 修正後 | 出處 | 可信度 |
|---|---|---|---|---|
| 5-3 | IEA：2024 約 415 TWh、2030 預估約 945 TWh（2025-04 版） | 加上 2025 約 485 TWh（+17%）、2030 預估約 950 TWh（2026-04 更新），圖表多一列 2025 | IEA 2026-04 新聞稿、Rigzone 2026-04-20、Our World in Data 轉述 | 🟡 IEA 頁面 403，靠轉述 |
| 5-3 | 「AI 專用資料中心用電成長超過 4 倍」 | 改成 2026 更新的「約三倍」 | 同上 | 🟡 |
| 5-2 | HBM 圖只寫 SK hynix 50～58% | 補 2Q26 三星 33%、美光 18% | Counterpoint 2Q26 | 🟡 第三方 |
| 4-3 | 價格查證日期 2026-10-22 | 重新查證 Opus 5.5 $4／$20、Haiku 5.5 $0.10／$0.50（10 萬 token 以下）仍正確，日期改 2026-10-30，補出處 | Anthropic 價格（claude-api 參考資料，快取於 2026-10-06）＋多家第三方 | ✅ |
| 5-4 | 課名「台灣的位置＋總複習」 | 「台灣的位置＋一頁地圖」 | — | — |

確認仍正確（未改）：H100 SXM 80 GB／3.35 TB/s／FP16 1,979（含稀疏）／700 W；Rubin 288 GB HBM4、22 TB/s、50 PFLOPS NVFP4（多家轉述一致，量產時程為 2026 下半年）；台積電 2Q26 72.5%、三星 5.9%、中芯 5.4%、前十大 534.9 億美元（TrendForce 2026-09-09，多家轉述一致）；Ollama gemma4 存在（標籤 e2b、e4b、26b、31b 等，第三方說法不一，課文寫「以 ollama.com/library 為準」）。課文所有拉桿預設值與 note 的數字已用 node 重算一致。

### 補進深入段落的子題

| 課 | 子題 | 出處 |
|---|---|---|
| 0-1 | 2N 的 attention 項、MoE 的啟用參數 vs 總參數 | Kaplan 2020 |
| 1-1 | 阿姆達爾定律、GPU 用大量執行緒隱藏延遲 | Wikipedia |
| 1-2 | MFU：PaLM 約 46%、Llama 3 405B 約 38～43%；Tensor Core 方塊與維度倍數 | PaLM、Llama 3 論文 |
| 1-3 | FP16 vs BF16 指數位元、FP8 E4M3／E5M2、NVFP4（16 個一組）、MXFP4（32 個一組） | NVIDIA 部落格、OCP MX 規格 |
| 2-1 | 執行框架與暫存的額外空間、MoE 容量、PCIe 5.0 x16 約 64 GB/s、macOS GPU 上限可調 | PCIe 規格（通則，🟡）、第三方 |
| 2-2 | 轉折點逐代升高（H100 BF16 295、FP8 591、Rubin FP4 約 2,270）、快取與 FlashAttention | NVIDIA 規格 |
| 2-3 | 推測解碼（輸出分布不變）、張量平行頻寬相加、MoE decode | Leviathan 2023 |
| 2-4 | PagedAttention（浪費 60～80% → 4% 以下）、MLA 少 93.3%、FP8 KV、prefix caching | vLLM、DeepSeek-V2 論文 |
| 3-1 | ZeRO 三階段（7.5B、64 卡：120／31.4／16.6／1.9 GB）、FSDP、8 位元 Adam | ZeRO 論文 |
| 3-2 | Chinchilla 每參數約 20 token vs Llama 3 8B 超過 15 兆 token；Llama 3 405B 54 天 466 次中斷 | Chinchilla、Llama 3 論文 |
| 3-3 | 連續批次、TTFT 與 token 間隔、prefill／decode 分離 | vLLM 論文、通則 |
| 4-1 | 離群值與分組量化、W4A16 vs W8A8、Q4_K_M 實際位元超過 4 | LLM.int8 論文、llama.cpp |
| 4-2 | T² 縮放、logit 蒸餾 vs 序列蒸餾、DeepSeek-R1 約 80 萬筆蒸餾樣本 | Hinton 2015、DeepSeek-R1 論文 |
| 4-3 | 路由的成本公式與適用情況、Haiku 5.5 超過 10 萬 token 的價格 | Anthropic 價格 |
| 5-1 | Ollama／llama.cpp／MLX／vLLM 比較、context 長度與 KV cache、OLLAMA_HOST 的安全問題 | Ollama FAQ |
| 5-2 | CoWoS 與矽中介層、HBM3 vs HBM4（2,048 位元、每疊約 2 TB/s）、HBM 排擠一般 DRAM；新增「最窄環節」拉桿 | JEDEC HBM4 新聞稿 |
| 5-3 | GB200 NVL72 機櫃約 120 kW、>40 kW 需液冷、IEA 點名燃氣渦輪機與變壓器、PUE 與 WUE 的取捨 | SemiAnalysis（第三方）、IEA 2026 |
| 5-4 | 全書一頁地圖、全書估算拉桿、台灣產能海外擴張、會過時的內容表 | — |

### 未查證

1. IEA 2026-04 更新的原始報告頁面（403），2025 年 485 TWh、2030 年 950 TWh 依轉述。
2. 台積電海外廠狀態（亞利桑那、熊本量產，德勒斯登建廠中）與 AI 伺服器組裝移往墨西哥、美國：依產業報導，本次沒有逐一查官方來源。
3. HBM3 每疊約 0.8 TB/s、PCIe 5.0 x16 約 64 GB/s：通則，未另查官方文件。
4. 「HBM 擴產排擠一般 DRAM」：產業普遍觀察，標 🟡。

### 下次重新查證

2027-01-30：GPU 規格、API 價格、Ollama 模型標籤、晶圓代工與 HBM 市占、IEA 數字。
