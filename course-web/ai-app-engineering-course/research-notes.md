# 研究筆記：AI 系列・第一部｜AI 應用工程

> 今天日期：**2026-10-22**。「查證」指 2026-10-22 讀到的官方文件、規格或第三方頁面。
> 標記：✅ 官方文件直接確認 ・ 🟡 第三方或摘要 ・ ⚠️ 截至 2026-10 查證狀態：未確認
> 課程的程式碼範例以 **Claude API + TypeScript（Node）** 為主，另附 cURL。其他廠商只做「概念對照」，不寫死價格與參數細節（變動太快、來源互相矛盾）。

---

## 0. 對課程設計影響最大的 8 個發現

| # | 發現 | 影響 |
|---|------|------|
| 1 | **Claude API 新版本 `2026-10-21` 移除 `temperature`、`top_p`、`top_k`**：送出就回 400，連預設值也不行。Claude 4.7 之後的模型本來就只接受預設值。 | 1-3 不能照舊教「調 temperature」。改教：temperature 是什麼（取樣原理，第二部會深入）→ 為什麼新模型拿掉 → 現在用 `effort` 與 prompt 控制輸出 |
| 2 | OpenAI GPT-5 之後的推理模型也限制 temperature（用 `reasoning.effort`）；Gemini 3 官方建議 temperature 保持預設 1.0。 | 1-3 的跨廠商對照：三家方向一致，都從「調隨機度」轉向「調思考深度」 |
| 3 | 預設模型 `claude-opus-5-5`：$4／$20 每百萬 token（輸入／輸出），1M context、128K 輸出上限；思考不能關，`effort` 預設 `medium`。 | 1-5、8-2 的成本計算用這組數字 |
| 4 | Claude 4.7 之後的 tokenizer：同樣文字約多 30% token。 | 1-4：token 數依模型而異，要用 `count_tokens` 量，不能用別家的 tokenizer 估 |
| 5 | 結構化輸出用 `output_config.format`（舊的 `output_format` 已棄用）；TS SDK 有 `messages.parse()` + `zodOutputFormat()`。不再支援 assistant prefill（回 400）。 | 3-4、3-5：不教「預填 `{` 讓模型吐 JSON」這個舊技巧，改教 schema |
| 6 | Opus 5.5／Sonnet 5.5／Fable 5.1 **不接受強制工具呼叫**（`tool_choice` 的 `any`、`tool` 回 400）；改用 `auto` + prompt 指示 + `strict: true`。 | 4-2、4-3：教 `auto`，並說明為什麼要檢查「模型到底有沒有呼叫」 |
| 7 | **MCP 2026-07-28 規格**是上線以來最大改版：拿掉 `initialize` 握手與 `Mcp-Session-Id`，協定變成無狀態；標準傳輸剩 stdio 與 Streamable HTTP（每則訊息一個 POST，回覆是 JSON 或該請求專屬的 SSE 串流）。 | 7-4、7-5 以新規格為準，舊版只在「你會在舊教學看到」帶過 |
| 8 | Anthropic 沒有自己的 embedding 模型，官方文件推薦 Voyage AI（2026 年由 MongoDB 提供，`voyage-4` 系列）。 | 5-4：選模型時講「為什麼聊天模型公司不一定做 embedding」 |

---

