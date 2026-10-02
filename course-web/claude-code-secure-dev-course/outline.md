# 課程架構：用 Claude Code ／ Cowork 安全地開發軟體

> 版本：v1（2026-10-02）・ 依據：`research-notes.md`（查證 2026-10-02）
> **9 個模組、29 個單元**，每單元 6–12 分鐘，總閱讀約 4.5–5.5 小時
> 對象：會寫一點程式、想把 AI agent 正式用在開發流程的人；不需要資安背景

---

## A. 全站學習設計

### A-1 每個單元的固定結構

照 skill 的 `content-rules.md` 第 1 節：資訊列 → 學到 3 件事 → 暖身回顧 → 比喻＋限制 → 心智模型 SVG → 正式定義 → 壞／好對照＋半成品 → 3 個常見錯誤 → 3 題練習（回想／應用／遷移）→ 三個重點 → 頁尾。

### A-2 與既有規範的取捨

| 項目 | domain-education-content | 本 skill | 採用 | 理由 |
|------|-----|-----|------|------|
| 每課長度 | 20–30 分鐘 | 5–12 分鐘 | **6–12 分鐘** | 網站單元短比較好推進；實作後 3-1、4-3、7-1、7-3、8-2 為 13–15 分鐘（程式碼範例與總複習題較多），見 HANDOFF.md |
| 8-1、8-2 的結構 | 每課固定結構 | 同 | **範本庫與測驗頁，不套用固定結構** | 這兩課是查閱與總複習用，保留 2 張圖與來源 |
| 範例形式 | 壞 → 好 prompt | 同 | **壞 → 好的 prompt、設定檔、指令三種** | 這門課的「好做法」常是 settings.json 或 hook，不只是 prompt |
| 練習題型 | 選擇＋思考題 | 選擇題每選項附解析 | **每課 3 題，至少 2 題情境題；選擇題為主，遷移題可用「先思考再展開」** | 照 skill 規則 6 |
| 外部套件 | — | 只用 Google Fonts、cdnjs | **highlight.js 11.11.2（cdnjs＋SRI）**，不加 BudouX | 標題用 `\|` 斷點即可；BudouX 要新增相依，先不加 |

### A-3 間隔複習排程

| 正在讀 | 暖身題來自 |
|------|------|
| 模組 1 | 0 |
| 模組 2 | 1 |
| 模組 3 | 2、1 |
| 模組 4 | 3、1 |
| 模組 5 | 4、2 |
| 模組 6 | 5、3 |
| 模組 7 | 6、4、1 |
| 模組 8 | 不放暖身；改成總複習測驗（15 題，混合模組 1–7） |

### A-4 互動元件位置

| 元件 | 出現位置 |
|------|------|
| 側欄（可拖曳寬度）＋字級調整 | 全站 |
| 術語 popup | 全站 |
| 對照器（壞 → 好） | 每課範例 |
| 程式碼區塊（highlight.js、複製） | 模組 1、3、4、5、7、8 |
| Agentic loop 逐步播放 | 1-1 |
| 權限規則評估模擬器（輸入指令 → 看 deny/ask/allow 判定） | 4-2 |
| Context 用量滑桿（對話長度 × cache 命中 → 估算相對成本） | 6-1 |
| 選擇題／先思考再展開 | 每課 |

---

## B. 模組與單元

格式：`ID 標題（用 | 標斷點）` ・ 目標 ・ 圖 1（心智模型）／圖 2（範例或比較）・ 情境

### 模組 0　開始之前（色 `#FFD60A`）

**0-1 Claude Code|與 Cowork|各做什麼**
- 目標：分清楚兩個工具的適用範圍，知道這門課的安全主軸「請求 vs 強制」
- 圖 1：維恩圖：Claude Code（終端機、repo、測試）／Cowork（文件、試算表、資料夾、排程）／共同（agent loop、權限模式、MCP、skills）
- 圖 2：一個功能從需求到上線的時間軸，標出每段用哪個工具
- 情境：職場（PM 交規格）、程式（實作）、生活（整理發票資料夾）

**0-2 安裝與|第一個安全的 session**
- 目標：安裝、確認版本、在專案子目錄啟動（不在家目錄）、看懂 trust 對話框
- 圖 1：啟動流程圖：安裝 → `claude --version` → cd 專案 → trust 對話框 → 第一個唯讀問題
- 圖 2：「在哪裡啟動」對照：家目錄 vs 專案資料夾（trust 是否被記住、讀取範圍）

