# 研究紀錄：卡帕西的 4 種 AI 輸出格式

原文：《數位時代》2026-10-02（李先泰）。本書不轉載全文，只做導讀與延伸。

## 2026-10-29 改版審查

查證日期：2026-10-29～30。

### 修正的錯誤或不精確處

| 課 | 原本 | 修正後 | 出處 |
|---|---|---|---|
| 2-4 | API key 環境變數只寫「例如 `ELEVENLABS_API_KEY`」 | 補上變數名稱依工具而定：ElevenLabs 官方範例用 `ELEVENLABS_API_KEY`，manim-voiceover 讀 `ELEVEN_API_KEY` | https://elevenlabs.io/docs/eleven-api/quickstart ✅、https://voiceover.manim.community/en/stable/services.html ✅ |
| 2-1 | 只寫「875 個核准詞」 | 補「約 875（另一常見說法約 900）」並說明出入原因 | https://en.wikipedia.org/wiki/Simplified_Technical_English 🟡 |
| 0-1、首頁說明 | 「摘要、圖解、互動與練習」「選擇題送出後…」 | 改成深入段落與深入思考題的說明 | 改版規範 |

### 補充的子題

| 課 | 子題 | 出處 | 可信度 |
|---|---|---|---|
| 1-1 | 圖為什麼「有時」比較好（Larkin & Simon 1987）；工作記憶約 4 個組塊（Cowan 2001）；文字擅長條件與推理 | https://doi.org/10.1111/j.1551-6708.1987.tb00863.x 、https://doi.org/10.1017/S0140525X01003922 | ✅ 原始論文 |
| 1-2 | 四級的攤提試算；動畫不必然比靜態圖好懂（Tversky 等 2002） | https://doi.org/10.1006/ijhc.2002.1017 | ✅ 原始論文 |
| 2-1 | ASD-STE100 Issue 9（2025-01）、Issue 10 預定 2028-01；1986 年起列入 ATA 規範；受控語言 vs 白話寫作（ISO 24495-1:2023） | https://www.tcworld.info/news/asd-ste100-issue-9-setting-a-standard-for-technical-documentation 🟡、Wikipedia 🟡、https://www.iso.org/standard/78907.html ✅（經標準商店頁確認 2023-06 發布） | Issue 10 日期僅第三方來源 |
| 2-2 | 標籤字數 × 元件數的試算；影像生成 vs 程式碼畫圖；Mermaid 圖表類型；GitHub Markdown 支援 Mermaid | https://mermaid.js.org/intro/ ✅、https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/creating-diagrams ✅ | |
| 2-3 | KV cache 的記憶體代價（Llama 2 7B 每 token 0.5 MB 的試算）；file:// 與 CDN 的邊界；Explorable Explanations | https://arxiv.org/abs/2309.06180 ✅、https://worrydream.com/ExplorableExplanations/ ✅ | Llama 2 7B 設定（32 層、32 頭、128 維）為公開模型設定，計算自行驗算 |
| 2-4 | Manim Community（v0.22.1、建議 uv、LaTeX 可不裝）vs ManimGL；-ql 480p15、-qh 1080p60；manim-voiceover 支援的配音服務 | https://docs.manim.community/en/stable/installation.html ✅、https://docs.manim.community/en/stable/guides/configuration.html ✅、https://voiceover.manim.community/en/stable/services.html ✅ | |
| 3-1 | 錯誤機率試算（至少一個錯的機率）；每一級的核對方法；自我檢查的限制 | 機率為自行計算 | |
| 3-2 | 改寫成一頁地圖：全書架構、每模組最重要的行動、會過時的內容 | — | |

### 未查證

- ASD-STE100 官網（about 頁）回傳 403，「客戶 80% 不以英文為母語」沿用原文說法，⚠️ 未查證。
- 卡帕西 X 貼文原文（2026-10-02）無法直接讀取；只找到第三方轉述「80% of the way to ASD-STE100」，🟡 間接確認。
- 各家 AI 聊天介面是否直接顯示 Mermaid 或 HTML 預覽：課文標「依產品而定，未逐一查證」。
- 「多數瀏覽器在 file:// 下擋掉讀取同資料夾檔案」：依已知瀏覽器行為，本次未另查官方文件，⚠️ 未查證。