## 1. LLM API 基礎（模組 1）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 所有功能都走同一個端點 `POST /v1/messages`；工具、結構化輸出都是這個端點的參數 | claude-api skill（快取 2026-10-06）；https://platform.claude.com/docs/en/api/messages | ✅ |
| 請求標頭：`x-api-key`、`anthropic-version`、`content-type: application/json` | 同上 | ✅ |
| API 版本 `2026-10-21`：移除 `temperature`／`top_p`／`top_k`；`document` 區塊不能放在 assistant 訊息；user 訊息的 text 不能帶 `citations` | https://platform.claude.com/docs/en/api/migration-2026-10-21 | ✅ |
| 角色：`system`（頂層欄位）、`user`、`assistant`；API 無狀態，對話歷史每次都要整包送 | Messages API 文件 | ✅ |
| 部分新模型支援在 `messages` 中途插入 `role: "system"` 訊息（Opus 5.5 等），用來加營運方指示且不破壞快取 | claude-api skill「Mid-Conversation System Messages」 | ✅ 課程只在 8-4 提一句 |
| `stop_reason`：`end_turn`、`max_tokens`、`tool_use`、`refusal`、`pause_turn`、`stop_sequence` | claude-api skill | ✅ |
| `refusal`：HTTP 200 但 `stop_reason: "refusal"`，`stop_details` 有類別；讀 `content` 前先檢查 | 同上 | ✅ |
| Opus 5.5 思考不能關，用 `output_config.effort`（`low`／`medium`／`high`／`xhigh`／`max`）控制深度與花費；預設 `medium` | 同上 | ✅ |
| 不支援 assistant prefill（最後一則是 assistant 的預填會回 400） | 同上 | ✅ |
| SDK 預設逾時 10 分鐘、自動重試 2 次（408／409／429／5xx 與連線錯誤）；TS 的 timeout 單位是毫秒 | 同上 | ✅ |

### 1.1 價格（2026-10-22，Claude API 第一方）

| 模型 | 輸入 $/MTok | 輸出 $/MTok | 快取讀取 | 備註 |
|------|------|------|------|------|
| Claude Fable 5.1 | 10 | 50 | 0.25 | 最強 |
| Claude Opus 5.5 | 4 | 20 | 0.20 | **課程預設** |
| Claude Sonnet 5.5 | 2 | 10 | 0.10 | |
| Claude Haiku 5.5 | 0.10（≤100K）／0.50（>100K） | 0.50／2.50 | 0.01／0.05 | 依 prompt 長度分兩段價 |

來源：https://platform.claude.com/docs/en/about-claude/pricing ✅
（注意：claude-api skill 快取寫 Sonnet 5.5 快取讀取 $0.20，官方價格頁是 $0.10＝0.05 倍，以價格頁為準。）

| 計費規則 | 數字 | 來源 |
|------|------|------|
| 5 分鐘快取寫入 | 1.25 倍輸入價 | 價格頁 ✅ |
| 1 小時快取寫入 | 2 倍輸入價 | 價格頁 ✅ |
| 快取讀取 | 一般 0.1 倍；Opus 5.5、Sonnet 5.5 是 0.05 倍；Fable 5.1 是 0.025 倍 | 價格頁 ✅ |
| Batch API | 輸入、輸出都打 5 折，可和快取疊加 | 價格頁 ✅ |
| 1M context 一律標準價（Haiku 5.5 例外） | — | 價格頁 ✅ |
| 有工具時的系統 prompt 額外 token：Opus 5.5／Sonnet 5.5／Haiku 5.5 為 286 tokens（auto） | — | 價格頁 ✅ |
| `inference_geo: "us"` 價格 ×1.1 | — | 價格頁 ✅ |
| Claude 4.7 之後 tokenizer 同樣文字約多 30% token | — | 價格頁 ✅ |

### 1.2 其他廠商（只做概念對照）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| OpenAI 官方模型頁（2026-10-22）推薦：`gpt-6-astra`（$10／$50）、`gpt-6.1-sol`（$2／$10）、`gpt-6-luna`（$0.10／$0.50）；模型透過 Responses API 提供 | https://developers.openai.com/api/docs/models | ✅（頁面直接讀到） |
| OpenAI 是否仍建議新專案用 Chat Completions | — | ⚠️ 未確認：課程只寫「OpenAI 目前主推 Responses API」 |
| GPT-5 系列推理模型不接受 temperature／top_p（只接受預設 1），改用 `reasoning.effort` | 社群與第三方文件 | 🟡 |
| Gemini：Interactions API 2026-06 GA，成為新專案推薦介面；`generateContent` 標為 legacy 但仍支援 | https://ai.google.dev/gemini-api/docs/interactions（搜尋摘要） | 🟡 |
| Gemini 3 官方建議 temperature 維持預設 1.0；用 `thinking_level` 控制思考深度 | https://ai.google.dev/gemini-api/docs/generate-content/gemini-3 | 🟡（搜尋摘要） |
| 其他廠商的價格 | 多個第三方互相矛盾 | ⚠️ 課程不寫 |