### 模組 1　Claude Code 的基本工作流（色 `#FF8FAB`）

**1-1 Agentic loop|與 checkpoint**
- 圖 1：可逐步播放的環狀圖：蒐集 context → 行動 → 驗證
- 圖 2：checkpoint 涵蓋範圍：檔案工具的編輯 ✓、bash 的變更 ✗、外部系統 ✗ → 所以還是要 git

**1-2 先探索、再計畫、|最後才動手**
- 圖 1：四階段流程（探索 → 計畫 → 實作 → 提交），標出 plan mode 在哪一段
- 圖 2：「一句話說得完的 diff 跳過計畫」決策樹

**1-3 CLAUDE.md|是請求，不是規則**
- 圖 1：載入順序巢狀方框（managed → user → project → local → 子目錄）
- 圖 2：長條圖：CLAUDE.md 行數 vs 每次請求的固定成本；「同錯兩次才寫進去」
- 關鍵觀念：安全相關的「一定要」不放 CLAUDE.md，放 deny 規則或 hook（模組 3、4 的伏筆）

**1-4 給它|驗證自己的方法**
- 圖 1：管線圖：需求 → 測試／建置／`/verify` → 結果回饋給 Claude
- 圖 2：有驗證 vs 沒驗證的糾正次數對照（概念圖，不放數據）

### 模組 2　Cowork 在開發流程裡（色 `#5AA9FF`）

**2-1 Cowork 的|執行環境與邊界**
- 圖 1：架構圖：雲端沙箱（proxy、允許清單）／本機 Desktop（連接的資料夾）／connector token 不進沙箱
- 圖 2：三種權限模式比較表（Manual／Auto／Skip）＋刪除保護
- 時效提醒：2026-10-06 起新任務預設在雲端

**2-2 用 Cowork|處理開發周邊工作**
- 範例：會議記錄 → 規格草稿、測試結果 CSV → 試算表與圖表、版本紀錄草稿
- 圖 1：分工流程：Cowork 產規格 → Claude Code 實作 → Cowork 整理發布說明
- 圖 2：「適合／不適合 Cowork」對照表

**2-3 Cowork|安全使用守則**
- 圖 1：prompt injection 的兩個條件（讀到不可信內容 × 能做有後果的動作）交集圖
- 圖 2：專用工作資料夾 vs 整個家目錄的影響範圍對照
- 情境：排程任務、瀏覽器、connector

### 模組 3　擴充與自動化（色 `#7CE577`）

**3-1 Skills：|把重複流程打包**
- 圖 1：漸進式載入：開始時只有描述 → 叫用時載入全文 → 參考檔
- 圖 2：CLAUDE.md vs skill 的 context 成本對照

**3-2 Subagent|與 worktree 平行開發**
- 圖 1：主 session 與 subagent 的 context 隔離圖
- 圖 2：`claude --worktree` 平行分支示意

**3-3 Hooks：|一定要發生的事**
- 圖 1：生命週期事件時間軸（SessionStart → PreToolUse → PostToolUse → Stop）
- 圖 2：protect-files.sh 判斷流程（exit 0 放行／exit 2 阻擋）
- 程式碼：官方 protect-files.sh、PostToolUse 自動格式化

**3-4 MCP 與 plugin|的信任問題**
- 圖 1：MCP server 在信任邊界的位置（本機 server 以完整權限執行、在 sandbox 外）
- 圖 2：`.mcp.json` 審查清單流程
- 關鍵：Anthropic 不稽核 MCP server；CLI 工具比 MCP 省 context

### 模組 4　權限與隔離（色 `#FFA94D`）

**4-1 六種權限模式|與 auto mode**
- 圖 1：自主程度光譜（Manual → acceptEdits → plan → auto → dontAsk → bypass）
- 圖 2：auto mode 評估順序流程圖（規則 → 唯讀／工作目錄編輯 → 分類器 → 阻擋原因）

**4-2 allow、ask、deny|規則怎麼寫**
- 圖 1：deny → ask → allow 漏斗
- 圖 2：互動模擬器：輸入指令，顯示判定與理由
- 範例：`Bash(ls *)` vs `Bash(ls*)`、複合指令拆分、`Read(./.env)` 的極限