### 1.3 錯誤碼、速率限制、思考計費（2026-10-22 補讀官方頁）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 錯誤碼：400 invalid_request、401 authentication、402 billing、403 permission、404 not_found、409 conflict、413 request_too_large、429 rate_limit、500 api_error、504 timeout、529 overloaded；錯誤 JSON 有 `error.type`、`error.message`、`request_id` | https://platform.claude.com/docs/en/api/errors | ✅ |
| 串流時錯誤可能在 200 之後才出現（mid-stream error event） | 同上 | ✅ |
| prefill 會回 400：「This model does not support assistant message prefill」 | 同上 | ✅ |
| 速率限制分 RPM、ITPM、OTPM；token bucket；429 帶 `retry-after` 時照它等 | https://platform.claude.com/docs/en/api/rate-limits | ✅ |
| 多數模型的快取讀取 token 不算進 ITPM（快取等於提高吞吐量） | 同上 | ✅ |
| 每月花費上限：Start $500、Build $1,000、Scale $200,000；到上限回 429 但**沒有** `retry-after`，重試無效 | 同上 | ✅ |
| Start tier：Opus 5.5 為 1,000 RPM、2,000,000 ITPM、400,000 OTPM | 同上 | ✅ |
| 思考 token 以輸出計費；`display` 只影響看得到什麼，不影響計費；`usage.output_tokens_details.thinking_tokens` 可看思考花了多少 | https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost | ✅ |
| effort 改變會讓快取失效（effort 會寫進 prompt） | 同上 | ✅ |
| `max_tokens` 是思考＋回答的總上限 | 同上 | ✅ |
| effort 預設：多數模型 `high`；Opus 5.5 與 Haiku 5.5 為 `medium` | https://platform.claude.com/docs/en/build-with-claude/effort | ✅ |

---

## 2. 串流（模組 2）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| SSE MIME type `text/event-stream`，UTF-8；欄位 `data`、`event`、`id`、`retry`；空行結束一個事件；`:` 開頭是註解（可當心跳） | https://html.spec.whatwg.org/multipage/server-sent-events.html | ✅ |
| `EventSource` 只有 `withCredentials` 選項：**只能 GET、不能自訂標頭**，所以不能直接拿來打需要 POST body 的 LLM API | 同上 | ✅ |
| `EventSource` 斷線會自動重連並送 `Last-Event-ID`；204 表示停止重連 | 同上 | ✅ |
| Claude 串流事件順序：`message_start` → `content_block_start` → `content_block_delta`（`text_delta`）×N → `content_block_stop` → `message_delta`（帶 `stop_reason`、usage）→ `message_stop`；中間可能有 `ping` | claude-api skill streaming.md | ✅ |
| TS SDK：`client.messages.stream()`；`stream.on("text")` 拿增量文字；`finalMessage()` 拿完整訊息 | 同上 | ✅ |
| 取消：前端 `AbortController` 中止 `fetch`；SDK 的 stream 也能 abort；**已產生的輸出 token 仍計費** | MDN AbortController；計費為一般原則 | ✅／🟡（「中止後已產生部分仍計費」為業界通則，未找到 Claude 文件逐字寫明） |
| 思考區塊預設 `display: "omitted"`，串流時會看到一段沒有文字的等待；要顯示摘要設 `display: "summarized"` | claude-api skill | ✅ |
| 長輸出（大 `max_tokens`）建議一律串流，避免 HTTP 逾時 | claude-api skill | ✅ |

### 2.1 TypeScript SDK 串流細節（2026-10-22 讀 anthropic-sdk-typescript helpers.md）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| `stream.abort()` 中止串流與進行中的網路請求，等於 `stream.controller.abort()`；也可以在 `for await` 裡 `break` | https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md | ✅ |
| MessageStream 事件：`connect`、`streamEvent`、`text`、`inputJson`、`message`、`contentBlock`、`finalMessage`、`error`、`abort`、`end` | 同上 | ✅ |
| `await stream.finalMessage()`、`await stream.finalText()` | 同上 | ✅ |
| 請求的第二個參數可帶 `{ signal }`（toolRunner 有範例；`messages.stream()` 頁面未直接示範） | 同上 | 🟡 課程用 `stream.abort()` |
| `npm install @anthropic-ai/sdk`；不帶參數的 `new Anthropic()` 從 `ANTHROPIC_API_KEY` 讀金鑰 | claude-api skill typescript README | ✅ |
| `client.messages.countTokens({ model, messages })` → `.input_tokens`；端點 `POST /v1/messages/count_tokens` | claude-api skill token-counting.md | ✅ |
| Opus 5.5 思考一律開啟，回應 `content` 可能先有 `thinking` 區塊（預設 `display: "omitted"`，文字是空的），讀取時要篩 `type === "text"` | claude-api skill | ✅ |

---

## 3. Prompt 工程與結構化輸出（模組 3）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 結構化輸出：`output_config: { format: {...} }`；TS 用 `client.messages.parse()` + `zodOutputFormat(schema)`，結果在 `parsed_output`（解析失敗為 null） | claude-api skill tool-use.md | ✅ |
| 舊參數 `output_format` 已棄用 | 同上 | ✅ |
| Citations 與 `output_config.format` 不能同時用（400） | 同上 | ✅ 6-4 會提到 |
| prompt 建議：清楚直接、給背景與目的、用範例、用 XML 標籤分隔資料與指示；新模型對過度強硬的語氣（全大寫、「一定要」）反應過度 | https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/overview；claude-api skill（prompt-audit） | ✅ |
| 寫給舊模型的 prompt 在新模型上常「太規定」反而降低品質 | claude-api skill（Fable 5.1 遷移說明） | ✅ |

### 3.1 結構化輸出與快取、批次細節（2026-10-22 讀 claude-api skill）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 結構化輸出支援的模型：Fable 5／5.1、Opus 5.5／5／4.8、Sonnet 5.5／5、Haiku 5.5／4.5 等 | claude-api skill tool-use-concepts.md | ✅ |
| JSON Schema 支援：基本型別、`enum`、`const`、`anyOf`、`allOf`、`$ref`；字串格式 `date-time`、`date`、`email`、`uri`、`uuid` 等；**每個物件都要 `additionalProperties: false`** | 同上 | ✅ |
| 不支援：遞迴 schema、數值限制（`minimum`、`maximum`）、字串長度限制（`minLength`、`maxLength`）、複雜陣列限制；TS／Python SDK 會自動移除這些限制、改在用戶端驗證 | 同上 | ✅ |
| Citations 與 `output_config.format` 不能同時用（400） | claude-api skill | ✅ |
| 快取最小前綴依模型而不同：最新一代約 512 token（skill 註明使用前查官方文件），Opus 4.6／Haiku 4.5 為 4096；不到最小值不會報錯，只是不快取 | claude-api skill prompt-caching.md | 🟡 課程寫「依模型不同，太短不會快取」 |
| 快取是前綴比對，順序 tools → system → messages；最多 4 個斷點；快取依 workspace 隔離 | 同上 | ✅ |
| Batch：多數一小時內完成，最長 24 小時；每批最多 100,000 筆 | claude-api skill batches.md；rate limits 頁 | ✅ |
| Tool Runner（beta）：`client.beta.messages.toolRunner(...)`＋`betaZodTool` | claude-api skill | ✅ |