**4-3 Sandbox：|作業系統層級的圍牆**
- 圖 1：圍牆圖：sandbox 內（bash 指令與子程序）／外（檔案工具、hooks、MCP）
- 圖 2：檔案系統 × 網路兩層，少一層會怎樣
- 限制：原生 Windows 不支援、預設可讀 `~/.ssh` → `credentials` 設定

**4-4 容器、VM|與 bypass 模式**
- 圖 1：隔離強度階梯：權限規則 → sandbox → dev container → VM → 雲端 session
- 圖 2：bypass 在主機 vs 在容器的影響範圍

### 模組 5　資安：AI 寫的程式碼（色 `#B9A3FF`）

**5-1 Prompt injection|與信任邊界**
- 圖 1：直接 vs 間接注入（藏在 issue、README、網頁、MCP 回傳）
- 圖 2：`claude -p` 在陌生 repo 會執行什麼：互動 vs headless 對照表
- 範例：`--setting-sources user`、`--bare`

**5-2 OWASP Top 10|對照 AI 常犯的漏洞**
- 圖 1：A01–A10 長條清單，標出 AI 生成程式碼最常踩的（存取控制、注入、設定錯誤、例外處理）
- 圖 2：壞／好程式碼對照：字串拼 SQL → 參數化查詢；只檢查登入 → 檢查擁有者

**5-3 秘密資訊|與供應鏈**
- 圖 1：秘密外洩路徑圖（.env → 讀取 → transcript／commit／外送）與每段的防線
- 圖 2：slopsquatting 流程：模型編出套件名 → 攻擊者搶註 → 安裝執行 postinstall
- 標註：數據來自第三方研究

**5-4 四層安全審查**
- 圖 1：防禦縱深堆疊：寫的當下 → 分支 → 深度掃描 → PR → CI
- 圖 2：各工具比較表（何時跑、會不會阻擋、成本、方案）

### 模組 6　效能與成本（色 `#4FE0E0`）

**6-1 Context 是錢|也是品質**
- 圖 1：每次請求帶完整對話的堆疊圖；cache 命中 vs miss
- 圖 2：互動滑桿：對話長度、離開時間 → 相對成本
- 指令：`/usage`、`/context`、`/clear`、`/compact`

**6-2 模型、effort|與 fast mode 的選擇**
- 圖 1：速度 × 成本 × 能力 的取捨圖
- 圖 2：決策樹：什麼任務用哪個組合

**6-3 讓 Claude|做效能優化：先量再改**
- 圖 1：量測 → 假設 → 改一處 → 再量測 循環
- 圖 2：Core Web Vitals 門檻條（LCP 2.5s、INP 200ms、CLS 0.1）
- 範例：壞 prompt「讓網站變快」→ 好 prompt（附基準數據、驗證指令、不准改的地方）

### 模組 7　團隊與 CI（色 `#FF7A6B`）

**7-1 Headless 與|GitHub Actions 安全設定**
- 圖 1：觸發 → 權限檢查 → 執行 → 結果回寫 管線
- 圖 2：workflow 權限最小化對照（壞：全開；好：只給需要的）

**7-2 Code Review|與 REVIEW.md**
- 圖 1：多 agent 審查 → 驗證 → 去重 → 依嚴重度排序
- 圖 2：嚴重度三色與「不阻擋合併」的位置

**7-3 團隊治理：|managed settings 與監控**
- 圖 1：設定優先順序金字塔（managed 最高）
- 圖 2：OpenTelemetry 監控流向

### 模組 8　總整理（色 `#B5F04A`）

**8-1 安全開發|設定範本庫**
- settings.json（deny 規則＋sandbox）、protect-files hook、security-guidance 設定、REVIEW.md、GitHub workflow 範本
- 圖 1：一個 repo 的 `.claude/` 目錄樹，標每個檔案的作用
- 圖 2：上線前檢查流程

**8-2 總複習測驗**
- 15 題，混合模組 1–7；每題附來源單元連結

---

## C. 實作規模預估

- 單元 29 個 × 至少 2 張 SVG ＝ 至少 58 張圖
- 選擇題約 29 × 3 ＋ 暖身約 40 ＋ 總複習 15 ≈ 140 題
- 檔案預估 350–450KB（單一 `index.html`）
- 實作分段：骨架＋元件頁 → 模組 0–2 → 模組 3–5 → 模組 6–8 → 驗證；每段結束回報一次