## 4. Tool use（模組 4）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| 工具定義：`name`、`description`、`input_schema`（JSON Schema）；`strict: true` 保證參數符合 schema（需 `additionalProperties: false` 與 `required`） | claude-api skill | ✅ |
| 流程：回應 `stop_reason: "tool_use"` → 你的程式執行 → 下一則 user 訊息放 `tool_result`（帶相符的 `tool_use_id`）→ 直到 `end_turn` | claude-api skill tool-use-concepts.md | ✅ |
| 平行工具呼叫預設開啟：所有 `tool_result` 要放在**同一則** user 訊息 | 同上 | ✅ |
| 工具失敗回 `is_error: true`，不要丟掉 | 同上 | ✅ |
| 執行工具前先檢查 `stop_reason` 是否為 `max_tokens`／`refusal`（參數可能被截斷） | 同上 | ✅ |
| Opus 5.5 等不接受 `tool_choice` 的 `any`／`tool`；用 `auto` + 指示 + 檢查有沒有呼叫 | 同上 | ✅ |
| 解析工具參數一律 `JSON.parse`，不要比對字串（不同模型跳脫方式不同） | 同上 | ✅ |
| SDK 的 Tool Runner（beta）可以代跑迴圈；也可以自己寫迴圈 | 同上 | ✅ |
| 伺服器端工具（web search、code execution）在 Anthropic 端執行，可能回 `pause_turn` | 同上 | ✅ 只在 4-1 提一句 |

## 5. Embedding 與向量搜尋（模組 5）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| Anthropic 不提供 embedding 模型；文件推薦 Voyage AI（MongoDB）：`voyage-4-large`（品質最好）、`voyage-4`（平衡）、`voyage-4-lite`（低延遲低成本）、`voyage-code-4`、開源 `voyage-4-nano`（Apache 2.0） | https://platform.claude.com/docs/en/build-with-claude/embeddings | ✅ |
| voyage-4 系列：context 32,000 tokens；維度 1024（預設）、256、512、2048 | 同上 | ✅ |
| `input_type`：查詢用 `query`、文件用 `document`，會在前面加不同的提示語 | 同上 | ✅ |
| Voyage embedding 已正規化為長度 1：點積＝cosine，cosine 與歐氏距離排序相同 | 同上 | ✅ |
| Matryoshka：可取前 N 維再重新正規化 | 同上 | ✅ |
| 量化：`int8` 省 4 倍、`binary` 省 32 倍儲存 | 同上 | ✅ |
| Reranker：`rerank-3`、`rerank-3-lite`（2026-09-30） | 同上 | ✅ |
| `voyage-context-4`：產生「帶整份文件脈絡」的切塊向量 | 同上 | ✅ |
| OpenAI `text-embedding-3-small`：1536 維、$0.02／MTok；`-large` $0.13；可用 `dimensions` 縮短 | https://developers.openai.com/api/docs/models/text-embedding-3-small | ✅ |
| Voyage 價格 | MongoDB 帳務頁，未讀到 | ⚠️ 課程不寫數字 |
| 近似最近鄰（ANN）索引如 HNSW：用多層圖加速搜尋，犧牲少量準確度 | Malkov & Yashunin 2016（arXiv:1603.09320） | ✅（演算法論文，不會變） |
| pgvector 提供 HNSW 與 IVFFlat 索引 | https://github.com/pgvector/pgvector | ✅（常年穩定，未逐字重讀） |

## 6. RAG（模組 6）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| Contextual Retrieval（Anthropic，2024-09）：每塊加上 50–100 token 的文件脈絡說明；contextual embeddings 降低前 20 塊檢索失敗率約 35%，加 contextual BM25 約 49%（5.7%→2.9%），再加 rerank 約 67%（→1.9%） | https://www.anthropic.com/news/contextual-retrieval（多個二手來源一致轉述） | 🟡（原文未直接讀取，數字多來源一致） |
| Citations：`document` 區塊設 `citations: {enabled: true}`，回應的 text 區塊帶 `citations`（`cited_text`、位置） | claude-api skill | ✅ |
| Claude 4.6 之後 1M context 標準價（長 context 是 RAG 的替代方案之一） | 價格頁 | ✅ |
| 切塊大小、重疊沒有標準答案，要用自己的資料評估 | 業界共識 | 🟡 課程用「實驗」而非給定數字 |

## 7. Agent 與 MCP（模組 7）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| Anthropic〈Building effective agents〉（2024-12）：workflow（程式決定流程）vs agent（模型決定流程）；常見模式：prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer；建議從最簡單的做起 | https://www.anthropic.com/engineering/building-effective-agents | ✅（沿用 ai-chat-prompt-agent-course 的查證） |
| 選 agent 前的四個檢查：任務複雜度、價值、模型做得到、錯誤代價 | claude-api skill | ✅ |
| Task budget（beta）：給 agent 迴圈 token 上限，讓模型自己控制節奏 | claude-api skill | ✅ 7-2 提一句 |
| MCP 最新規格版本 **2026-07-28**（RC 2026-05-21） | https://modelcontextprotocol.io/docs/learn/versioning；https://blog.modelcontextprotocol.io | ✅ |
| 2026-07-28：移除 `initialize` 握手（SEP-2575）與 `Mcp-Session-Id`（SEP-2567），任何伺服器實例都能回任何請求；新增 `server/discover` | 同上與第三方解讀 | ✅／🟡（SEP 編號來自第三方） |
| 訊息格式 JSON-RPC、UTF-8；伺服器不主動發 JSON-RPC 請求；每個請求在 `_meta` 帶協定版本與用戶端能力 | https://modelcontextprotocol.io/specification/2026-07-28/basic/transports | ✅ |
| 標準傳輸：stdio（子行程，換行分隔）、Streamable HTTP（每則訊息 POST 到單一端點，回 JSON 或該請求的 SSE）；取消：stdio 送 `notifications/cancelled`，HTTP 關閉回應串流 | 同上 | ✅ |
| 伺服器三種基本元件：Prompts（使用者控制）、Resources（應用程式控制）、Tools（模型控制） | https://modelcontextprotocol.io/specification/2026-07-28/server | ✅ |
| Claude API 的 MCP connector：`mcp_servers` + `tools: [{type: "mcp_toolset"}]`，beta `mcp-client-2025-11-20` | claude-api skill | ✅ 7-5 提一句 |

## 8. 上線現實（模組 8）

| 事實 | 來源 | 可信度 |
|------|------|--------|
| OWASP Top 10 for LLM Applications 2025：LLM01 Prompt Injection（直接與間接） | https://genai.owasp.org/llm-top-10/（二手來源一致） | 🟡 是否有 2026 版：⚠️ 未確認 |
| 「致命三角」（lethal trifecta）：私人資料＋不可信內容＋對外通訊，三者同時存在就可能被資料外洩 | Simon Willison，2025-06-16 | 🟡 |
| 不可信內容（網頁、email、文件、工具輸出）裡的指令要當資料 | 本 repo 安全規範；Anthropic 文件 | ✅ |
| Eval：先有能重跑的測資與評分方式（精確比對、規則、LLM 當裁判、人工），改 prompt 前後都量 | claude-api skill（build-eval） | ✅ |
| 成本槓桿順序：先做免費的（快取、精簡輸入、迴圈衛生、批次），再談取捨（effort、換模型、多模型） | claude-api skill（cost-optimization） | ✅ |
| 快取：前綴比對，任何位元組改變都會讓後面失效；順序 tools → system → messages；`usage.cache_read_input_tokens` 驗證 | claude-api skill | ✅ |
| 延遲：Fast mode（Opus 5.5，$8／$40）輸出速度最高約 2.5 倍，僅 Claude API | 價格頁、claude-api skill | ✅ |
| 判斷成本要看「每完成一個任務」而不是每次請求 | claude-api skill | ✅ |

---

## 9. 未確認清單（課程內會標 ⚠️）

1. OpenAI 是否仍建議新專案用 Chat Completions。
2. OWASP LLM Top 10 是否有 2026 年新版。
3. Voyage 4 系列的價格（只寫「比聊天模型便宜很多」並附官方價格頁連結）。
4. 「串流中止後已產生的 token 仍計費」在 Claude 文件的逐字出處（以「依產生的 token 計費」的一般原則說明）。

## 10. 下次重新查證

**2027-01-22**：Claude 模型與價格、API 版本、MCP 規格、OpenAI 與 Gemini 的主推 API。

---

## 2026-10-29 改版審查

> 改版：不出測驗、每課補「深入」段落、總複習改一頁地圖。查證日期 2026-10-29～30。標記同上（✅ 官方／🟡 第三方或摘要／⚠️ 未查證）。

### 修正的錯誤

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 1-1 | 常見錯誤寫「把金鑰放在 `Authorization: Bearer` 是錯的，要放 `x-api-key`」 | API 兩種標頭都接受；`@anthropic-ai/sdk` 1.0.0 起 SDK 改送 `Authorization: Bearer`。錯誤改成「閘道只認 `x-api-key`，升級 SDK 後被擋」 | https://platform.claude.com/docs/en/api/migration-2026-10-21 ✅ |
| 0-2 | 術語「Claude 的金鑰放在 `x-api-key` 標頭」 | 「放在 `x-api-key` 或 `Authorization: Bearer`；SDK 1.0 起用後者」 | 同上 ✅ |
| 1-2 | 「Claude 4.6 之後的模型不支援預填」 | 「Opus 5.5 等新模型不支援預填」（官方只寫 on models that don't support prefill，未列 4.6 這條界線） | https://platform.claude.com/docs/en/api/messages ✅ |
| 1-2 | 「messages 的第一則要是 user」（說明 system 不能放 messages） | 開頭規則放頂層 `system`；messages 中途的 `role: "system"` 訊息有位置規則（要接在 user 後） | https://platform.claude.com/docs/en/build-with-claude/mid-conversation-system-messages ✅ |
| 7-5 | MCP connector 只寫 beta `mcp-client-2025-11-20` | 補上較新的 `mcp-client-2026-09-15`（可固定工具清單），舊的 `2025-04-04` 已棄用；只能連公開 HTTP server | https://platform.claude.com/docs/en/agents-and-tools/mcp-connector ✅ |
| 4-4（CSS） | 工具迴圈元件在 360px 寬度溢出 | `.tl-lanes`／`.tl-row` 改為可縮欄寬 | audit.mjs 360px 檢查 |

### 重新確認無誤（2026-10-29～30）

| 事實 | 來源 | 可信度 |
|---|---|---|
| 價格：Opus 5.5 $4／$20、Sonnet 5.5 $2／$10、Haiku 5.5 $0.10／$0.50（>10 萬 token $0.50／$2.50）、Fable 5.1 $10／$50；Opus 5.5／Sonnet 5.5 快取讀取 0.05 倍；Batch 5 折；`inference_geo: "us"` ×1.1；Fast mode $8／$40 且不能和 Batch 併用；工具系統提示 286 token | https://platform.claude.com/docs/en/about-claude/pricing | ✅ |
| API 版本 `2026-10-21`：移除 temperature／top_p／top_k；document 不能放 assistant；user text 不能帶 citations；TS SDK 1.0.0 起預設此版本；Tool Runner 移除用戶端 compaction，改用伺服器端 compaction | migration-2026-10-21 | ✅ |
| 中途 system 訊息：支援 Fable 5.1、Opus 5.5、Sonnet 5.5、Haiku 5.5 等；Sonnet 5 不支援；要接在 user 之後；只設 `output_config.effort` 的空訊息可放任何位置 | mid-conversation-system-messages | ✅ |
| 伺服器端工具 `web_search_20260209`；工具三類（自訂、Anthropic 定義的用戶端工具、伺服器端工具）；`disable_parallel_tool_use`；Opus 5.5／Sonnet 5.5 沒有 any／tool 的系統提示數字（不支援強制呼叫） | https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview | ✅ |
| 結構化輸出靠受限解碼；新 schema 首次有編譯延遲；編譯結果自最後使用起快取 24 小時；只改 name／description 不失效 | https://platform.claude.com/docs/en/build-with-claude/structured-outputs | ✅ |
| MCP 目前版本 2026-07-28；每個請求在 `_meta` 的 `io.modelcontextprotocol/protocolVersion` 帶版本，HTTP 另帶 `MCP-Protocol-Version`；`server/discover`；`UnsupportedProtocolVersionError`；握手版為 2025-11-25 及更早 | https://modelcontextprotocol.io/docs/learn/versioning | ✅ |
| pgvector：HNSW `m` 16、`ef_construction` 64、`hnsw.ef_search` 40；近似索引先掃再過濾；0.8.0 起 `hnsw.iterative_scan`；目前 0.8.7 | https://github.com/pgvector/pgvector | ✅ |
| 多 agent 經驗：agent 約 4 倍、多 agent 約 15 倍於聊天的 token（2025-06-13） | https://www.anthropic.com/engineering/multi-agent-research-system | ✅ |

### 補進深入段落的子題（摘要）

- 0-1 API 代做的工作（伺服器端工具、compaction、Managed Agents）；0-2 金鑰從開發到上線的存放、BYOK 與 `dangerouslyAllowBrowser`。
- 1-1 API 版本與升級清單；1-2 長對話三種處理法、同角色合併、中途 system 訊息；1-3 effort 取捨與 `stop_sequence`／`pause_turn`；1-4 tokenizer 差異與 context 上限；1-5 token bucket 與價格乘數。
- 2-1 串流的代價（審查、JSON、引用）；2-2 SSE 解析規則、`input_json_delta`、`signature_delta`；2-3 代理緩衝、Serverless、HTTP/1.1 連線數；2-4 中止後的用量與續寫。
- 3-1 長資料放前面、舊 prompt 習慣；3-2 範例數量、標籤偽造；3-3 思考簽章、effort 救不了的情況；3-4 受限解碼、欄位順序、schema 快取；3-5 三種重試、案件包。
- 4-1 三類工具與伺服器端工具計費；4-2 工具數量、tool search、追問行為；4-3 關閉平行呼叫、tool_result 排列；4-4 確認閘門失效、冪等鍵、復原代替確認。
- 5-1 embedding 的盲點；5-2 高維空間的基準分數、何時不正規化；5-3 HNSW 參數與過濾；5-4 檢索不對稱、voyage-context-4、雙寫遷移。
- 6-1 RAG 五段排查、問題改寫；6-2 父子切塊等策略與重疊成本；6-3 RRF 合併；6-4 引用位置類型與 2026-10-21 規則；6-5 lost in the middle、快取存活時間。
- 7-1 錯誤累積與回饋；7-2 context 管理四法、繞圈偵測；7-3 多 agent 代價；7-4 何時不需要 MCP；7-5 MCP connector 限制與固定工具清單。
- 8-1 評估集大小與信賴區間、裁判偏誤；8-2 快取失效來源；8-3 延遲分位數；8-4 Markdown 圖片外洩等對外管道；8-5 一頁地圖與會過時的內容。

### 未查證或僅第三方

| 項目 | 狀態 |
|---|---|
| OWASP Top 10 for LLM Applications 2026 版：多家資安媒體報導 2026-08 發布；但 genai.owasp.org 與 owasp.org 專案頁截至 2026-10-30 仍列 2025 版 | 🟡 僅第三方，課程照此標示 |
| Contextual Retrieval 入庫成本約每百萬 token 1.02 美元（2024，Claude 3 Haiku 價格） | 🟡 二手轉述，未重讀原文 |
| TS SDK 1.x 是否仍保留 `dangerouslyAllowBrowser` 選項（0.x 確定有） | ⚠️ 未查證 |
| `node --env-file`（Node 20.6 起） | 🟡 依 Node 文件常識，未重讀 |
| 「lost in the middle」（Liu 等人 2023）為學術研究，未附連結 | 🟡 |
| 中途停止後已產生 token 仍計費 | ⚠️ 同 2026-10-22 第 9 節第 4 項，仍未找到逐字出處 |

下次重新查證：**2027-01-29**。
